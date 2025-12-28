"""
Prompt Generator
================

Generates minimal, focused prompts for each subtask.
Instead of a 900-line mega-prompt, each subtask gets a tailored ~100-line prompt
with only the context it needs.

This approach:
- Reduces token usage by ~80%
- Keeps the agent focused on ONE task
- Moves bookkeeping to Python orchestration
"""

import json
from pathlib import Path


def get_relative_spec_path(spec_dir: Path, project_dir: Path) -> str:
    """
    Get the spec directory path relative to the project/working directory.

    This ensures the AI gets a usable path regardless of absolute locations.

    Args:
        spec_dir: Absolute path to spec directory
        project_dir: Absolute path to project/working directory

    Returns:
        Relative path string (e.g., "./turret/specs/003-new-spec")
    """
    try:
        # Try to make path relative to project_dir
        relative = spec_dir.relative_to(project_dir)
        return f"./{relative}"
    except ValueError:
        # If spec_dir is not under project_dir, return the name only
        # This shouldn't happen if workspace.py correctly copies spec files
        return f"./turret/specs/{spec_dir.name}"


def generate_environment_context(project_dir: Path, spec_dir: Path) -> str:
    """
    Generate environment context header for prompts.

    This explicitly tells the AI where it is working, preventing path confusion.

    Args:
        project_dir: The working directory for the AI
        spec_dir: The spec directory (may be absolute or relative)

    Returns:
        Markdown string with environment context
    """
    relative_spec = get_relative_spec_path(spec_dir, project_dir)

    return f"""## YOUR ENVIRONMENT

**Working Directory:** `{project_dir}`
**Spec Location:** `{relative_spec}/`

Your filesystem is restricted to your working directory. All file paths should be
relative to this location. Do NOT use absolute paths.

**Important Files:**
- Spec: `{relative_spec}/spec.md`
- Plan: `{relative_spec}/implementation_plan.json`
- Progress: `{relative_spec}/build-progress.txt`
- Context: `{relative_spec}/context.json`

---

"""


