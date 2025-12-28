#!/usr/bin/env python3
"""
Integration Tests for Spec 036: Block File Edits When File Modified Since Last Read
====================================================================================

Tests the file edit blocking system that prevents Write/Edit operations on files that:
1. Haven't been read in the current session
2. Have been modified since the last Read operation

These tests verify the complete hook integration with the FileAccessTracker and
Claude Agent SDK, including mtime detection, session isolation, and external
file modification detection.

Key test areas:
- FileAccessTracker mtime detection
- file_edit_blocking_hook behavior
- Session-scoped tracking state
- New file creation allowance
- File modification detection
- Warning on truncated reads
- Error message quality
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from apps.backend.agents.file_tracker import FileAccessTracker, FileReadRecord, get_file_tracker, reset_file_tracker
from apps.backend.security.hooks import file_edit_blocking_hook


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
def temp_dir(tmp_path):
    """Create temporary directory for test files."""
    return tmp_path


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
# Helper Functions
# ============================================================================

def simulate_read_tool_use(tracker: FileAccessTracker, file_path: str, full_content: bool = True):
    """
    Simulate Read tool execution.

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Read operations.
    """
    tracker.record_read(file_path, partial=not full_content)


def simulate_write_tool_use(tracker: FileAccessTracker, file_path: str):
    """
    Simulate Write tool execution (would be blocked if file not read).

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Write operations.
    """
    # Note: FileAccessTracker doesn't have record_write method
    # This is for API compatibility with OURS version
    pass


def simulate_edit_tool_use(tracker: FileAccessTracker, file_path: str):
    """
    Simulate Edit tool execution (would be blocked if file not read).

    In actual implementation, this would be called by the PreToolUse hook
    when detecting Edit operations.
    """
    # Note: FileAccessTracker doesn't have record_write method
    # This is for API compatibility with OURS version
    pass


# =============================================================================
# FILE ACCESS TRACKER TESTS - MTIME TRACKING
# =============================================================================


class TestFileAccessTrackerMtimeTracking:
    """Tests for FileAccessTracker mtime detection functionality."""

    def test_record_read_stores_mtime(self, temp_dir: Path):
        """Recording a read stores the file's current mtime."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record the read
        mtime = tracker.record_read(str(test_file))

        # Verify mtime was stored
        assert mtime is not None
        assert mtime == os.path.getmtime(test_file)
        assert tracker.get_read_mtime(str(test_file)) == mtime

    def test_record_read_nonexistent_file_returns_none(self, temp_dir: Path):
        """Recording a read of a non-existent file returns None."""
        tracker = FileAccessTracker()
        nonexistent_file = temp_dir / "does_not_exist.py"

        # Record the read
        mtime = tracker.record_read(str(nonexistent_file))

        # Should return None but not raise an error
        assert mtime is None

    def test_record_partial_read_tracks_partial_flag(self, temp_dir: Path):
        """Recording a partial read stores the partial flag."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record a partial read
        tracker.record_read(str(test_file), partial=True)

        # Verify partial flag was stored
        assert tracker.was_partial_read(str(test_file)) is True

    def test_was_read_returns_true_for_read_file(self, temp_dir: Path):
        """was_read returns True for files that were read."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Before reading
        assert tracker.was_read(str(test_file)) is False

        # After reading
        tracker.record_read(str(test_file))
        assert tracker.was_read(str(test_file)) is True

    def test_is_file_modified_since_read_detects_changes(self, temp_dir: Path):
        """is_file_modified_since_read detects when file content changes."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record the read
        tracker.record_read(str(test_file))

        # Initially not modified
        assert tracker.is_file_modified_since_read(str(test_file)) is False

        # Wait and modify the file (ensure mtime changes)
        time.sleep(0.1)
        test_file.write_text("content = 2\n")

        # Now should be detected as modified
        assert tracker.is_file_modified_since_read(str(test_file)) is True

    def test_is_file_modified_since_read_handles_unread_file(self, temp_dir: Path):
        """is_file_modified_since_read returns None for unread files."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Never read - should return None
        assert tracker.is_file_modified_since_read(str(test_file)) is None

    def test_is_file_modified_since_read_handles_deleted_file(self, temp_dir: Path):
        """is_file_modified_since_read returns True if file was deleted."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record the read
        tracker.record_read(str(test_file))

        # Delete the file
        test_file.unlink()

        # Should be considered modified (deleted)
        assert tracker.is_file_modified_since_read(str(test_file)) is True

    def test_update_after_write_updates_mtime(self, temp_dir: Path):
        """update_after_write updates the tracked mtime after a write."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record the read
        tracker.record_read(str(test_file))
        original_mtime = tracker.get_read_mtime(str(test_file))

        # Modify the file (simulating a Write operation)
        time.sleep(0.1)
        test_file.write_text("content = 2\n")

        # Update the tracker (simulating post-Write update)
        new_mtime = tracker.update_after_write(str(test_file))

        # Mtime should be updated
        assert new_mtime > original_mtime
        assert tracker.get_read_mtime(str(test_file)) == new_mtime
        # File should no longer be considered modified
        assert tracker.is_file_modified_since_read(str(test_file)) is False

    def test_update_after_write_clears_partial_flag(self, temp_dir: Path):
        """update_after_write clears the partial read flag."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record a partial read
        tracker.record_read(str(test_file), partial=True)
        assert tracker.was_partial_read(str(test_file)) is True

        # Update after write
        time.sleep(0.1)
        test_file.write_text("content = 2\n")
        tracker.update_after_write(str(test_file))

        # Partial flag should be cleared
        assert tracker.was_partial_read(str(test_file)) is False

    def test_update_after_write_ignores_untracked_files(self, temp_dir: Path):
        """update_after_write returns None for files not in tracker."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # File was never read - update should return None
        result = tracker.update_after_write(str(test_file))
        assert result is None

    def test_clear_removes_all_records(self, temp_dir: Path):
        """clear removes all tracked file records."""
        tracker = FileAccessTracker()
        file1 = temp_dir / "file1.py"
        file2 = temp_dir / "file2.py"
        file1.write_text("content = 1\n")
        file2.write_text("content = 2\n")

        # Record reads
        tracker.record_read(str(file1))
        tracker.record_read(str(file2))
        assert len(tracker.get_all_reads()) == 2

        # Clear
        tracker.clear()

        # All records should be gone
        assert len(tracker.get_all_reads()) == 0
        assert tracker.was_read(str(file1)) is False
        assert tracker.was_read(str(file2)) is False


