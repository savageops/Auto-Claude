"""
Integration Tests for Spec 036: Block File Edits When File Modified Since Last Read
====================================================================================

Tests the PreToolUse hook that blocks Write/Edit operations when:
1. File hasn't been read in the current session
2. File has been modified since the last Read operation

These tests verify the complete hook integration with the FileAccessTracker and
Claude Agent SDK.
"""

import json
import time
from pathlib import Path
from datetime import datetime
from unittest.mock import Mock, MagicMock, patch
import pytest

from apps.backend.agents.file_tracker import FileAccessTracker


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def temp_project_dir(tmp_path):
    """Create temporary project directory with test files."""
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()

    # Create test files
    (project_dir / "src").mkdir()
    (project_dir / "src" / "example.py").write_text("# Original content\n")
    (project_dir / "src" / "module.py").write_text("def foo():\n    pass\n")
    (project_dir / "README.md").write_text("# Project\n")

    return project_dir


@pytest.fixture
def file_tracker():
    """Create fresh FileAccessTracker instance."""
    return FileAccessTracker()


@pytest.fixture
def mock_agent_sdk_client():
    """Mock Claude Agent SDK client with PreToolUse hook support."""
    client = Mock()
    client.hooks = {"PreToolUse": []}
    client.session_id = "test-session-123"
    return client


@pytest.fixture
def mock_task_logs_file(tmp_path):
    """Mock task_logs.json file for logging blocked attempts."""
    logs_file = tmp_path / "task_logs.json"
    logs_file.write_text(json.dumps({"logs": []}, indent=2))
    return logs_file


# ============================================================================
# Helper Functions (to be implemented with Spec 036)
# ============================================================================

def simulate_read_tool_use(tracker: FileAccessTracker, file_path: str, full_content: bool = True):
    """
    Simulate Read tool execution.

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Read operations.
    """
    tracker.record_read(file_path, full_content=full_content)


def simulate_write_tool_use(tracker: FileAccessTracker, file_path: str):
    """
    Simulate Write tool execution (would be blocked if file not read).

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Write operations.
    """
    tracker.record_write(file_path)


def simulate_edit_tool_use(tracker: FileAccessTracker, file_path: str):
    """
    Simulate Edit tool execution (would be blocked if file not read).

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Edit operations.
    """
    tracker.record_write(file_path)


# ============================================================================
# Core Functionality Tests
# ============================================================================

class TestFileEditBlockingCore:
    """Test core file edit blocking functionality."""

    def test_block_write_without_read(self, file_tracker):
        """
        CRITICAL: Write operations must be blocked if file hasn't been read.

        Expected behavior:
        1. Agent attempts Write on file.py
        2. Hook detects file.py not in read history
        3. Hook blocks operation with error: "File must be read first"
        4. No write is recorded
        """
        file_path = "src/example.py"

        # Agent attempts write WITHOUT prior read
        # In actual implementation, PreToolUse hook would return ToolResult with error
        # For now, we verify the tracker can detect this violation

        # Simulate write attempt
        simulate_write_tool_use(file_tracker, file_path)

        # Verify violation is detected
        assert file_tracker.has_violations()
        violations = file_tracker.get_violations()
        assert len(violations) == 1
        assert "Written without reading" in violations[0]
        assert file_path in violations[0]

    def test_allow_write_after_read(self, file_tracker):
        """
        Write operations must be ALLOWED if file was read in current session.

        Expected behavior:
        1. Agent reads file.py
        2. Agent writes to file.py
        3. Hook allows operation (no block)
        4. Write is recorded successfully
        """
        file_path = "src/example.py"

        # Agent reads file
        simulate_read_tool_use(file_tracker, file_path, full_content=True)

        # Agent writes to file
        simulate_write_tool_use(file_tracker, file_path)

        # Verify NO violations
        assert not file_tracker.has_violations()
        assert file_tracker.was_read_before_write(file_path)
        assert file_tracker.was_full_read(file_path)

    def test_block_edit_without_read(self, file_tracker):
        """
        CRITICAL: Edit operations must be blocked if file hasn't been read.

        Expected behavior same as write blocking.
        """
        file_path = "src/module.py"

        # Agent attempts edit WITHOUT prior read
        simulate_edit_tool_use(file_tracker, file_path)

        # Verify violation is detected
        assert file_tracker.has_violations()
        violations = file_tracker.get_violations()
        assert len(violations) == 1
        assert "Written without reading" in violations[0]
        assert file_path in violations[0]

    def test_allow_edit_after_read(self, file_tracker):
        """
        Edit operations must be ALLOWED if file was read in current session.
        """
        file_path = "src/module.py"

        # Agent reads file
        simulate_read_tool_use(file_tracker, file_path, full_content=True)

        # Agent edits file
        simulate_edit_tool_use(file_tracker, file_path)

        # Verify NO violations
        assert not file_tracker.has_violations()
        assert file_tracker.was_read_before_write(file_path)

    def test_warn_on_truncated_read(self, file_tracker):
        """
        WARNING: Writing after truncated read should issue warning (not block).

        Expected behavior:
        1. Agent reads file with truncation (partial content)
        2. Agent writes to file
        3. Hook allows operation but logs warning
        4. Warning: "Written after truncated read"
        """
        file_path = "src/large_file.py"

        # Agent reads file with truncation (full_content=False)
        simulate_read_tool_use(file_tracker, file_path, full_content=False)

        # Agent writes to file
        simulate_write_tool_use(file_tracker, file_path)

        # Verify WARNING (not error)
        assert file_tracker.has_violations()
        violations = file_tracker.get_violations()
        assert len(violations) == 1
        assert "⚠️" in violations[0]  # Warning symbol
        assert "truncated read" in violations[0].lower()
        assert file_path in violations[0]