def generate_subtask_prompt(
    spec_dir: Path,
    project_dir: Path,
    subtask: dict,
    phase: dict,
    attempt_count: int = 0,
    recovery_hints: list[str] | None = None,
) -> str:
    """
    Generate a focused systems quality prompt for implementing a single subtask.

    Args:
        spec_dir: Directory containing spec files
        project_dir: Root project directory (working directory)
        subtask: The subtask to implement
        phase: The phase containing this subtask
        attempt_count: Number of previous attempts (for retry context)
        recovery_hints: Hints from previous failed attempts

    Returns:
        A focused prompt string (~200 lines instead of 900)
    """
    subtask_id = subtask.get("id", "unknown")
    description = subtask.get("description", "No description")
    service = subtask.get("service", "all")
    files_to_modify = subtask.get("files_to_modify", [])
    files_to_create = subtask.get("files_to_create", [])
    patterns_from = subtask.get("patterns_from", [])
    verification = subtask.get("verification", {})

    # Get relative spec path
    relative_spec = get_relative_spec_path(spec_dir, project_dir)

    # Build the prompt
    sections = []

    # Environment context first
    sections.append(generate_environment_context(project_dir, spec_dir))

    # Header
    sections.append(f"""# Subtask Implementation Task

**Subtask ID:** `{subtask_id}`
**Phase:** {phase.get("name", phase.get("id", "Unknown"))}
**Service:** {service}

## Description

{description}
""")

    # Recovery context if this is a retry
    if attempt_count > 0:
        sections.append(f"""
## ⚠️ RETRY ATTEMPT ({attempt_count + 1})

This subtask has been attempted {attempt_count} time(s) before without success.
You MUST use a DIFFERENT approach than previous attempts.
""")
        if recovery_hints:
            sections.append("**Previous attempt insights:**")
            for hint in recovery_hints:
                sections.append(f"- {hint}")
            sections.append("")

    # Files section
    sections.append("## Files\n")

    if files_to_modify:
        sections.append("**Files to Modify:**")
        for f in files_to_modify:
            sections.append(f"- `{f}`")
        sections.append("")

    if files_to_create:
        sections.append("**Files to Create:**")
        for f in files_to_create:
            sections.append(f"- `{f}`")
        sections.append("")

    if patterns_from:
        sections.append("**Pattern Files (study these first):**")
        for f in patterns_from:
            sections.append(f"- `{f}`")
        sections.append("")

    # Verification
    sections.append("## Verification\n")
    v_type = verification.get("type", "manual")

    if v_type == "command":
        sections.append(f"""Run this command to verify:
```bash
{verification.get("command", 'echo "No command specified"')}
```
Expected: {verification.get("expected", "Success")}
""")
    elif v_type == "api":
        method = verification.get("method", "GET")
        url = verification.get("url", "http://localhost")
        body = verification.get("body", {})
        expected_status = verification.get("expected_status", 200)
        sections.append(f"""Test the API endpoint:
```bash
curl -X {method} {url} -H "Content-Type: application/json" {f"-d '{json.dumps(body)}'" if body else ""}
```
Expected status: {expected_status}
""")
    elif v_type == "browser":
        url = verification.get("url", "http://localhost:3000")
        checks = verification.get("checks", [])
        sections.append(f"""Open in browser: {url}

Verify:""")
        for check in checks:
            sections.append(f"- [ ] {check}")
        sections.append("")
    elif v_type == "e2e":
        steps = verification.get("steps", [])
        sections.append("End-to-end verification steps:")
        for i, step in enumerate(steps, 1):
            sections.append(f"{i}. {step}")
        sections.append("")
    else:
        instructions = verification.get("instructions", "Manual verification required")
        sections.append(f"**Manual Verification:**\n{instructions}\n")

    # Critical Rules - Enforce "Read Before Write"
    sections.append("""## CRITICAL RULES

1. **READ BEFORE EDIT**: You MUST read the file content immediately before editing it. Do NOT rely on the truncated context provided in this prompt. The context below is for reference only and may be outdated or incomplete.
2. **NO BLIND EDITS**: Editing a file without reading it first is a violation of safety protocols.
3. **REFRESH CONTEXT**: Even if you think you know the file content, things may have changed. ALWAYS read the file again right before applying edits.
""")

    # Instructions
    sections.append(f"""## Instructions

1. **Read the pattern files** to understand code style and conventions
2. **Read the files to modify** (if any) to understand current implementation and refresh your context.
3. **Implement the subtask** following the patterns exactly.
   - Verify imports are correct and available.
   - Verify that the code is correct and does not break existing functionality.
   - Maintain gold standards (DRY, STEP, LEVER, UNIFORM, YAGNI, MODULAR, SINGLE SOURCES OF TRUTH, REUSABLE, [add 12 more here]).
   - Use type hints and docstrings.
4. **Run verification** and fix any issues.
5. **Commit your changes:**
   ```bash
   git add .
   git commit -m "turret: {subtask_id} - {description[:50]}"
   ```
6. **Update the plan** - set this subtask's status to "completed" in implementation_plan.json

## Quality Checklist

Before marking complete, verify:
- [ ] Read files before editing (CRITICAL)
- [ ] Follows patterns from reference files
- [ ] No console.log/print debugging statements
- [ ] Error handling in place
- [ ] Verification passes, and are all subtasks completed?
- [ ] Clean commit with descriptive message

## Important

- Focus ONLY on this subtask - don't touch unrelated code
- If verification fails, FIX IT before committing
- If you encounter a blocker, document it in build-progress.txt
""")

    # Note: Linear updates are now handled by Python orchestrator via linear_updater.py
    # Agents no longer need to call Linear MCP tools directly

    return "\n".join(sections)