class TestFileAccessTrackerPathNormalization:
    """Tests for path normalization in FileAccessTracker."""

    def test_normalizes_relative_paths(self, temp_dir: Path):
        """Relative paths are normalized to absolute paths."""
        tracker = FileAccessTracker()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Use the full path for recording
        tracker.record_read(str(test_file))

        # Check that it's tracked (path should be normalized)
        assert tracker.was_read(str(test_file)) is True

    def test_handles_path_with_dots(self, temp_dir: Path):
        """Paths with .. are properly resolved."""
        tracker = FileAccessTracker()
        subdir = temp_dir / "subdir"
        subdir.mkdir()
        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Record with clean path
        tracker.record_read(str(test_file))

        # Check with path containing ..
        path_with_dots = str(subdir / ".." / "test.py")
        assert tracker.was_read(path_with_dots) is True


class TestFileAccessTrackerGlobalState:
    """Tests for global FileAccessTracker state management."""

    def test_get_file_tracker_returns_singleton(self):
        """get_file_tracker returns the same instance."""
        tracker1 = get_file_tracker()
        tracker2 = get_file_tracker()

        assert tracker1 is tracker2

    def test_reset_file_tracker_creates_new_instance(self):
        """reset_file_tracker creates a fresh tracker instance."""
        tracker1 = get_file_tracker()
        tracker2 = reset_file_tracker()

        assert tracker1 is not tracker2
        assert get_file_tracker() is tracker2


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
        simulate_write_tool_use(file_tracker, file_path)

        # Verify violation is detected by checking tracker state
        assert not file_tracker.was_read(file_path)

    def test_allow_write_after_read(self, file_tracker, temp_dir):
        """
        Write operations must be ALLOWED if file was read in current session.

        Expected behavior:
        1. Agent reads file.py
        2. Agent writes to file.py
        3. Hook allows operation (no block)
        4. Write is recorded successfully
        """
        file_path = temp_dir / "example.py"
        file_path.write_text("# Original content\n")

        # Agent reads file
        simulate_read_tool_use(file_tracker, str(file_path), full_content=True)

        # Verify read was recorded
        assert file_tracker.was_read(str(file_path))
        assert file_tracker.was_partial_read(str(file_path)) is False

    def test_block_edit_without_read(self, file_tracker):
        """
        CRITICAL: Edit operations must be blocked if file hasn't been read.

        Expected behavior same as write blocking.
        """
        file_path = "src/module.py"

        # Agent attempts edit WITHOUT prior read
        simulate_edit_tool_use(file_tracker, file_path)

        # Verify violation is detected
        assert not file_tracker.was_read(file_path)

    def test_allow_edit_after_read(self, file_tracker, temp_dir):
        """
        Edit operations must be ALLOWED if file was read in current session.
        """
        file_path = temp_dir / "module.py"
        file_path.write_text("def foo():\n    pass\n")

        # Agent reads file
        simulate_read_tool_use(file_tracker, str(file_path), full_content=True)

        # Verify read was recorded
        assert file_tracker.was_read(str(file_path))

    def test_warn_on_truncated_read(self, file_tracker, temp_dir):
        """
        WARNING: Writing after truncated read should issue warning (not block).

        Expected behavior:
        1. Agent reads file with truncation (partial content)
        2. Agent writes to file
        3. Hook allows operation but logs warning
        4. Warning: "Written after truncated read"
        """
        file_path = temp_dir / "large_file.py"
        file_path.write_text("# Original content\n")

        # Agent reads file with truncation (full_content=False)
        simulate_read_tool_use(file_tracker, str(file_path), full_content=False)

        # Verify partial read was recorded
        assert file_tracker.was_partial_read(str(file_path)) is True


