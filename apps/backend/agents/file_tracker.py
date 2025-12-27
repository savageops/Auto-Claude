"""
File Access Tracker - Track file reads and writes during agent sessions.

This module provides detection of incomplete-context edits by tracking when files
are read vs written during an agent session. It identifies two critical violations:

1. Files written without being read first
2. Files written after only truncated/partial reads

The tracker is integrated into agent sessions to provide real-time violation warnings
and post-session violation reports.
"""

from pathlib import Path
from datetime import datetime
from typing import Dict, Optional, Set, List


class FileAccessTracker:
    """
    Track file reads and writes during agent session.

    Detects violations where agents edit files without proper context:
    - Writing without reading (blind edits)
    - Writing after truncated reads (partial context edits)
    """

    def __init__(self):
        """Initialize empty tracking state."""
        self._reads: Dict[str, datetime] = {}  # file_path -> timestamp of last read
        self._writes: Dict[str, datetime] = {}  # file_path -> timestamp of last write
        self._full_reads: Set[str] = set()  # Files read in full (not truncated)

    def record_read(self, file_path: str, full_content: bool = False):
        """
        Record that a file was read.

        Args:
            file_path: Path to the file that was read
            full_content: True if entire file was read, False if truncated/partial
        """
        self._reads[file_path] = datetime.now()
        if full_content:
            self._full_reads.add(file_path)

    def record_write(self, file_path: str):
        """
        Record that a file was written.

        Args:
            file_path: Path to the file that was written
        """
        self._writes[file_path] = datetime.now()

    def was_read_before_write(self, file_path: str) -> bool:
        """
        Check if file was read before being written.

        Args:
            file_path: Path to check

        Returns:
            True if file was read before write, False otherwise
        """
        if file_path not in self._writes:
            return True  # Not written yet, no violation
        if file_path not in self._reads:
            return False  # Written without reading
        return self._reads[file_path] < self._writes[file_path]

    def was_full_read(self, file_path: str) -> bool:
        """
        Check if file was read in full (not truncated).

        Args:
            file_path: Path to check

        Returns:
            True if file was fully read, False if only partial/truncated read
        """
        return file_path in self._full_reads

    def get_violations(self) -> List[str]:
        """
        Get list of file access violations.

        Returns:
            List of violation messages for files that were:
            - Written without reading (critical)
            - Written after truncated read (warning)
        """
        violations = []
        for file_path in self._writes:
            if not self.was_read_before_write(file_path):
                violations.append(f"❌ {file_path}: Written without reading")
            elif not self.was_full_read(file_path):
                violations.append(f"⚠️ {file_path}: Written after truncated read")
        return violations

    def get_summary(self) -> dict:
        """
        Get summary statistics of file accesses during session.

        Returns:
            Dict with counts of reads, writes, violations, and lists of affected files
        """
        violations = self.get_violations()
        return {
            "total_reads": len(self._reads),
            "total_writes": len(self._writes),
            "full_reads": len(self._full_reads),
            "violations_count": len(violations),
            "violations": violations,
            "files_read": sorted(self._reads.keys()),
            "files_written": sorted(self._writes.keys()),
            "files_full_read": sorted(self._full_reads),
        }

    def has_violations(self) -> bool:
        """
        Check if any violations were detected.

        Returns:
            True if violations exist, False otherwise
        """
        return len(self.get_violations()) > 0

    def reset(self):
        """
        Reset all tracking state.

        Useful for starting a new session or clearing data between runs.
        """
        self._reads.clear()
        self._writes.clear()
        self._full_reads.clear()
