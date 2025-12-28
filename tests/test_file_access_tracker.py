"""
Tests for FileAccessTracker
============================

Validates file read/write tracking and violation detection.
"""

import time
from datetime import datetime
from unittest.mock import patch

import pytest

from apps.backend.agents.file_tracker import FileAccessTracker


class TestFileAccessTrackerInit:
    """Test FileAccessTracker initialization."""

    def test_init_creates_empty_state(self):
        """Tracker should initialize with empty state."""
        tracker = FileAccessTracker()
        assert tracker._reads == {}
        assert tracker._writes == {}
        assert tracker._full_reads == set()

    def test_init_summary_empty(self):
        """Empty tracker should report zero counts."""
        tracker = FileAccessTracker()
        summary = tracker.get_summary()

        assert summary["total_reads"] == 0
        assert summary["total_writes"] == 0
        assert summary["full_reads"] == 0
        assert summary["violations_count"] == 0
        assert summary["violations"] == []
        assert summary["files_read"] == []
        assert summary["files_written"] == []
        assert summary["files_full_read"] == []

    def test_init_no_violations(self):
        """Empty tracker should have no violations."""
        tracker = FileAccessTracker()
        assert not tracker.has_violations()
        assert tracker.get_violations() == []


class TestRecordRead:
    """Test recording file reads."""

    def test_record_read_partial(self):
        """Partial read should be tracked without marking as full."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=False)

        assert "test.py" in tracker._reads
        assert "test.py" not in tracker._full_reads
        assert not tracker.was_full_read("test.py")

    def test_record_read_full(self):
        """Full read should be marked as full."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=True)

        assert "test.py" in tracker._reads
        assert "test.py" in tracker._full_reads
        assert tracker.was_full_read("test.py")

    def test_record_read_default_partial(self):
        """Default full_content should be False."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py")  # No full_content arg

        assert "test.py" in tracker._reads
        assert "test.py" not in tracker._full_reads

    def test_record_multiple_reads(self):
        """Multiple reads of same file should update timestamp."""
        tracker = FileAccessTracker()

        tracker.record_read("test.py", full_content=False)
        first_time = tracker._reads["test.py"]

        time.sleep(0.01)  # Ensure timestamp difference

        tracker.record_read("test.py", full_content=True)
        second_time = tracker._reads["test.py"]

        assert second_time > first_time
        assert tracker.was_full_read("test.py")

    def test_record_read_multiple_files(self):
        """Should track reads of multiple files."""
        tracker = FileAccessTracker()

        tracker.record_read("file1.py", full_content=True)
        tracker.record_read("file2.py", full_content=False)
        tracker.record_read("file3.py", full_content=True)

        assert len(tracker._reads) == 3
        assert len(tracker._full_reads) == 2
        assert tracker.was_full_read("file1.py")
        assert not tracker.was_full_read("file2.py")
        assert tracker.was_full_read("file3.py")


class TestRecordWrite:
    """Test recording file writes."""

    def test_record_write_basic(self):
        """Write should be tracked with timestamp."""
        tracker = FileAccessTracker()
        tracker.record_write("test.py")

        assert "test.py" in tracker._writes
        assert isinstance(tracker._writes["test.py"], datetime)

    def test_record_multiple_writes(self):
        """Multiple writes should update timestamp."""
        tracker = FileAccessTracker()

        tracker.record_write("test.py")
        first_time = tracker._writes["test.py"]

        time.sleep(0.01)

        tracker.record_write("test.py")
        second_time = tracker._writes["test.py"]

        assert second_time > first_time

    def test_record_write_multiple_files(self):
        """Should track writes of multiple files."""
        tracker = FileAccessTracker()

        tracker.record_write("file1.py")
        tracker.record_write("file2.py")
        tracker.record_write("file3.py")

        assert len(tracker._writes) == 3


class TestWasReadBeforeWrite:
    """Test read-before-write violation detection."""

    def test_no_write_yet(self):
        """File not written should return True (no violation)."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=True)

        assert tracker.was_read_before_write("test.py")

    def test_write_without_read(self):
        """Write without read should return False (violation)."""
        tracker = FileAccessTracker()
        tracker.record_write("test.py")

        assert not tracker.was_read_before_write("test.py")

    def test_read_then_write(self):
        """Read before write should return True (correct order)."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=True)

        time.sleep(0.01)  # Ensure timestamp difference

        tracker.record_write("test.py")

        assert tracker.was_read_before_write("test.py")

    def test_write_then_read(self):
        """Write before read should return False (incorrect order)."""
        tracker = FileAccessTracker()
        tracker.record_write("test.py")

        time.sleep(0.01)

        tracker.record_read("test.py", full_content=True)

        assert not tracker.was_read_before_write("test.py")

    def test_multiple_reads_then_write(self):
        """Multiple reads before write should use latest read timestamp."""
        tracker = FileAccessTracker()

        tracker.record_read("test.py", full_content=False)
        time.sleep(0.01)
        tracker.record_read("test.py", full_content=True)
        time.sleep(0.01)
        tracker.record_write("test.py")

        assert tracker.was_read_before_write("test.py")


class TestGetViolations:
    """Test violation reporting."""

    def test_no_violations(self):
        """Proper workflow should have no violations."""
        tracker = FileAccessTracker()

        # Read then write - correct
        tracker.record_read("file1.py", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("file1.py")

        # Read only - no violation
        tracker.record_read("file2.py", full_content=True)

        violations = tracker.get_violations()
        assert len(violations) == 0
        assert not tracker.has_violations()

    def test_write_without_read_violation(self):
        """Write without read should generate critical violation."""
        tracker = FileAccessTracker()
        tracker.record_write("test.py")

        violations = tracker.get_violations()
        assert len(violations) == 1
        assert "❌" in violations[0]
        assert "test.py" in violations[0]
        assert "Written without reading" in violations[0]
        assert tracker.has_violations()

    def test_write_after_truncated_read_violation(self):
        """Write after partial read should generate warning."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=False)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("test.py")

        violations = tracker.get_violations()
        assert len(violations) == 1
        assert "⚠️" in violations[0]
        assert "test.py" in violations[0]
        assert "Written after truncated read" in violations[0]
        assert tracker.has_violations()

    def test_multiple_violations(self):
        """Multiple files with violations should all be reported."""
        tracker = FileAccessTracker()

        # Critical: write without read
        tracker.record_write("file1.py")

        # Warning: write after partial read
        tracker.record_read("file2.py", full_content=False)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("file2.py")

        # No violation: proper read then write
        tracker.record_read("file3.py", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("file3.py")

        violations = tracker.get_violations()
        assert len(violations) == 2
        assert any("file1.py" in v and "❌" in v for v in violations)
        assert any("file2.py" in v and "⚠️" in v for v in violations)
        assert tracker.has_violations()

    def test_violation_priority(self):
        """Write-without-read should take priority over truncated-read."""
        tracker = FileAccessTracker()

        # Write without ANY read - should be critical violation
        tracker.record_write("test.py")

        violations = tracker.get_violations()
        assert len(violations) == 1
        assert "❌" in violations[0]
        assert "Written without reading" in violations[0]


class TestGetSummary:
    """Test summary statistics."""

    def test_summary_empty_tracker(self):
        """Empty tracker summary should show zeros."""
        tracker = FileAccessTracker()
        summary = tracker.get_summary()

        assert summary["total_reads"] == 0
        assert summary["total_writes"] == 0
        assert summary["full_reads"] == 0
        assert summary["violations_count"] == 0

    def test_summary_with_activity(self):
        """Summary should report all activity."""
        tracker = FileAccessTracker()

        tracker.record_read("file1.py", full_content=True)
        tracker.record_read("file2.py", full_content=False)
        tracker.record_write("file1.py")
        tracker.record_write("file3.py")  # Violation: no read

        summary = tracker.get_summary()

        assert summary["total_reads"] == 2
        assert summary["total_writes"] == 2
        assert summary["full_reads"] == 1
        assert summary["violations_count"] == 2  # file2 partial, file3 no read

    def test_summary_file_lists_sorted(self):
        """File lists in summary should be sorted."""
        tracker = FileAccessTracker()

        tracker.record_read("z.py", full_content=True)
        tracker.record_read("a.py", full_content=False)
        tracker.record_read("m.py", full_content=True)
        tracker.record_write("y.py")
        tracker.record_write("b.py")

        summary = tracker.get_summary()

        assert summary["files_read"] == ["a.py", "m.py", "z.py"]
        assert summary["files_written"] == ["b.py", "y.py"]
        assert summary["files_full_read"] == ["m.py", "z.py"]

    def test_summary_violations_included(self):
        """Summary should include violation messages."""
        tracker = FileAccessTracker()
        tracker.record_write("bad.py")

        summary = tracker.get_summary()

        assert len(summary["violations"]) == 1
        assert "bad.py" in summary["violations"][0]


class TestWasFullRead:
    """Test full read detection."""

    def test_was_full_read_not_read(self):
        """File not read should return False."""
        tracker = FileAccessTracker()
        assert not tracker.was_full_read("test.py")

    def test_was_full_read_partial(self):
        """Partial read should return False."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=False)
        assert not tracker.was_full_read("test.py")

    def test_was_full_read_full(self):
        """Full read should return True."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=True)
        assert tracker.was_full_read("test.py")

    def test_was_full_read_upgrade_partial_to_full(self):
        """Partial read upgraded to full should return True."""
        tracker = FileAccessTracker()
        tracker.record_read("test.py", full_content=False)
        assert not tracker.was_full_read("test.py")

        tracker.record_read("test.py", full_content=True)
        assert tracker.was_full_read("test.py")


class TestReset:
    """Test tracker reset functionality."""

    def test_reset_clears_all_state(self):
        """Reset should clear all tracking data."""
        tracker = FileAccessTracker()

        # Add some data
        tracker.record_read("file1.py", full_content=True)
        tracker.record_read("file2.py", full_content=False)
        tracker.record_write("file1.py")
        tracker.record_write("file3.py")

        assert len(tracker._reads) == 2
        assert len(tracker._writes) == 2
        assert len(tracker._full_reads) == 1

        # Reset
        tracker.reset()

        assert len(tracker._reads) == 0
        assert len(tracker._writes) == 0
        assert len(tracker._full_reads) == 0

    def test_reset_clears_violations(self):
        """Reset should clear violation state."""
        tracker = FileAccessTracker()

        tracker.record_write("bad.py")
        assert tracker.has_violations()

        tracker.reset()

        assert not tracker.has_violations()
        assert tracker.get_violations() == []

    def test_reset_allows_reuse(self):
        """Tracker should be usable after reset."""
        tracker = FileAccessTracker()

        # First session
        tracker.record_read("file1.py", full_content=True)
        tracker.record_write("file1.py")

        # Reset for new session
        tracker.reset()

        # Second session
        tracker.record_read("file2.py", full_content=True)
        tracker.record_write("file2.py")

        summary = tracker.get_summary()
        assert summary["total_reads"] == 1
        assert summary["total_writes"] == 1
        assert "file2.py" in summary["files_read"]
        assert "file1.py" not in summary["files_read"]


class TestComplexScenarios:
    """Test complex real-world scenarios."""

    def test_typical_good_workflow(self):
        """Typical correct workflow with multiple files."""
        tracker = FileAccessTracker()

        # Read patterns then modify
        tracker.record_read("pattern1.py", full_content=True)
        tracker.record_read("pattern2.py", full_content=True)

        # Read file to modify
        tracker.record_read("target.py", full_content=True)

        time.sleep(0.01)  # Ensure timestamp difference

        # Modify it
        tracker.record_write("target.py")

        # Create new file (no read needed)
        # This is intentional - new files don't need reads

        summary = tracker.get_summary()
        assert summary["violations_count"] == 0
        assert not tracker.has_violations()

    def test_file_deletion_bug_scenario(self):
        """Scenario from file deletion bug - partial context edit."""
        tracker = FileAccessTracker()

        # Agent receives truncated file in prompt (200 lines)
        tracker.record_read("large_file.py", full_content=False)

        time.sleep(0.01)  # Ensure timestamp difference

        # Agent writes based on partial context
        tracker.record_write("large_file.py")

        violations = tracker.get_violations()
        assert len(violations) == 1
        assert "⚠️" in violations[0]
        assert "truncated" in violations[0].lower()

    def test_qa_fixer_loop(self):
        """QA fixer making multiple iterations."""
        tracker = FileAccessTracker()

        # QA reviewer reads file
        tracker.record_read("buggy.py", full_content=True)

        # QA fixer modifies it
        tracker.record_write("buggy.py")

        # Second iteration - reads again and fixes
        time.sleep(0.01)
        tracker.record_read("buggy.py", full_content=True)

        time.sleep(0.01)
        tracker.record_write("buggy.py")

        # Should have no violations (proper read before each write)
        summary = tracker.get_summary()
        assert summary["violations_count"] == 0

    def test_parallel_file_operations(self):
        """Simulated parallel operations on different files."""
        tracker = FileAccessTracker()

        # File 1: correct
        tracker.record_read("file1.py", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("file1.py")

        # File 2: violation (write without read)
        tracker.record_write("file2.py")

        # File 3: warning (partial read)
        tracker.record_read("file3.py", full_content=False)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("file3.py")

        # File 4: read only (no violation)
        tracker.record_read("file4.py", full_content=True)

        violations = tracker.get_violations()
        assert len(violations) == 2
        assert tracker.has_violations()

        summary = tracker.get_summary()
        assert summary["total_reads"] == 3
        assert summary["total_writes"] == 3
        assert summary["full_reads"] == 2


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_same_file_multiple_operations(self):
        """Same file read and written multiple times."""
        tracker = FileAccessTracker()

        # Read, write, read, write pattern
        tracker.record_read("test.py", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("test.py")

        time.sleep(0.01)

        tracker.record_read("test.py", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("test.py")

        # Should check latest read vs latest write
        assert tracker.was_read_before_write("test.py")
        assert not tracker.has_violations()

    def test_empty_file_path(self):
        """Empty string file path should be tracked."""
        tracker = FileAccessTracker()
        tracker.record_read("", full_content=True)
        tracker.record_write("")

        assert "" in tracker._reads
        assert "" in tracker._writes

    def test_whitespace_file_paths(self):
        """File paths with whitespace should be tracked as-is."""
        tracker = FileAccessTracker()
        tracker.record_read("  spaces.py  ", full_content=True)
        time.sleep(0.01)  # Ensure timestamp difference
        tracker.record_write("  spaces.py  ")

        assert "  spaces.py  " in tracker._reads
        assert not tracker.has_violations()

    def test_case_sensitive_paths(self):
        """File paths should be case-sensitive."""
        tracker = FileAccessTracker()

        tracker.record_read("Test.py", full_content=True)
        tracker.record_write("test.py")  # Different case

        # These are different files
        violations = tracker.get_violations()
        assert len(violations) == 1  # test.py written without reading
