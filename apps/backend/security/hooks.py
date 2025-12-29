"""
Security Hooks
==============

Pre-tool-use hooks that validate bash commands for security.
Main enforcement point for the security system.
"""

import os
from pathlib import Path
from typing import Any

from project_analyzer import BASE_COMMANDS, SecurityProfile, is_command_allowed
from task_logger import LogEntryType, LogPhase, get_task_logger

from .parser import extract_commands, get_command_for_validation, split_command_segments
from .profile import get_security_profile
from .validator import VALIDATORS


def _log_blocked_operation(
    tool_name: str,
    file_path: str,
    reason: str,
    context: Any | None = None,
) -> None:
    """
    Log a blocked file operation to task_logs.json.

    Attempts to log the blocked operation using the task logger from context
    or the global task logger if available.

    Args:
        tool_name: The tool that was blocked (e.g., "Write", "Edit")
        file_path: The file path that was attempted
        reason: The reason for blocking
        context: Optional context that may contain task_logger or spec_dir
    """
    print(f"\n[HOOK DEBUG] _log_blocked_operation called:", flush=True)
    print(f"  tool_name: {tool_name}", flush=True)
    print(f"  file_path: {file_path}", flush=True)
    print(f"  reason: {reason[:100]}...", flush=True)
    print(f"  context: {context}", flush=True)

    # Try to get task logger from context or global instance
    task_logger = None
    if context and hasattr(context, "task_logger"):
        task_logger = context.task_logger
        print(f"[HOOK DEBUG] Got task_logger from context.task_logger", flush=True)
    elif context and hasattr(context, "spec_dir"):
        task_logger = get_task_logger(Path(context.spec_dir))
        print(f"[HOOK DEBUG] Got task_logger from context.spec_dir: {context.spec_dir}", flush=True)
    else:
        # Try to get the global task logger (if one was set up)
        task_logger = get_task_logger()
        print(f"[HOOK DEBUG] Got task_logger from global get_task_logger()", flush=True)

    if task_logger is None:
        print(f"[HOOK DEBUG] No task_logger found - cannot log block", flush=True)
        return

    print(f"[HOOK DEBUG] task_logger found: {task_logger}", flush=True)

    # Create a log entry for the blocked operation with full reason
    content = f"Blocked {tool_name} operation on {file_path}: {reason}"

    # Use the current phase from the logger, or default to CODING
    phase = task_logger.current_phase or LogPhase.CODING
    print(f"[HOOK DEBUG] Logging to phase: {phase}", flush=True)
    print(f"[HOOK DEBUG] Log content: {content[:200]}...", flush=True)

    try:
        task_logger.log(
            content=content,
            entry_type=LogEntryType.ERROR,
            phase=phase,
            print_to_console=False,  # Don't print, the hook response handles output
        )
        print(f"[HOOK DEBUG] Successfully called task_logger.log()", flush=True)
    except Exception as e:
        print(f"[HOOK DEBUG] Error calling task_logger.log(): {e}", flush=True)


async def bash_security_hook(
    input_data: dict[str, Any],
    tool_use_id: str | None = None,
    context: Any | None = None,
) -> dict[str, Any]:
    """
    Pre-tool-use hook that validates bash commands using dynamic allowlist.

    This is the main security enforcement point. It:
    1. Extracts command names from the command string
    2. Checks each command against the project's security profile
    3. Runs additional validation for sensitive commands
    4. Blocks disallowed commands with clear error messages

    Args:
        input_data: Dict containing tool_name and tool_input
        tool_use_id: Optional tool use ID
        context: Optional context

    Returns:
        Empty dict to allow, or {"decision": "block", "reason": "..."} to block
    """
    if input_data.get("tool_name") != "Bash":
        return {}

    command = input_data.get("tool_input", {}).get("command", "")
    if not command:
        return {}

    # Get the working directory from context or use current directory
    # In the actual client, this would be set by the ClaudeSDKClient
    cwd = os.getcwd()
    if context and hasattr(context, "cwd"):
        cwd = context.cwd

    # Get or create security profile
    # Note: In actual use, spec_dir would be passed through context
    try:
        profile = get_security_profile(Path(cwd))
    except Exception as e:
        # If profile creation fails, fall back to base commands only
        print(f"Warning: Could not load security profile: {e}")
        profile = SecurityProfile()
        profile.base_commands = BASE_COMMANDS.copy()

    # Extract all commands from the command string
    commands = extract_commands(command)

    if not commands:
        # Could not parse - fail safe by blocking
        return {
            "decision": "block",
            "reason": f"Could not parse command for security validation: {command}",
        }

    # Split into segments for per-command validation
    segments = split_command_segments(command)

    # Get all allowed commands
    allowed = profile.get_all_allowed_commands()

    # Check each command against the allowlist
    for cmd in commands:
        # Check if command is allowed
        is_allowed, reason = is_command_allowed(cmd, profile)

        if not is_allowed:
            return {
                "decision": "block",
                "reason": reason,
            }

        # Additional validation for sensitive commands
        if cmd in VALIDATORS:
            cmd_segment = get_command_for_validation(cmd, segments)
            if not cmd_segment:
                cmd_segment = command

            validator = VALIDATORS[cmd]
            allowed, reason = validator(cmd_segment)
            if not allowed:
                return {"decision": "block", "reason": reason}

    return {}