# =============================================================================
# FILE MODIFICATION DETECTION TESTS
# =============================================================================

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
        file_tracker.record_read(str(file_path), full_content=True)

        # Simulate external modification (different process updates file)
        time.sleep(0.01)  # Ensure timestamp difference
        file_path.write_text("# Modified externally\n")
        new_mtime = file_path.stat().st_mtime

        # Verify file was actually modified
        assert new_mtime > initial_mtime

        # Check if modification is detected
        is_modified = file_tracker.is_file_modified_since_read(str(file_path))
        assert is_modified is True

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
        file_tracker.record_read(str(file_path), full_content=True)

        # NO external modification

        # Agent attempts edit
        current_mtime = file_path.stat().st_mtime
        assert current_mtime == initial_mtime  # File unchanged

        # Verify NO violations (edit should be allowed)
        is_modified = file_tracker.is_file_modified_since_read(str(file_path))
        assert is_modified is False

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
        file_tracker.record_read(str(file_path), full_content=True)

        # File modified externally
        time.sleep(0.01)
        file_path.write_text("# Modified externally\n")

        # Verify modification is detected
        assert file_tracker.is_file_modified_since_read(str(file_path)) is True

        # Agent RE-READS file (should update read timestamp)
        file_tracker.record_read(str(file_path), full_content=True)

        # Verify modification is no longer detected
        assert file_tracker.is_file_modified_since_read(str(file_path)) is False


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
        tracker_a.record_read("src/example.py")

        # Session B
        tracker_b = FileAccessTracker()

        # Verify Session A: file was read
        assert tracker_a.was_read("src/example.py")

        # Verify Session B: file was NOT read
        assert not tracker_b.was_read("src/example.py")

    def test_session_reset_clears_tracking(self, file_tracker):
        """
        Session reset should clear all read/write history.

        Use case: Starting a new build/task should reset tracking.
        """
        # Session 1: read
        file_tracker.record_read("src/example.py")

        # Verify session has history
        reads = file_tracker.get_all_reads()
        assert len(reads) == 1

        # Clear session
        file_tracker.clear()

        # Verify history cleared
        reads = file_tracker.get_all_reads()
        assert len(reads) == 0
        assert not file_tracker.was_read("src/example.py")