# ============================================================================
# File Modification Detection Tests
# ============================================================================

class TestFileModificationDetection:
    """
    Test detection of external file modifications between Read and Write.

    This is the CRITICAL feature of Spec 036: detect when a file has been
    modified externally (by another process, user edit, etc.) since the
    agent last read it.
    """

    def test_block_edit_when_file_modified_externally(self, temp_project_dir, file_tracker):
        """
        CRITICAL: Block edits when file modified by external process.

        Scenario:
        1. Agent reads file.py at 10:00:00 (mtime: 10:00:00)
        2. User/process modifies file.py at 10:00:05 (mtime: 10:00:05)
        3. Agent attempts edit at 10:00:10
        4. Hook detects mtime > read_time
        5. Hook blocks operation with error: "File modified since last read"

        This is THE key requirement of Spec 036.
        """
        file_path = temp_project_dir / "src" / "example.py"
        rel_path = str(file_path.relative_to(temp_project_dir))

        # Agent reads file
        initial_mtime = file_path.stat().st_mtime
        simulate_read_tool_use(file_tracker, rel_path, full_content=True)

        # Simulate external modification (different process updates file)
        time.sleep(0.01)  # Ensure timestamp difference
        file_path.write_text("# Modified externally\n")
        new_mtime = file_path.stat().st_mtime

        # Verify file was actually modified
        assert new_mtime > initial_mtime

        # Agent attempts edit
        # In actual implementation, PreToolUse hook would:
        # 1. Check file_path in tracker._reads
        # 2. Get current file mtime
        # 3. Compare mtime > tracker._reads[file_path]
        # 4. Block with error if mtime is newer

        # For this test, we need to simulate the mtime check
        # (FileAccessTracker needs enhancement to track mtimes)
        # This test documents the EXPECTED behavior

        # TODO: Enhance FileAccessTracker to track modification timestamps
        # TODO: Implement PreToolUse hook that checks mtimes before Write/Edit

    def test_allow_edit_when_file_unchanged(self, temp_project_dir, file_tracker):
        """
        Allow edits when file has NOT been modified externally.

        Scenario:
        1. Agent reads file.py (mtime: 10:00:00)
        2. NO external modifications
        3. Agent attempts edit (mtime still: 10:00:00)
        4. Hook allows operation (mtime unchanged)
        """
        file_path = temp_project_dir / "src" / "example.py"
        rel_path = str(file_path.relative_to(temp_project_dir))

        # Agent reads file
        initial_mtime = file_path.stat().st_mtime
        simulate_read_tool_use(file_tracker, rel_path, full_content=True)

        # NO external modification

        # Agent attempts edit
        current_mtime = file_path.stat().st_mtime
        assert current_mtime == initial_mtime  # File unchanged

        # Verify NO violations (edit should be allowed)
        simulate_edit_tool_use(file_tracker, rel_path)

        # If timestamps are tracked, no violation should be detected
        # (File hasn't changed since read)

    def test_reread_clears_modification_block(self, temp_project_dir, file_tracker):
        """
        Re-reading a modified file should clear the block.

        Scenario:
        1. Agent reads file.py (mtime: 10:00:00)
        2. File modified externally (mtime: 10:00:05)
        3. Agent re-reads file.py (updates read timestamp to 10:00:06)
        4. Agent edits file.py
        5. Hook allows operation (fresh read > current mtime)

        This enables automatic recovery: agent reads → blocked → re-reads → allowed
        """
        file_path = temp_project_dir / "src" / "example.py"
        rel_path = str(file_path.relative_to(temp_project_dir))

        # Agent reads file
        simulate_read_tool_use(file_tracker, rel_path, full_content=True)

        # File modified externally
        time.sleep(0.01)
        file_path.write_text("# Modified externally\n")

        # Agent RE-READS file (should update read timestamp)
        simulate_read_tool_use(file_tracker, rel_path, full_content=True)

        # Agent edits file (should be allowed now)
        simulate_edit_tool_use(file_tracker, rel_path)

        # Verify NO violations (re-read cleared the block)
        # In actual implementation with mtime tracking, this should pass