async def file_edit_blocking_hook(
    input_data: dict[str, Any],
    tool_use_id: str | None = None,
    context: Any | None = None,
) -> dict[str, Any]:
    """
    Pre-tool-use hook that blocks Write/Edit operations on files not recently read.

    This hook enforces the "read before write" pattern by:
    1. Recording file reads with their mtime when Read tool is used
    2. Blocking Write/Edit if the file wasn't read first (for existing files)
    3. Blocking Write/Edit if the file was modified externally since last read
    4. Allowing Write to non-existent files (new file creation)

    Args:
        input_data: Dict containing tool_name and tool_input
        tool_use_id: Optional tool use ID
        context: Optional context (may contain file_tracker instance)

    Returns:
        Empty dict to allow, or {"decision": "block", "reason": "..."} to block
    """
    import os
    from pathlib import Path
    from agents.file_tracker import FileAccessTracker, get_file_tracker

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Get the file tracker from context or use global instance
    # Pass the agent's cwd for correct path normalization (especially in worktrees)
    tracker: FileAccessTracker
    if context and hasattr(context, "file_tracker"):
        tracker = context.file_tracker
    else:
        tracker = get_file_tracker()
        # Set the base directory for path normalization if not already set
        # Use context.cwd (agent's actual cwd) not os.getcwd() (hook's cwd)
        if tracker._base_dir is None:
            if context and hasattr(context, "cwd") and context.cwd:
                tracker._base_dir = Path(context.cwd)
            else:
                tracker._base_dir = Path.cwd()

    # Handle Read tool: record the file read
    if tool_name == "Read":
        file_path = tool_input.get("file_path", "")
        if file_path:
            try:
                # Check if this is a partial read (offset or limit specified)
                is_partial = tool_input.get("offset") is not None or tool_input.get("limit") is not None
                tracker.record_read(file_path, partial=is_partial)
            except Exception as e:
                # Don't block the read operation if tracking fails
                print(f"Warning: Failed to track read for {file_path}: {e}")
        # Always allow read operations
        return {}

    # Handle Write and Edit tools: check if file was read first
    if tool_name in ("Write", "Edit"):
        file_path = tool_input.get("file_path", "")
        if not file_path:
            # No file path provided - let the tool handle this error
            return {}

        try:
            # Resolve file path consistently using tracker normalization
            abs_file_path_str = tracker._normalize_path(file_path)
            abs_file_path = Path(abs_file_path_str)
            file_exists = abs_file_path.exists()

            # Allow new file creation (Write to non-existent path)
            if tool_name == "Write" and not file_exists:
                return {}

            # For existing files, check if it was read
            if not tracker.was_read(file_path):
                reason = (
                    f"File must be read before editing: {file_path}\n\n"
                    f"Use the Read tool to read this file first, then retry the {tool_name} operation. "
                    f"This ensures you have the latest file contents before making changes."
                )
                tracker.record_violation(f"Attempted {tool_name} on {file_path} without reading first")
                _log_blocked_operation(tool_name, file_path, reason, context)
                return {
                    "decision": "block",
                    "reason": reason,
                }

            # Check if file was modified since last read
            is_modified = tracker.is_file_modified_since_read(file_path)
            if is_modified:
                reason = (
                    f"File has been modified since last read: {file_path}\n\n"
                    f"The file has changed since you last read it. Use the Read tool to get the "
                    f"latest contents, then retry the {tool_name} operation."
                )
                tracker.record_violation(f"Attempted {tool_name} on {file_path} but file was modified externally")
                _log_blocked_operation(tool_name, file_path, reason, context)
                return {
                    "decision": "block",
                    "reason": reason,
                }

            # Check if the read was partial (offset/limit specified)
            if tracker.was_partial_read(file_path):
                # Warn but allow - partial reads may be intentional for large files
                pass  # Allow operation, but could log a warning

            # Update tracker with new mtime after successful write/edit
            # This allows consecutive edits without re-reading
            if file_exists:
                tracker.update_after_write(file_path)

            # File was read and not modified - allow the operation
            return {}
        except Exception as e:
            # Don't block the operation if tracking fails
            print(f"Warning: File tracking failed for {file_path}, allowing {tool_name}: {e}")
            return {}

    # Not a file operation tool - allow
    return {}


def validate_command(
    command: str,
    project_dir: Path | None = None,
) -> tuple[bool, str]:
    """
    Validate a command string (for testing/debugging).

    Args:
        command: Full command string to validate
        project_dir: Optional project directory (uses cwd if not provided)

    Returns:
        (is_allowed, reason) tuple
    """
    if project_dir is None:
        project_dir = Path.cwd()

    profile = get_security_profile(project_dir)
    commands = extract_commands(command)

    if not commands:
        return False, "Could not parse command"

    segments = split_command_segments(command)

    for cmd in commands:
        is_allowed_result, reason = is_command_allowed(cmd, profile)
        if not is_allowed_result:
            return False, reason

        if cmd in VALIDATORS:
            cmd_segment = get_command_for_validation(cmd, segments)
            if not cmd_segment:
                cmd_segment = command

            validator = VALIDATORS[cmd]
            allowed, reason = validator(cmd_segment)
            if not allowed:
                return False, reason

    return True, ""