def generate_planner_prompt(spec_dir: Path, project_dir: Path | None = None) -> str:
    """
    Generate the planner prompt (used only once at start).
    This is a simplified version that focuses on plan creation.

    Args:
        spec_dir: Directory containing spec.md
        project_dir: Working directory (for relative paths)

    Returns:
        Planner prompt string
    """
    # Load the full planner prompt from file
    prompts_dir = Path(__file__).parent / "prompts"
    planner_file = prompts_dir / "planner.md"

    if planner_file.exists():
        prompt = planner_file.read_text()
    else:
        prompt = (
            "Read spec.md and create implementation_plan.json with phases and subtasks."
        )

    # Use project_dir for relative paths, or infer from spec_dir
    if project_dir is None:
        # Infer: spec_dir is typically project/turret/specs/XXX
        project_dir = spec_dir.parent.parent.parent

    # Get relative path for spec directory
    relative_spec = get_relative_spec_path(spec_dir, project_dir)

    # Build header with environment context
    header = generate_environment_context(project_dir, spec_dir)

    # Add spec-specific instructions
    header += f"""## SPEC LOCATION

Your spec file is located at: `{relative_spec}/spec.md`

Store all build artifacts in this spec directory:
- `{relative_spec}/implementation_plan.json` - Subtask-based implementation plan
- `{relative_spec}/build-progress.txt` - Progress notes
- `{relative_spec}/init.sh` - Environment setup script

The project root is your current working directory. Implement code in the project root,
not in the spec directory.

---

"""
    # Note: Linear task creation and updates are now handled by Python orchestrator
    # via linear_updater.py - agents no longer need Linear instructions in prompts

    return header + prompt


def _smart_load_file(path: Path, max_lines: int) -> str:
    """
    Safely load file content with binary detection and streaming truncation.

    Args:
        path: Path to file
        max_lines: Maximum lines to read

    Returns:
        Content string or error message
    """
    if not path.exists():
        return "(File not found)"

    try:
        # Check for binary content (read first chunk)
        with open(path, "rb") as f:
            chunk = f.read(1024)
            if b"\x00" in chunk:
                return "(Binary file - cannot display content)"

        lines = []
        truncated = False
        
        # Stream lines to avoid memory issues with large files
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    truncated = True
                    break
                lines.append(line.rstrip("\n"))

        content = "\n".join(lines)
        if truncated:
            content += f"\n\n... (truncated, {max_lines} lines shown. Read full file to see more.)"

        return content

    except Exception as e:
        return f"(Error reading file: {e})"


def load_subtask_context(
    spec_dir: Path,
    project_dir: Path,
    subtask: dict,
    max_file_lines: int = 200,
) -> dict:
    """
    Load minimal context needed for a subtask.

    Args:
        spec_dir: Spec directory
        project_dir: Project root
        subtask: The subtask being implemented
        max_file_lines: Maximum lines to include per file

    Returns:
        Dict with file contents and relevant context
    """
    context = {
        "patterns": {},
        "files_to_modify": {},
        "spec_excerpt": None,
    }

    # Load pattern files
    for pattern_path in subtask.get("patterns_from", []):
        full_path = project_dir / pattern_path
        context["patterns"][pattern_path] = _smart_load_file(full_path, max_file_lines)

    # Load files to modify
    for file_path in subtask.get("files_to_modify", []):
        full_path = project_dir / file_path
        context["files_to_modify"][file_path] = _smart_load_file(
            full_path, max_file_lines
        )

    return context


def format_context_for_prompt(context: dict) -> str:
    """
    Format loaded context into a prompt section.

    Args:
        context: Dict from load_subtask_context

    Returns:
        Formatted string to append to prompt
    """
    sections = []

    if context.get("patterns"):
        sections.append("## Reference Files (Patterns to Follow)\n")
        for path, content in context["patterns"].items():
            sections.append(f"### `{path}`\n```\n{content}\n```\n")

    if context.get("files_to_modify"):
        sections.append("## Current File Contents (To Modify)\n")
        for path, content in context["files_to_modify"].items():
            # Add truncation warning with clear instruction
            is_truncated = "truncated" in content.lower() or "more lines" in content
            truncation_warning = ""
            if is_truncated:
                truncation_warning = (
                    f"\nCRITICAL: This file was truncated ({_count_truncated_lines(content)} more lines below).\n"
                    f"YOU MUST use the Read tool to get the COMPLETE file before editing.\n"
                    f"Example: Read {path}\n"
                )
            sections.append(f"### `{path}`\n```\n{content}\n```{truncation_warning}\n")

    return "\n".join(sections)


def _count_truncated_lines(content: str) -> str:
    """
    Extract the truncated line count from content if present.

    Args:
        content: File content that may contain truncation message

    Returns:
        String with line count or default message
    """
    import re

    match = re.search(r"(\d+) more lines", content)
    if match:
        return match.group(1)
    return "many"