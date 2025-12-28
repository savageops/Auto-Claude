"""
Agent Session Management
========================

Handles running agent sessions and post-session processing including
memory updates, recovery tracking, and Linear integration.
"""

import logging
from pathlib import Path

from claude_agent_sdk import ClaudeSDKClient
from debug import debug, debug_detailed, debug_error, debug_section, debug_success
from insight_extractor import extract_session_insights
from linear_updater import (
    linear_subtask_completed,
    linear_subtask_failed,
)
from progress import (
    count_subtasks_detailed,
    is_build_complete,
)
from recovery import RecoveryManager
from task_logger import (
    LogEntryType,
    LogPhase,
    get_task_logger,
)
from ui import (
    StatusManager,
    muted,
    print_key_value,
    print_status,
)

from .file_tracker import reset_file_tracker
from .memory_manager import save_session_memory
from .utils import (
    find_subtask_in_plan,
    get_commit_count,
    get_latest_commit,
    load_implementation_plan,
    sync_plan_to_source,
)

logger = logging.getLogger(__name__)


async def post_session_processing(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    commit_before: str | None,
    commit_count_before: int,
    recovery_manager: RecoveryManager,
    linear_enabled: bool = False,
    status_manager: StatusManager | None = None,
    source_spec_dir: Path | None = None,
) -> bool:
    """
    Process session results and update memory automatically.

    This runs in Python (100% reliable) instead of relying on agent compliance.

    Args:
        spec_dir: Spec directory containing memory/
        project_dir: Project root for git operations
        subtask_id: The subtask that was being worked on
        session_num: Current session number
        commit_before: Git commit hash before session
        commit_count_before: Number of commits before session
        recovery_manager: Recovery manager instance
        linear_enabled: Whether Linear integration is enabled
        status_manager: Optional status manager for ccstatusline
        source_spec_dir: Original spec directory (for syncing back from worktree)

    Returns:
        True if subtask was completed successfully
    """
    from .file_tracker import get_file_tracker
    tracker = get_file_tracker()
    session_metrics = tracker.get_summary()

    print()
    print(muted("--- Post-Session Processing ---"))

    # Sync implementation plan back to source (for worktree mode)
    if sync_plan_to_source(spec_dir, source_spec_dir):
        print_status("Implementation plan synced to main project", "success")

    # Check if implementation plan was updated
    plan = load_implementation_plan(spec_dir)
    if not plan:
        print("  Warning: Could not load implementation plan")
        return False

    subtask = find_subtask_in_plan(plan, subtask_id)
    if not subtask:
        print(f"  Warning: Subtask {subtask_id} not found in plan")
        return False

    subtask_status = subtask.get("status", "pending")

    # CRITICAL: Check for safety violations (Read Before Write)
    if session_metrics and session_metrics.get("violations_count", 0) > 0:
        print_status("SAFETY VIOLATION DETECTED", "error")
        for v in session_metrics.get("violations", []):
            print(f"  {v}")
        
        # Consider this a failure regardless of what the agent claims
        if subtask_status == "completed":
            print_status("Rejecting completion due to safety violations", "error")
            subtask_status = "failed"
            # Revert status in plan if needed? 
            # Ideally the agent should have updated the plan file. 
            # But since we are failing here, we should record it as failure.
        
        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=False,
            approach="Rejected due to safety violations",
            error=f"Safety Violations: {session_metrics.get('violations')}",
        )
        return False

    # Check for new commits
    commit_after = get_latest_commit(project_dir)
    commit_count_after = get_commit_count(project_dir)
    new_commits = commit_count_after - commit_count_before

    print_key_value("Subtask status", subtask_status)
    print_key_value("New commits", str(new_commits))

    if subtask_status == "completed":
        # Success! Record the attempt and good commit
        print_status(f"Subtask {subtask_id} completed successfully", "success")

        # Update status file
        if status_manager:
            subtasks = count_subtasks_detailed(spec_dir)
            status_manager.update_subtasks(
                completed=subtasks["completed"],
                total=subtasks["total"],
                in_progress=0,
            )

        # Record successful attempt
        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=True,
            approach=f"Implemented: {subtask.get('description', 'subtask')[:100]}",
        )

        # Record good commit for rollback safety
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, subtask_id)
            print_status(f"Recorded good commit: {commit_after[:8]}", "success")

        # Record Linear session result (if enabled)
        if linear_enabled:
            # Get progress counts for the comment
            subtasks_detail = count_subtasks_detailed(spec_dir)
            await linear_subtask_completed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                completed_count=subtasks_detail["completed"],
                total_count=subtasks_detail["total"],
            )
            print_status("Linear progress recorded", "success")

        # Extract rich insights from session (LLM-powered analysis)
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=True,
                recovery_manager=recovery_manager,
            )
            insight_count = len(extracted_insights.get("file_insights", []))
            pattern_count = len(extracted_insights.get("patterns_discovered", []))
            if insight_count > 0 or pattern_count > 0:
                print_status(
                    f"Extracted {insight_count} file insights, {pattern_count} patterns",
                    "success",
                )
        except Exception as e:
            logger.warning(f"Insight extraction failed: {e}")
            extracted_insights = None

        # Save session memory (Graphiti=primary, file-based=fallback)
        try:
            save_success, storage_type = await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=True,
                subtasks_completed=[subtask_id],
                discoveries=extracted_insights,
            )
            if save_success:
                if storage_type == "graphiti":
                    print_status("Session saved to Graphiti memory", "success")
                else:
                    print_status(
                        "Session saved to file-based memory (fallback)", "info"
                    )
            else:
                print_status("Failed to save session memory", "warning")
        except Exception as e:
            logger.warning(f"Error saving session memory: {e}")
            print_status("Memory save failed", "warning")

        return True

    elif subtask_status == "in_progress":
        # Session ended without completion
        print_status(f"Subtask {subtask_id} still in progress", "warning")

        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=False,
            approach="Session ended with subtask in_progress",
            error="Subtask not marked as completed",
        )

        # Still record commit if one was made (partial progress)
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, subtask_id)
            print_status(
                f"Recorded partial progress commit: {commit_after[:8]}", "info"
            )

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            await linear_subtask_failed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                attempt=attempt_count,
                error_summary="Session ended without completion",
            )

        # Extract insights even from failed sessions (valuable for future attempts)
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=False,
                recovery_manager=recovery_manager,
            )
        except Exception as e:
            logger.debug(f"Insight extraction failed for incomplete session: {e}")
            extracted_insights = None

        # Save failed session memory (to track what didn't work)
        try:
            await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=False,
                subtasks_completed=[],
                discoveries=extracted_insights,
            )
        except Exception as e:
            logger.debug(f"Failed to save incomplete session memory: {e}")

        return False

    else:
        # Subtask still pending or failed
        print_status(
            f"Subtask {subtask_id} not completed (status: {subtask_status})", "error"
        )

        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=False,
            approach="Session ended without progress",
            error=f"Subtask status is {subtask_status}",
        )

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            await linear_subtask_failed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                attempt=attempt_count,
                error_summary=f"Subtask status: {subtask_status}",
            )

        # Extract insights even from completely failed sessions
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=False,
                recovery_manager=recovery_manager,
            )
        except Exception as e:
            logger.debug(f"Insight extraction failed for failed session: {e}")
            extracted_insights = None

        # Save failed session memory (to track what didn't work)
        try:
            await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=False,
                subtasks_completed=[],
                discoveries=extracted_insights,
            )
        except Exception as e:
            logger.debug(f"Failed to save failed session memory: {e}")

        return False


