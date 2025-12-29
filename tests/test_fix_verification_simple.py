"""
Simplified verification test for Bug #1 fix.

Tests the FileAccessTracker and update_after_write() directly.
"""

import pytest
import time
from pathlib import Path
from apps.backend.agents.file_tracker import FileAccessTracker


@pytest.fixture
def tracker():
    """Create a fresh FileAccessTracker instance."""
    return FileAccessTracker()


@pytest.fixture
def test_file(tmp_path):
    """Create a temporary test file."""
    file = tmp_path / "test.py"
    file.write_text("# Original content\n")
    return file


def test_update_after_write_allows_consecutive_edits(tracker, test_file):
    """
    Verify Bug #1 fix: update_after_write() enables consecutive edits.

    BEFORE FIX:
    1. Read file (mtime: T1)
    2. Edit file (mtime: T2, but tracker still has T1)
    3. Second edit BLOCKED (tracker sees mtime T2 > recorded T1)

    AFTER FIX:
    1. Read file (mtime: T1)
    2. Edit file (mtime: T2) → update_after_write(T2)
    3. Second edit ALLOWED (tracker has T2, file has T2)
    """
    # Step 1: Agent reads file
    tracker.record_read(str(test_file))
    assert tracker.was_read(str(test_file))

    # Step 2: Agent makes first edit
    # Simulate the edit happening
    time.sleep(0.01)  # Ensure mtime changes
    test_file.write_text("# First edit\n")

    # WITHOUT the fix, this would be detected as "modified"
    is_modified_before_update = tracker.is_file_modified_since_read(str(test_file))
    assert is_modified_before_update is True, "File IS modified after write (expected)"

    # ✅ THE FIX: Call update_after_write() to record new mtime
    tracker.update_after_write(str(test_file))

    # NOW the tracker should know the file is up-to-date
    is_modified_after_update = tracker.is_file_modified_since_read(str(test_file))
    assert is_modified_after_update is False, "File should NOT be detected as modified after update"

    # Step 3: Agent makes second edit - should be allowed
    time.sleep(0.01)
    test_file.write_text("# Second edit\n")

    # Update again after second write
    tracker.update_after_write(str(test_file))

    # Verify still not detected as modified
    is_modified = tracker.is_file_modified_since_read(str(test_file))
    assert is_modified is False, "File should NOT be detected as modified after second update"

    print("✅ Fix verified: update_after_write() enables consecutive edits")


def test_external_modification_still_detected(tracker, test_file):
    """
    Verify the fix doesn't break external modification detection.

    External edits (NOT through tracker) should still be detected.
    """
    # Agent reads file
    tracker.record_read(str(test_file))

    # External process modifies file (tracker NOT updated)
    time.sleep(0.01)
    test_file.write_text("# External modification\n")

    # Should detect as modified
    is_modified = tracker.is_file_modified_since_read(str(test_file))
    assert is_modified is True, "External modification should be detected"

    print("✅ External modification detection still works")


def test_update_after_write_clears_partial_flag(tracker, test_file):
    """Verify update_after_write() clears the partial read flag."""
    # Record a partial read
    tracker.record_read(str(test_file), partial=True)
    assert tracker.was_partial_read(str(test_file)) is True

    # Write and update
    test_file.write_text("# New content\n")
    tracker.update_after_write(str(test_file))

    # Partial flag should be cleared
    assert tracker.was_partial_read(str(test_file)) is False, "Partial flag should be cleared"

    print("✅ Partial flag cleared after update")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