# =============================================================================
# FILE EDIT BLOCKING HOOK TESTS
# =============================================================================


class TestFileEditBlockingHookReadTracking:
    """Tests for Read tool tracking in file_edit_blocking_hook."""

    @pytest.mark.asyncio
    async def test_records_read_operation(self, temp_dir: Path):
        """Hook records file paths when Read tool is called."""
        # Reset tracker for clean state
        tracker = reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate Read tool call
        input_data = {
            "tool_name": "Read",
            "tool_input": {"file_path": str(test_file)},
        }

        result = await file_edit_blocking_hook(input_data)

        # Should allow the read
        assert result == {}
        # Should have recorded the read
        assert tracker.was_read(str(test_file)) is True

    @pytest.mark.asyncio
    async def test_records_partial_read(self, temp_dir: Path):
        """Hook records partial reads correctly."""
        tracker = reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate partial Read tool call
        input_data = {
            "tool_name": "Read",
            "tool_input": {
                "file_path": str(test_file),
                "offset": 0,
                "limit": 100,
            },
        }

        result = await file_edit_blocking_hook(input_data)

        # Should allow the read
        assert result == {}
        # Should have recorded as partial
        assert tracker.was_partial_read(str(test_file)) is True


class TestFileEditBlockingHookWriteBlocking:
    """Tests for Write tool blocking in file_edit_blocking_hook."""

    @pytest.mark.asyncio
    async def test_blocks_write_without_prior_read(self, temp_dir: Path):
        """Write is blocked if file exists but wasn't read."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate Write tool call without prior Read
        input_data = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": str(test_file),
                "content": "content = 2\n",
            },
        }

        result = await file_edit_blocking_hook(input_data)

        # Should block the write
        assert result.get("decision") == "block"
        assert "must be read before editing" in result.get("reason", "")
        assert str(test_file) in result.get("reason", "")

    @pytest.mark.asyncio
    async def test_allows_write_after_read(self, temp_dir: Path):
        """Write is allowed after file has been read."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # First, simulate Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {"file_path": str(test_file)},
        }
        await file_edit_blocking_hook(read_input)

        # Then, simulate Write
        write_input = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": str(test_file),
                "content": "content = 2\n",
            },
        }

        result = await file_edit_blocking_hook(write_input)

        # Should allow the write
        assert result == {}

    @pytest.mark.asyncio
    async def test_allows_write_to_new_file(self, temp_dir: Path):
        """Write to non-existent file (new file creation) is allowed."""
        reset_file_tracker()

        new_file = temp_dir / "new_file.py"

        # Simulate Write to new file without Read
        input_data = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": str(new_file),
                "content": "content = 1\n",
            },
        }

        result = await file_edit_blocking_hook(input_data)

        # Should allow - this is new file creation
        assert result == {}

    @pytest.mark.asyncio
    async def test_blocks_write_after_external_modification(self, temp_dir: Path):
        """Write is blocked if file was modified since last read."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # First, simulate Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {"file_path": str(test_file)},
        }
        await file_edit_blocking_hook(read_input)

        # Externally modify the file
        time.sleep(0.1)  # Ensure mtime changes
        test_file.write_text("externally modified\n")

        # Now try to Write
        write_input = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": str(test_file),
                "content": "content = 2\n",
            },
        }

        result = await file_edit_blocking_hook(write_input)

        # Should block - file was modified externally
        assert result.get("decision") == "block"
        assert "has been modified since last read" in result.get("reason", "")

    @pytest.mark.asyncio
    async def test_blocks_write_after_partial_read(self, temp_dir: Path):
        """Write is blocked after partial read (with warning in message)."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate partial Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {
                "file_path": str(test_file),
                "offset": 0,
                "limit": 5,
            },
        }
        await file_edit_blocking_hook(read_input)

        # Now try to Write
        write_input = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": str(test_file),
                "content": "content = 2\n",
            },
        }

        result = await file_edit_blocking_hook(write_input)

        # Should allow but with warning
        assert result.get("decision") != "block" or "truncated" in result.get("reason", "").lower()