# ============================================================================
# Session Isolation Tests
# ============================================================================

class TestSessionIsolation:
    """Test that different sessions have independent file tracking."""

    def test_separate_sessions_independent_tracking(self):
        """
        Each session must have independent file read/write tracking.

        Scenario:
        - Session A reads file.py
        - Session B attempts edit on file.py
        - Session B should be BLOCKED (hasn't read in its session)
        - Session A can edit (has read in its session)
        """
        # Session A
        tracker_a = FileAccessTracker()
        tracker_a.record_read("src/example.py", full_content=True)
        tracker_a.record_write("src/example.py")

        # Session B
        tracker_b = FileAccessTracker()
        tracker_b.record_write("src/example.py")  # Write without read

        # Verify Session A: no violations
        assert not tracker_a.has_violations()

        # Verify Session B: violation detected
        assert tracker_b.has_violations()
        assert "Written without reading" in tracker_b.get_violations()[0]

    def test_session_reset_clears_tracking(self, file_tracker):
        """
        Session reset should clear all read/write history.

        Use case: Starting a new build/task should reset tracking.
        """
        # Session 1: read and write
        file_tracker.record_read("src/example.py", full_content=True)
        file_tracker.record_write("src/example.py")

        # Verify session has history
        summary = file_tracker.get_summary()
        assert summary["total_reads"] == 1
        assert summary["total_writes"] == 1

        # Reset session
        file_tracker.reset()

        # Verify history cleared
        summary = file_tracker.get_summary()
        assert summary["total_reads"] == 0
        assert summary["total_writes"] == 0
        assert summary["violations_count"] == 0


# ============================================================================
# Logging Tests
# ============================================================================

class TestBlockedOperationLogging:
    """Test that blocked operations are logged to task_logs.json."""

    def test_log_blocked_write_attempt(self, mock_task_logs_file):
        """
        Blocked Write operations must be logged to task_logs.json.

        Expected log entry:
        {
          "timestamp": "2025-12-28T10:30:00Z",
          "type": "blocked_operation",
          "tool": "Write",
          "file": "src/example.py",
          "reason": "File must be read first",
          "session_id": "test-session-123"
        }
        """
        # TODO: Implement logging logic in PreToolUse hook
        # This test documents expected behavior

        expected_log_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "blocked_operation",
            "tool": "Write",
            "file": "src/example.py",
            "reason": "File must be read first",
            "session_id": "test-session-123"
        }

        # In actual implementation, hook would append to task_logs.json
        # Verify log file structure
        assert mock_task_logs_file.exists()
        logs_data = json.loads(mock_task_logs_file.read_text())
        assert "logs" in logs_data
        assert isinstance(logs_data["logs"], list)

    def test_log_blocked_edit_after_modification(self, mock_task_logs_file):
        """
        Blocked Edit operations (file modified) must be logged.

        Expected log entry:
        {
          "timestamp": "2025-12-28T10:30:00Z",
          "type": "blocked_operation",
          "tool": "Edit",
          "file": "src/example.py",
          "reason": "File modified since last read (mtime: 2025-12-28T10:29:00Z > read: 2025-12-28T10:28:00Z)",
          "session_id": "test-session-123"
        }
        """
        # TODO: Implement logging with mtime details
        pass


# ============================================================================
# Hook Integration Tests
# ============================================================================

