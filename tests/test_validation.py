"""
Tests for core.validation module
=================================

Validates path security validation functions.
"""

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from apps.backend.core.validation import (
    DANGEROUS_SHELL_CHARS,
    PYTHON_ALLOWLIST,
    ValidationResult,
    validate_file_path,
    validate_git_ref,
    validate_python_path,
)


class TestValidatePythonPath:
    """Test Python executable path validation."""

    def test_empty_path_rejected(self):
        """Empty paths should be rejected."""
        result = validate_python_path("")
        assert not result.valid
        assert "empty" in result.reason.lower()

    def test_whitespace_only_rejected(self):
        """Whitespace-only paths should be rejected."""
        result = validate_python_path("   ")
        assert not result.valid
        assert "empty" in result.reason.lower()

    @pytest.mark.parametrize("dangerous_char", [';', '|', '&', '<', '>', '$', '`', '(', ')', '{', '}', '[', ']', '\r', '\n'])
    def test_shell_metacharacters_rejected(self, dangerous_char):
        """Paths with shell metacharacters should be rejected."""
        malicious_path = f"python3{dangerous_char}echo hacked"
        result = validate_python_path(malicious_path)
        assert not result.valid
        assert "metacharacters" in result.reason.lower() or "dangerous" in result.reason.lower()

    def test_command_injection_attempt_rejected(self):
        """Command injection attempts should be rejected."""
        result = validate_python_path("python3; rm -rf /")
        assert not result.valid
        assert "metacharacters" in result.reason.lower()

    @pytest.mark.parametrize("python_cmd", PYTHON_ALLOWLIST)
    @patch('apps.backend.core.validation._verify_is_python')
    def test_allowlisted_commands_accepted(self, mock_verify, python_cmd):
        """Allowlisted Python commands should be accepted if they verify."""
        mock_verify.return_value = True
        result = validate_python_path(python_cmd)
        assert result.valid
        assert result.sanitized_path == python_cmd
        mock_verify.assert_called_once_with(python_cmd)

    @patch('apps.backend.core.validation._verify_is_python')
    def test_allowlisted_command_not_python_rejected(self, mock_verify):
        """Allowlisted command that isn't actually Python should be rejected."""
        mock_verify.return_value = False
        result = validate_python_path("python3")
        assert not result.valid
        assert "does not appear to be python" in result.reason.lower()

    def test_non_allowlisted_simple_command_rejected(self):
        """Simple commands not in allowlist should be rejected."""
        result = validate_python_path("malicious_executable")
        assert not result.valid
        assert "not in the allowlist" in result.reason.lower()

    def test_nonexistent_full_path_rejected(self):
        """Full paths to nonexistent files should be rejected."""
        result = validate_python_path("/nonexistent/path/to/python")
        assert not result.valid
        assert "not found" in result.reason.lower()

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.is_file')
    def test_directory_path_rejected(self, mock_is_file, mock_exists):
        """Paths to directories should be rejected."""
        mock_exists.return_value = True
        mock_is_file.return_value = False
        result = validate_python_path("/usr/bin")
        assert not result.valid
        assert "not a file" in result.reason.lower()

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.is_file')
    @patch('os.access')
    def test_non_executable_file_rejected(self, mock_access, mock_is_file, mock_exists):
        """Non-executable files should be rejected."""
        mock_exists.return_value = True
        mock_is_file.return_value = True
        mock_access.return_value = False
        result = validate_python_path("/path/to/non_executable")
        assert not result.valid
        assert "not executable" in result.reason.lower()

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.is_file')
    @patch('os.access')
    @patch('apps.backend.core.validation._verify_is_python')
    def test_executable_not_python_rejected(self, mock_verify, mock_access, mock_is_file, mock_exists):
        """Executable files that aren't Python should be rejected."""
        mock_exists.return_value = True
        mock_is_file.return_value = True
        mock_access.return_value = True
        mock_verify.return_value = False
        result = validate_python_path("/usr/bin/bash")
        assert not result.valid
        assert "not python" in result.reason.lower()

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.is_file')
    @patch('os.access')
    @patch('apps.backend.core.validation._verify_is_python')
    @patch('pathlib.Path.resolve')
    def test_valid_full_path_accepted(self, mock_resolve, mock_verify, mock_access, mock_is_file, mock_exists):
        """Valid full paths to Python executables should be accepted."""
        mock_exists.return_value = True
        mock_is_file.return_value = True
        mock_access.return_value = True
        mock_verify.return_value = True

        # Use platform-appropriate path separator
        expected_path = str(Path("/usr/bin/python3.12").resolve())
        mock_resolve.return_value = Path(expected_path)

        result = validate_python_path("/usr/bin/python3.12")
        assert result.valid
        assert result.sanitized_path == expected_path

    def test_current_python_executable_accepted(self):
        """Current Python executable should be accepted (real system test)."""
        result = validate_python_path(sys.executable)
        assert result.valid
        assert result.sanitized_path is not None


