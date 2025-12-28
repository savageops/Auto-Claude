"""
Path Validation Module
======================

Security validation for user-provided paths to prevent command injection,
path traversal, and other vulnerabilities.

Based on commit 9734b70 from parent project - ports frontend TypeScript
validation logic to Python backend.
"""

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


# Dangerous shell metacharacters that could enable command injection
# Note: Backslashes are excluded from this pattern as they're valid Windows path separators
# Path-specific validation should be done separately
DANGEROUS_SHELL_CHARS = re.compile(r'[;|&<>$`\(\)\{\}\[\]\r\n]')

# Allowlist of safe Python commands (simple names only)
PYTHON_ALLOWLIST = [
    'python',
    'python3',
    'python3.10',
    'python3.11',
    'python3.12',
    'python3.13',
    'py',
]


@dataclass
class ValidationResult:
    """Result of path validation."""
    valid: bool
    sanitized_path: str | None = None
    reason: str | None = None


def validate_python_path(python_path: str) -> ValidationResult:
    """
    Validate a user-provided Python executable path.

    Five-layer security validation:
    1. Check for shell metacharacters (command injection prevention)
    2. Validate against allowlist (if simple command)
    3. Verify file exists (path traversal prevention)
    4. Verify file is executable
    5. Confirm it's actually Python via --version

    Args:
        python_path: User-provided Python executable path

    Returns:
        ValidationResult with valid flag, sanitized path, or error reason

    Examples:
        >>> validate_python_path("python3")
        ValidationResult(valid=True, sanitized_path="python3", reason=None)

        >>> validate_python_path("/usr/bin/python3.12")
        ValidationResult(valid=True, sanitized_path="/usr/bin/python3.12", reason=None)

        >>> validate_python_path("python3; rm -rf /")
        ValidationResult(valid=False, sanitized_path=None, reason="Path contains dangerous shell metacharacters")
    """
    if not python_path or not python_path.strip():
        return ValidationResult(valid=False, reason="Python path is empty")

    clean_path = python_path.strip()

    # Layer 1: Check for shell metacharacters
    if DANGEROUS_SHELL_CHARS.search(clean_path):
        return ValidationResult(
            valid=False,
            reason=f"Path contains dangerous shell metacharacters: {clean_path}"
        )

    # Layer 2: If it's a simple command name, validate against allowlist
    if _is_simple_command(clean_path):
        if clean_path.lower() in PYTHON_ALLOWLIST:
            # Verify it's actually Python
            if _verify_is_python(clean_path):
                return ValidationResult(valid=True, sanitized_path=clean_path)
            else:
                return ValidationResult(
                    valid=False,
                    reason=f"Command '{clean_path}' does not appear to be Python"
                )
        else:
            return ValidationResult(
                valid=False,
                reason=f"Command '{clean_path}' is not in the allowlist of safe Python commands"
            )

    # Layer 3: Full path - verify file exists
    path_obj = Path(clean_path)
    if not path_obj.exists():
        return ValidationResult(
            valid=False,
            reason=f"Python executable not found: {clean_path}"
        )

    if not path_obj.is_file():
        return ValidationResult(
            valid=False,
            reason=f"Path is not a file: {clean_path}"
        )

    # Layer 4: Verify file is executable
    if not os.access(path_obj, os.X_OK):
        return ValidationResult(
            valid=False,
            reason=f"File is not executable: {clean_path}"
        )

    # Layer 5: Confirm it's actually Python
    if not _verify_is_python(str(path_obj)):
        return ValidationResult(
            valid=False,
            reason=f"Executable is not Python: {clean_path}"
        )

    return ValidationResult(valid=True, sanitized_path=str(path_obj.resolve()))