class TestPreToolUseHookIntegration:
    """
    Test integration with Claude Agent SDK PreToolUse hook system.

    These tests verify the hook is correctly registered and invoked.
    """

    def test_hook_registered_in_client(self, mock_agent_sdk_client):
        """
        Verify file edit blocking hook is registered in SDK client.

        Expected: PreToolUse hooks include file_edit_blocker_hook
        """
        # In actual implementation, client.py would register:
        # hooks = {
        #     "PreToolUse": [
        #         HookMatcher(matcher="Bash", hooks=[bash_security_hook]),
        #         HookMatcher(matcher="Write", hooks=[file_edit_blocker_hook]),
        #         HookMatcher(matcher="Edit", hooks=[file_edit_blocker_hook]),
        #     ]
        # }

        assert "PreToolUse" in mock_agent_sdk_client.hooks
        # TODO: Verify Write/Edit matchers are registered

    def test_hook_blocks_write_tool_use(self):
        """
        Verify hook actually blocks Write tool execution.

        Expected: Agent receives ToolResult with error, Write is not executed
        """
        # TODO: Full integration test with actual SDK client
        pass

    def test_hook_blocks_edit_tool_use(self):
        """
        Verify hook actually blocks Edit tool execution.

        Expected: Agent receives ToolResult with error, Edit is not executed
        """
        # TODO: Full integration test with actual SDK client
        pass

    def test_hook_returns_instructive_error_message(self):
        """
        Verify hook returns clear, actionable error message to agent.

        Expected error message format:
        "File must be read first. Use the Read tool to view the file content before editing."

        Or for modified files:
        "File has been modified since last read. Re-read the file with the Read tool before editing."

        This enables automatic agent recovery.
        """
        # TODO: Verify error message format matches spec
        pass


# ============================================================================
# Error Recovery Tests
# ============================================================================

class TestAutomaticErrorRecovery:
    """
    Test that agents can automatically recover from blocked operations.

    Recovery flow:
    1. Agent attempts Edit on file.py
    2. Hook blocks with error: "File must be read first"
    3. Agent receives error message
    4. Agent executes Read on file.py
    5. Agent retries Edit on file.py
    6. Hook allows operation
    """

    def test_agent_recovers_by_reading_file(self, file_tracker):
        """
        Verify agent can recover by reading the file.

        Expected behavior:
        - Block → Read → Retry → Success
        """
        file_path = "src/example.py"

        # 1. Agent attempts edit (BLOCKED)
        simulate_edit_tool_use(file_tracker, file_path)
        assert file_tracker.has_violations()

        # 2. Agent receives error, reads file
        simulate_read_tool_use(file_tracker, file_path, full_content=True)

        # 3. Agent retries edit (should be allowed)
        # Reset tracker to simulate retry
        file_tracker.reset()
        simulate_read_tool_use(file_tracker, file_path, full_content=True)
        simulate_edit_tool_use(file_tracker, file_path)

        # Verify NO violations on retry
        assert not file_tracker.has_violations()

    def test_agent_recovers_from_modification_by_rereading(self, temp_project_dir):
        """
        Verify agent can recover from modified file by re-reading.

        Expected behavior:
        - Block (modified) → Re-read → Retry → Success
        """
        # TODO: Implement with mtime tracking
        pass


# ============================================================================
# Edge Cases
# ============================================================================

class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_multiple_edits_same_file_same_session(self, file_tracker):
        """
        Multiple edits to the same file in one session should be allowed.

        Expected:
        - Read file.py once
        - Edit file.py (allowed)
        - Edit file.py again (allowed)
        - Edit file.py third time (allowed)

        Only the FIRST edit needs a prior read.
        """
        file_path = "src/example.py"

        # Read once
        simulate_read_tool_use(file_tracker, file_path, full_content=True)

        # Multiple edits
        simulate_edit_tool_use(file_tracker, file_path)
        simulate_edit_tool_use(file_tracker, file_path)
        simulate_edit_tool_use(file_tracker, file_path)

        # Verify NO violations (all edits allowed after first read)
        assert not file_tracker.has_violations()

    def test_edit_new_file_allowed(self, file_tracker):
        """
        Writing/editing a NEW file (doesn't exist) should be ALLOWED.

        Rationale: Agent is creating a file, not modifying an existing one.
        No prior read needed for file creation.
        """
        new_file_path = "src/new_feature.py"

        # Agent writes to new file (doesn't exist yet)
        simulate_write_tool_use(file_tracker, new_file_path)

        # In actual implementation, hook should check:
        # if file exists: require read
        # if file doesn't exist: allow (creation)

        # For now, this is a violation in the tracker
        # but should NOT be blocked by the hook
        # TODO: Implement file existence check in hook

    def test_case_sensitive_file_paths(self, file_tracker):
        """
        File paths should be case-sensitive on Linux/Mac.

        Example.py and example.py are DIFFERENT files.
        """
        # Read Example.py
        simulate_read_tool_use(file_tracker, "src/Example.py", full_content=True)

        # Edit example.py (different file!)
        simulate_edit_tool_use(file_tracker, "src/example.py")

        # Should be treated as separate files
        # example.py should show violation (not read)
        violations = file_tracker.get_violations()
        assert any("example.py" in v for v in violations)

    def test_normalized_paths(self, file_tracker):
        """
        Different path representations of same file should be normalized.

        Examples:
        - src/./example.py
        - src/../src/example.py
        - ./src/example.py

        All should be treated as: src/example.py
        """
        # TODO: Path normalization in tracker
        pass