class TestVerifyIsPython:
    """Test Python executable verification."""

    def test_current_python_verifies(self):
        """Current Python executable should verify successfully."""
        from apps.backend.core.validation import _verify_is_python
        assert _verify_is_python(sys.executable)

    @patch('subprocess.run')
    def test_timeout_returns_false(self, mock_run):
        """Timeout should return False."""
        from apps.backend.core.validation import _verify_is_python
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="python", timeout=5)
        assert not _verify_is_python("python")

    @patch('subprocess.run')
    def test_file_not_found_returns_false(self, mock_run):
        """FileNotFoundError should return False."""
        from apps.backend.core.validation import _verify_is_python
        mock_run.side_effect = FileNotFoundError()
        assert not _verify_is_python("/nonexistent/python")

    @patch('subprocess.run')
    def test_permission_error_returns_false(self, mock_run):
        """PermissionError should return False."""
        from apps.backend.core.validation import _verify_is_python
        mock_run.side_effect = PermissionError()
        assert not _verify_is_python("/path/to/python")

    @patch('subprocess.run')
    def test_output_without_python_returns_false(self, mock_run):
        """Output not containing 'Python' should return False."""
        from apps.backend.core.validation import _verify_is_python
        mock_result = MagicMock()
        mock_result.stdout = "Bash version 5.0"
        mock_result.stderr = ""
        mock_run.return_value = mock_result
        assert not _verify_is_python("/bin/bash")

    @patch('subprocess.run')
    def test_output_with_python_returns_true(self, mock_run):
        """Output containing 'Python' should return True."""
        from apps.backend.core.validation import _verify_is_python
        mock_result = MagicMock()
        mock_result.stdout = "Python 3.12.0"
        mock_result.stderr = ""
        mock_run.return_value = mock_result
        assert _verify_is_python("python3")


