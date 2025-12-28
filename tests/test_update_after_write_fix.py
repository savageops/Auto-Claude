"""
Verification test for Bug #1 fix: update_after_write() call in hook.

This test demonstrates that agents can now make consecutive edits without re-reading.
"""

import pytest
from pathlib import Path
from apps.backend.agents.file_tracker import get_file_tracker, reset_file_tracker
from apps.backend.security.hooks import file_edit_blocking_hook


@pytest.fixture
def test_file(tmp_path):
    """Create a temporary test file."""
    file = tmp_path / "test.py"
    file.write_text("# Original content\n")
    return file


@pytest.fixture(autouse=True)
def reset_tracker():
    """Reset file tracker before each test."""
    reset_file_tracker()
    yield
    reset_file_tracker()


@pytest.mark.asyncio
async def test_consecutive_edits_without_rereading(test_file):
    """
    Verify Bug #1 fix: Agents can make consecutive edits.

    Before fix: Second edit would be blocked with "file modified since read"
    After fix: Second edit is allowed (tracker updated after first edit)
    """
    tracker = get_file_tracker()

    # Step 1: Agent reads the file
    await file_edit_blocking_hook({
        "tool_name": "Read",
        "tool_input": {"file_path": str(test_file)}
    })

    assert tracker.was_read(str(test_file)), "File should be marked as read"

    # Step 2: Agent makes FIRST edit
    result = await file_edit_blocking_hook({
        "tool_name": "Edit",
        "tool_input": {
            "file_path": str(test_file),
            "old_string": "# Original content",
            "new_string": "# First edit"
        }
    })

    assert result == {}, "First edit should be allowed"

    # Actually perform the edit (simulate Write tool)
    test_file.write_text("# First edit\n")

    # Step 3: Agent makes SECOND edit WITHOUT re-reading
    # ✅ AFTER FIX: This should be ALLOWED (tracker updated with new mtime)
    # ❌ BEFORE FIX: This would be BLOCKED (tracker has stale mtime)
    result = await file_edit_blocking_hook({
        "tool_name": "Edit",
        "tool_input": {
            "file_path": str(test_file),
            "old_string": "# First edit",
            "new_string": "# Second edit"
        }
    })

    # The key assertion: consecutive edit should be allowed
    assert result == {}, "Consecutive edit should be allowed after fix"
    assert "block" not in result, "Should not block consecutive edits"

    print("✅ Fix verified: Consecutive edits work without re-reading")


@pytest.mark.asyncio
async def test_external_modification_still_blocks(test_file):
    """
    Verify the fix doesn't break external modification detection.

    External modifications should STILL be blocked.
    """
    import time
    tracker = get_file_tracker()

    # Agent reads file
    await file_edit_blocking_hook({
        "tool_name": "Read",
        "tool_input": {"file_path": str(test_file)}
    })

    # External process modifies file (not through hook)
    time.sleep(0.01)  # Ensure mtime difference
    test_file.write_text("# External modification\n")

    # Agent attempts edit - should be BLOCKED
    result = await file_edit_blocking_hook({
        "tool_name": "Edit",
        "tool_input": {
            "file_path": str(test_file),
            "old_string": "# Original",
            "new_string": "# Agent edit"
        }
    })

    assert result.get("decision") == "block", "External modifications should still be blocked"
    assert "modified since" in result.get("reason", "").lower()

    print("✅ External modification detection still works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