def validate_git_ref(ref: str) -> ValidationResult:
    """
    Validate a git reference (branch name, tag, commit hash).

    Prevents command injection via malicious git arguments.

    Args:
        ref: Git reference to validate

    Returns:
        ValidationResult with valid flag or error reason

    Examples:
        >>> validate_git_ref("main")
        ValidationResult(valid=True, sanitized_path="main", reason=None)

        >>> validate_git_ref("feature/auth")
        ValidationResult(valid=True, sanitized_path="feature/auth", reason=None)

        >>> validate_git_ref("main; rm -rf /")
        ValidationResult(valid=False, sanitized_path=None, reason="Git ref contains dangerous characters")
    """
    if not ref or not ref.strip():
        return ValidationResult(valid=False, reason="Git ref is empty")

    clean_ref = ref.strip()

    # Check for shell metacharacters
    if DANGEROUS_SHELL_CHARS.search(clean_ref):
        return ValidationResult(
            valid=False,
            reason=f"Git ref contains dangerous characters: {clean_ref}"
        )

    # Additional git-specific validation
    # Git refs cannot contain: space, ~, ^, :, ?, *, [, \, .., @{, //
    git_forbidden = re.compile(r'[\s~^:?*\[\\]|\.\.|@\{|//')
    if git_forbidden.search(clean_ref):
        return ValidationResult(
            valid=False,
            reason=f"Git ref contains forbidden characters: {clean_ref}"
        )

    # Cannot start with - (would be interpreted as option)
    if clean_ref.startswith('-'):
        return ValidationResult(
            valid=False,
            reason=f"Git ref cannot start with '-': {clean_ref}"
        )

    return ValidationResult(valid=True, sanitized_path=clean_ref)


def validate_file_path(file_path: str, base_dir: Path | None = None) -> ValidationResult:
    """
    Validate a file path for path traversal attacks.

    Args:
        file_path: User-provided file path
        base_dir: Base directory to constrain path within (optional)

    Returns:
        ValidationResult with valid flag or error reason

    Examples:
        >>> validate_file_path("config.json")
        ValidationResult(valid=True, sanitized_path="config.json", reason=None)

        >>> validate_file_path("../../../etc/passwd")
        ValidationResult(valid=False, sanitized_path=None, reason="Path traversal detected")
    """
    if not file_path or not file_path.strip():
        return ValidationResult(valid=False, reason="File path is empty")

    clean_path = file_path.strip()

    # Check for shell metacharacters
    if DANGEROUS_SHELL_CHARS.search(clean_path):
        return ValidationResult(
            valid=False,
            reason=f"Path contains dangerous shell metacharacters: {clean_path}"
        )

    path_obj = Path(clean_path)

    # If base_dir specified, resolve path relative to it
    if base_dir:
        # For relative paths, join with base_dir first
        if not path_obj.is_absolute():
            path_obj = base_dir / path_obj

    # Resolve to absolute path to detect traversal
    try:
        resolved = path_obj.resolve()
    except (OSError, RuntimeError) as e:
        return ValidationResult(
            valid=False,
            reason=f"Invalid path: {e}"
        )

    # If base_dir specified, ensure resolved path is within it
    if base_dir:
        try:
            base_resolved = base_dir.resolve()
            resolved.relative_to(base_resolved)
        except ValueError:
            return ValidationResult(
                valid=False,
                reason=f"Path traversal detected: {clean_path} resolves outside {base_dir}"
            )

    return ValidationResult(valid=True, sanitized_path=str(resolved))


# Private helper functions

def _is_simple_command(path: str) -> bool:
    """Check if path is a simple command name (no slashes)."""
    return '/' not in path and '\\' not in path


def _verify_is_python(executable: str) -> bool:
    """
    Verify an executable is actually Python by running --version.

    Args:
        executable: Path to executable or command name

    Returns:
        True if executable is Python, False otherwise
    """
    try:
        # Try to run with --version
        result = subprocess.run(
            [executable, '--version'],
            capture_output=True,
            text=True,
            timeout=5,
            check=False
        )

        # Check if output contains "Python"
        output = (result.stdout + result.stderr).lower()
        return 'python' in output

    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return False