async def run_agent_session(
    client: ClaudeSDKClient,
    message: str,
    spec_dir: Path,
    verbose: bool = False,
    phase: LogPhase = LogPhase.CODING,
) -> tuple[str, str, dict]:
    """
    Run a single agent session using Claude Agent SDK.

    Args:
        client: Claude SDK client
        message: The prompt to send
        spec_dir: Spec directory path
        verbose: Whether to show detailed output
        phase: Current execution phase for logging

    Returns:
        (status, response_text, metrics) where status is:
        - "continue" if agent should continue working
        - "complete" if all subtasks complete
        - "error" if an error occurred
    """
    # Reset file tracker for session-scoped state
    # This ensures each session starts with clean file tracking,
    # and the file_edit_blocking_hook will require files to be
    # read before being edited within this session.
    reset_file_tracker()

    debug_section("session", f"Agent Session - {phase.value}")
    debug(
        "session",
        "Starting agent session",
        spec_dir=str(spec_dir),
        phase=phase.value,
        prompt_length=len(message),
        prompt_preview=message[:200] + "..." if len(message) > 200 else message,
    )
    print("Sending prompt to Claude Agent SDK...\n")

    # Get task logger for this spec
    task_logger = get_task_logger(spec_dir)
    current_tool = None
    message_count = 0
    tool_count = 0

    try:
        # Send the query
        debug("session", "Sending query to Claude SDK...")
        await client.query(message)
        debug_success("session", "Query sent successfully")

        # Collect response text and show tool use
        response_text = ""
        debug("session", "Starting to receive response stream...")
        async for msg in client.receive_response():
            msg_type = type(msg).__name__
            message_count += 1
            debug_detailed(
                "session",
                f"Received message #{message_count}",
                msg_type=msg_type,
            )

            # Handle AssistantMessage (text and tool use)
            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(
                                block.text,
                                LogEntryType.TEXT,
                                phase,
                                print_to_console=False,
                            )
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None
                        tool_count += 1

                        # Extract meaningful tool input for display
                        if hasattr(block, "input") and block.input:
                            inp = block.input
                            if isinstance(inp, dict):
                                if "pattern" in inp:
                                    tool_input = f"pattern: {inp['pattern']}"
                                elif "file_path" in inp:
                                    fp = inp["file_path"]
                                    if len(fp) > 50:
                                        fp = "..." + fp[-47:]
                                    tool_input = fp
                                elif "command" in inp:
                                    cmd = inp["command"]
                                    if len(cmd) > 50:
                                        cmd = cmd[:47] + "..."
                                    tool_input = cmd
                                # For other tools, just show the dict as string if needed
                                else:
                                    tool_input = str(inp)[:100]

                        current_tool = tool_name
                        
                        debug_detailed(
                            "session",
                            f"Tool Use Block #{tool_count}",
                            tool_name=tool_name,
                            tool_input=tool_input,
                        )

                        # Log tool start to task logger
                        if task_logger:
                            task_logger.tool_start(
                                tool_name=tool_name,
                                tool_input=tool_input,
                                phase=phase,
                                print_to_console=False,
                            )

            # Handle ToolResultMessage
            elif msg_type == "ToolResultMessage":
                print(f"[SESSION DEBUG] Received ToolResultMessage for {current_tool}", flush=True)
                if hasattr(msg, "content"):
                    result_content = ""
                    # Content is typically a list of blocks in SDK
                    if isinstance(msg.content, list):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if hasattr(block, "text"):
                                result_content += block.text
                            elif hasattr(block, "content"): # Some blocks might wrap content
                                result_content += str(block.content)
                            elif block_type == "ToolResultBlock": # Direct block access
                                result_content += getattr(block, "content", "")
                            else:
                                result_content += str(block)
                    else:
                        result_content = str(msg.content)

                    print(f"[SESSION DEBUG] Tool result content preview: {str(result_content)[:100]}", flush=True)

                    # Check if command was blocked by security hook
                    # Handle generic "blocked" and specific safety patterns
                    res_lower = str(result_content).lower()
                    is_blocked = any(p in res_lower for p in [
                        "blocked", 
                        "must be read",
                        "modified since last read",
                        "read it first"
                    ])
                    
                    print(f"[SESSION DEBUG] is_blocked detection: {is_blocked}", flush=True)
                    
                    if is_blocked:
                        debug_error(
                            "session",
                            f"Tool BLOCKED: {current_tool}",
                            result=str(result_content)[:300],
                        )
                        print(f"   [BLOCKED] {result_content}", flush=True)
                        if task_logger and current_tool:
                            # Log as an explicit error for pink styling in UI
                            task_logger.log_error(
                                f"Blocked {current_tool} operation: {result_content}",
                                phase=phase
                            )
                            # Still record tool end for state tracking
                            task_logger.tool_end(
                                current_tool,
                                success=False,
                                result="BLOCKED",
                                detail=str(result_content),
                                phase=phase,
                                print_to_console=False,
                            )
                    else:
                        # Standard result logging
                        debug_detailed(
                            "session",
                            f"Tool Result for {current_tool}",
                            result_length=len(result_content)
                        )

                        # Log tool result
                        if task_logger and current_tool:
                            # Determine success/failure from content (heuristic)
                            success = "Error:" not in result_content[:50] 
                            
                            result_preview = result_content.strip()
                            if len(result_preview) > 100:
                                result_preview = result_preview[:97] + "..."
                                
                            # Optimize storage for large outputs
                            detail_content = None
                            if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                # Only store if not too large (50KB limit)
                                if len(result_content) < 50000:
                                    detail_content = result_content

                            task_logger.tool_end(
                                tool_name=current_tool,
                                success=success,
                                result=result_preview,
                                detail=detail_content or result_content,
                                phase=phase,
                                print_to_console=False,
                            )

                    current_tool = None

        debug_success("session", "Response stream completed")

    except Exception as e:
        logger.error(f"Error during agent session: {e}")
        debug_error("session", f"Session error: {e}")
        return "error", f"Session error: {e}", {}

    # Parse response to determine status
    response_lower = response_text.lower()

    if "completed" in response_lower or "finished" in response_lower:
        status = "complete"
    elif "continue" in response_lower or "next" in response_lower:
        status = "continue"
    else:
        status = "continue"

    debug_detailed(
        "session",
        "Session analysis",
        detected_status=status,
        message_count=message_count,
        tool_count=tool_count,
    )

    # Check if build is complete
    if is_build_complete(spec_dir):
        debug_success(
            "session",
            "Session completed - build is complete",
            message_count=message_count,
            tool_count=tool_count,
            response_length=len(response_text),
        )
        return "complete", response_text

    debug_success(
        "session",
        "Session completed - continuing",
        message_count=message_count,
        tool_count=tool_count,
        response_length=len(response_text),
    )
    return status, response_text