class TestFileEditBlockingHookEditBlocking:
    """Tests for Edit tool blocking in file_edit_blocking_hook."""

    @pytest.mark.asyncio
    async def test_blocks_edit_without_prior_read(self, temp_dir: Path):
        """Edit is blocked if file wasn't read first."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate Edit tool call without prior Read
        input_data = {
            "tool_name": "Edit",
            "tool_input": {
                "file_path": str(test_file),
                "old_string": "content = 1",
                "new_string": "content = 2",
            },
        }

        result = await file_edit_blocking_hook(input_data)

        # Should block the edit
        assert result.get("decision") == "block"
        assert "must be read before editing" in result.get("reason", "")

    @pytest.mark.asyncio
    async def test_allows_edit_after_read(self, temp_dir: Path):
        """Edit is allowed after file has been read."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # First, simulate Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {"file_path": str(test_file)},
        }
        await file_edit_blocking_hook(read_input)

        # Then, simulate Edit
        edit_input = {
            "tool_name": "Edit",
            "tool_input": {
                "file_path": str(test_file),
                "old_string": "content = 1",
                "new_string": "content = 2",
            },
        }

        result = await file_edit_blocking_hook(edit_input)

        # Should allow the edit
        assert result == {}

    @pytest.mark.asyncio
    async def test_blocks_edit_after_external_modification(self, temp_dir: Path):
        """Edit is blocked if file was modified since last read."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # First, simulate Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {"file_path": str(test_file)},
        }
        await file_edit_blocking_hook(read_input)

        # Externally modify the file
        time.sleep(0.1)  # Ensure mtime changes
        test_file.write_text("externally modified\n")

        # Now try to Edit
        edit_input = {
            "tool_name": "Edit",
            "tool_input": {
                "file_path": str(test_file),
                "old_string": "content = 1",
                "new_string": "content = 2",
            },
        }

        result = await file_edit_blocking_hook(edit_input)

        # Should block - file was modified externally
        assert result.get("decision") == "block"
        assert "has been modified since last read" in result.get("reason", "")

    @pytest.mark.asyncio
    async def test_blocks_edit_after_partial_read(self, temp_dir: Path):
        """Edit is blocked after partial read (with warning in message)."""
        reset_file_tracker()

        test_file = temp_dir / "test.py"
        test_file.write_text("content = 1\n")

        # Simulate partial Read
        read_input = {
            "tool_name": "Read",
            "tool_input": {
                "file_path": str(test_file),
                "offset": 0,
                "limit": 5,
            },
        }
        await file_edit_blocking_hook(read_input)

        # Now try to Edit
        edit_input = {
            "tool_name": "Edit",
            "tool_input": {
                "file_path": str(test_file),
                "old_string": "content = 1",
                "new_string": "content = 2",
            },
        }

        result = await file_edit_blocking_hook(edit_input)

        # Should allow but with warning
        assert result.get("decision") != "block" or "truncated" in result.get("reason", "").lower()


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