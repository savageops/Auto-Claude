"""
File Access Tracker
====================

Session-scoped tracking of file read operations with mtime recording.
Used by the file edit blocking hook to validate that files are read
before being edited, and that they haven't been modified externally.
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class FileReadRecord:
    """Record of a file read operation."""

    file_path: str
    """Absolute path to the file."""

    mtime: float
    """Modification time of the file when it was read."""

    partial: bool = False
    """Whether the read was partial (offset/limit specified)."""


class FileAccessTracker:
    """
    Session-scoped tracker for file read operations.

    Tracks when files are read and stores their modification times,
    allowing the file edit blocking hook to:
    1. Block edits to files that weren't read first
    2. Block edits to files that were modified since last read

    Usage:
        tracker = FileAccessTracker()
        tracker.record_read("/path/to/file.py")  # Stores mtime
        mtime = tracker.get_read_mtime("/path/to/file.py")  # Retrieve mtime
    """

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        """
        Initialize an empty file access tracker.

        Args:
            base_dir: Base directory for resolving relative paths.
                     If None, uses Path.cwd() (not recommended in hooks).
        """
        self._reads: dict[str, FileReadRecord] = {}
        self._violations: list[str] = []
        self._base_dir = base_dir

    def record_read(
        self,
        file_path: str,
        partial: bool = False,
    ) -> Optional[float]:
        """
        Record a file read operation with its current mtime.

        Args:
            file_path: Path to the file that was read (will be normalized).
            partial: Whether this was a partial read (offset/limit specified).

        Returns:
            The mtime of the file at read time, or None if file doesn't exist.
        """
        normalized_path = self._normalize_path(file_path)
        print(f"[TRACKER DEBUG] record_read: {file_path} -> {normalized_path}", flush=True)

        # Get current mtime
        mtime = self._get_file_mtime(normalized_path)
        if mtime is None:
            # File doesn't exist - still record the read attempt
            # This handles the case where we read a non-existent file
            return None

        self._reads[normalized_path] = FileReadRecord(
            file_path=normalized_path,
            mtime=mtime,
            partial=partial,
        )

        return mtime

    def get_read_mtime(self, file_path: str) -> Optional[float]:
        """
        Get the mtime from when a file was last read.

        Args:
            file_path: Path to the file to check.

        Returns:
            The mtime of the file when it was read, or None if not read.
        """
        normalized_path = self._normalize_path(file_path)
        record = self._reads.get(normalized_path)
        return record.mtime if record else None

    def was_read(self, file_path: str) -> bool:
        """
        Check if a file was read during this session.

        Args:
            file_path: Path to the file to check.

        Returns:
            True if the file was read, False otherwise.
        """
        normalized_path = self._normalize_path(file_path)
        result = normalized_path in self._reads
        print(f"[TRACKER DEBUG] was_read: {file_path} -> {normalized_path} (exists={result})", flush=True)
        if not result:
            print(f"[TRACKER DEBUG] Current tracked reads: {list(self._reads.keys())}", flush=True)
        return result

    def was_partial_read(self, file_path: str) -> bool:
        """
        Check if the last read of a file was partial.

        Args:
            file_path: Path to the file to check.

        Returns:
            True if the file was read with offset/limit, False otherwise.
        """
        normalized_path = self._normalize_path(file_path)
        record = self._reads.get(normalized_path)
        return record.partial if record else False

    def is_file_modified_since_read(self, file_path: str) -> Optional[bool]:
        """
        Check if a file has been modified since it was last read.

        Args:
            file_path: Path to the file to check.

        Returns:
            True if modified since read, False if not modified,
            None if the file was never read or doesn't exist.
        """
        normalized_path = self._normalize_path(file_path)
        record = self._reads.get(normalized_path)

        if record is None:
            return None

        current_mtime = self._get_file_mtime(normalized_path)
        if current_mtime is None:
            # File was deleted - consider it modified
            return True

        return current_mtime > record.mtime

    def update_after_write(self, file_path: str) -> Optional[float]:
        """
        Update the tracked mtime after a successful write/edit operation.

        This allows immediate re-edits without requiring a re-read.

        Args:
            file_path: Path to the file that was written.

        Returns:
            The new mtime, or None if file doesn't exist.
        """
        normalized_path = self._normalize_path(file_path)

        if normalized_path not in self._reads:
            # File wasn't tracked - don't start tracking it now
            return None

        new_mtime = self._get_file_mtime(normalized_path)
        if new_mtime is None:
            return None

        # Update the record with new mtime
        self._reads[normalized_path].mtime = new_mtime
        self._reads[normalized_path].partial = False

        return new_mtime

    def clear(self) -> None:
        """Clear all tracked file reads (start fresh session)."""
        self._reads.clear()

    def get_all_reads(self) -> list[FileReadRecord]:
        """
        Get all recorded file reads.

        Returns:
            List of all file read records.
        """
        return list(self._reads.values())

    def record_violation(self, message: str) -> None:
        """
        Record a security violation.

        Args:
            message: Description of the violation
        """
        self._violations.append(message)

    def get_violations(self) -> list[str]:
        """
        Get all recorded security violations.

        Returns:
            List of violation messages
        """
        return self._violations

    def get_summary(self) -> dict:
        """
        Get a summary of file access activity for the session.

        Returns:
            Dictionary with counts and violation list
        """
        total_reads = len(self._reads)
        full_reads = len([r for r in self._reads.values() if not r.partial])
        
        return {
            "total_reads": total_reads,
            "full_reads": full_reads,
            "violations_count": len(self._violations),
            "violations": self._violations,
        }

    def _normalize_path(self, file_path: str) -> str:
        """
        Normalize a file path for consistent tracking.

        Args:
            file_path: The file path to normalize.

        Returns:
            Normalized absolute path.
        """
        # Use os.path for consistent normalization across platforms
        # Avoid .resolve() as it follows symlinks which can break worktree tracking
        # (e.g., resolving a worktree path back to the main project path)
        
        # Make absolute if relative
        if not os.path.is_absolute(file_path):
            # Use base_dir if provided, otherwise fall back to cwd
            base = str(self._base_dir) if self._base_dir else os.getcwd()
            file_path = os.path.join(base, file_path)

        # Normalize path (resolve .. and . but NOT symlinks)
        return os.path.normpath(file_path)

    def _get_file_mtime(self, file_path: str) -> Optional[float]:
        """
        Get the modification time of a file.

        Args:
            file_path: Path to the file.

        Returns:
            The mtime as a float, or None if file doesn't exist.
        """
        try:
            return os.path.getmtime(file_path)
        except OSError:
            return None


# Global instance for session-scoped tracking
# Note: In production, this would be managed per-session
_current_tracker: Optional[FileAccessTracker] = None


def get_file_tracker() -> FileAccessTracker:
    """
    Get the current session's file access tracker.

    Creates a new tracker if one doesn't exist.

    Returns:
        The current FileAccessTracker instance.
    """
    global _current_tracker
    if _current_tracker is None:
        _current_tracker = FileAccessTracker()
    return _current_tracker


def reset_file_tracker() -> FileAccessTracker:
    """
    Reset the file tracker for a new session.

    Returns:
        A new FileAccessTracker instance.
    """
    global _current_tracker
    _current_tracker = FileAccessTracker()
    return _current_tracker