class TestValidateGitRef:
    """Test git reference validation."""

    def test_empty_ref_rejected(self):
        """Empty refs should be rejected."""
        result = validate_git_ref("")
        assert not result.valid
        assert "empty" in result.reason.lower()

    def test_simple_branch_names_accepted(self):
        """Simple branch names should be accepted."""
        for ref in ["main", "develop", "feature", "bugfix"]:
            result = validate_git_ref(ref)
            assert result.valid, f"Failed for {ref}: {result.reason}"
            assert result.sanitized_path == ref

    def test_branch_with_slashes_accepted(self):
        """Branch names with slashes should be accepted."""
        result = validate_git_ref("feature/auth")
        assert result.valid
        assert result.sanitized_path == "feature/auth"

    def test_commit_hash_accepted(self):
        """Commit hashes should be accepted."""
        result = validate_git_ref("a1b2c3d4e5f6")
        assert result.valid

    @pytest.mark.parametrize("dangerous_char", [';', '|', '&', '<', '>', '$', '`', '(', ')'])
    def test_shell_metacharacters_rejected(self, dangerous_char):
        """Refs with shell metacharacters should be rejected."""
        malicious_ref = f"main{dangerous_char}rm -rf /"
        result = validate_git_ref(malicious_ref)
        assert not result.valid
        assert "dangerous" in result.reason.lower()

    @pytest.mark.parametrize("forbidden", ['~', '^', ':', '?', '*', '[', '..', '@{', '//'])
    def test_git_forbidden_characters_rejected(self, forbidden):
        """Refs with git-forbidden characters should be rejected."""
        result = validate_git_ref(f"branch{forbidden}name")
        assert not result.valid
        # [ and @{ are caught by DANGEROUS_SHELL_CHARS first, so accept either message
        assert "forbidden" in result.reason.lower() or "dangerous" in result.reason.lower()

    def test_ref_starting_with_dash_rejected(self):
        """Refs starting with dash should be rejected (would be interpreted as option)."""
        result = validate_git_ref("-main")
        assert not result.valid
        assert "cannot start with '-'" in result.reason.lower()

    def test_whitespace_stripped(self):
        """Leading/trailing whitespace should be stripped."""
        result = validate_git_ref("  main  ")
        assert result.valid
        assert result.sanitized_path == "main"


class TestValidateFilePath:
    """Test file path validation."""

    def test_empty_path_rejected(self):
        """Empty paths should be rejected."""
        result = validate_file_path("")
        assert not result.valid
        assert "empty" in result.reason.lower()

    def test_shell_metacharacters_rejected(self):
        """Paths with shell metacharacters should be rejected."""
        result = validate_file_path("file.txt; rm -rf /")
        assert not result.valid
        assert "metacharacters" in result.reason.lower()

    def test_simple_filename_accepted(self):
        """Simple filenames should be accepted."""
        result = validate_file_path("config.json")
        assert result.valid
        assert result.sanitized_path is not None

    def test_relative_path_accepted(self):
        """Relative paths should be accepted."""
        result = validate_file_path("src/config.json")
        assert result.valid

    def test_path_traversal_detected_with_base_dir(self, tmp_path):
        """Path traversal should be detected when base_dir is specified."""
        base = tmp_path / "project"
        base.mkdir()

        # Try to escape base directory
        result = validate_file_path("../../../etc/passwd", base_dir=base)
        assert not result.valid
        assert "traversal" in result.reason.lower()

    def test_path_within_base_dir_accepted(self, tmp_path):
        """Paths within base_dir should be accepted."""
        base = tmp_path / "project"
        base.mkdir()

        result = validate_file_path("config.json", base_dir=base)
        assert result.valid
        # Should resolve to absolute path within base
        assert str(base) in result.sanitized_path

    def test_absolute_path_accepted(self, tmp_path):
        """Absolute paths should be accepted (if no base_dir constraint)."""
        test_file = tmp_path / "test.txt"
        test_file.touch()

        result = validate_file_path(str(test_file))
        assert result.valid
        assert result.sanitized_path == str(test_file.resolve())


class TestDangerousShellCharsPattern:
    """Test the DANGEROUS_SHELL_CHARS regex pattern."""

    @pytest.mark.parametrize("char", [';', '|', '&', '<', '>', '$', '`', '(', ')', '{', '}', '[', ']', '\r', '\n'])
    def test_detects_dangerous_characters(self, char):
        """Pattern should detect all dangerous shell characters (excluding backslash for Windows paths)."""
        assert DANGEROUS_SHELL_CHARS.search(f"text{char}text") is not None

    @pytest.mark.parametrize("safe_text", [
        "simple_filename.txt",
        "path/to/file",
        "command-with-dashes",
        "file_123.txt",
        "UPPERCASE.TXT",
        "C:\\Windows\\System32",  # Backslashes allowed for Windows paths
        "D:\\path\\to\\file.txt",
    ])
    def test_allows_safe_characters(self, safe_text):
        """Pattern should not match safe text (including Windows paths with backslashes)."""
        assert DANGEROUS_SHELL_CHARS.search(safe_text) is None
