"""
Task Refinement Service
=======================

AI-powered task refinement using Claude Haiku for fast, cost-effective
expansion of brief task descriptions into structured task data.

Uses the Claude Agent SDK (same as the rest of the system) for refinement.
Returns a structured dict with all task fields on success, or raises an exception on failure.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Check for Claude SDK availability
try:
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False
    ClaudeAgentOptions = None
    ClaudeSDKClient = None

from core.auth import ensure_claude_code_oauth_token, get_auth_token

# Default model for task refinement (fast and cheap)
DEFAULT_REFINEMENT_MODEL = "claude-3-5-haiku-latest"

# Maximum tokens for refinement response
MAX_TOKENS = 1024


@dataclass
class TaskRefinementResult:
    """Result of task refinement."""

    title: str
    description: str
    category: str
    priority: str
    complexity: str
    impact: str

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary."""
        return {
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "priority": self.priority,
            "complexity": self.complexity,
            "impact": self.impact,
        }


def is_refinement_available() -> bool:
    """Check if task refinement is available."""
    if not SDK_AVAILABLE:
        return False
    if not get_auth_token():
        return False
    return True


def get_refinement_model() -> str:
    """Get the model to use for task refinement."""
    return os.environ.get("TASK_REFINEMENT_MODEL", DEFAULT_REFINEMENT_MODEL)


def _build_refinement_prompt(brief_description: str) -> str:
    """
    Build the prompt for task refinement.

    Args:
        brief_description: Brief task description from the user

    Returns:
        Formatted prompt for the LLM
    """
    return f"""You are a task refinement assistant. Given a brief task description, expand it into a complete, well-structured task with all required fields.

Brief description: {brief_description}

Analyze this description and provide a refined task with the following fields:

1. **title**: A clear, concise title (5-10 words) that summarizes the task
2. **description**: A detailed description (2-3 sentences) explaining what needs to be done, including any relevant context or acceptance criteria
3. **category**: Choose the most appropriate category:
   - "feature" - New functionality or capability
   - "bug" - Fix for broken or incorrect behavior
   - "refactor" - Code improvement without changing behavior
   - "documentation" - Documentation updates or additions
   - "testing" - Test additions or improvements
   - "chore" - Maintenance tasks, dependencies, etc.
4. **priority**: Choose based on urgency and importance:
   - "critical" - Must be done immediately, blocking other work
   - "high" - Important, should be done soon
   - "medium" - Normal priority
   - "low" - Nice to have, can wait
5. **complexity**: Estimate the implementation effort:
   - "simple" - Quick task, few hours
   - "moderate" - Medium effort, 1-2 days
   - "complex" - Significant effort, multiple days
6. **impact**: Assess the business/user impact:
   - "high" - Major user-facing impact or critical infrastructure
   - "medium" - Noticeable improvement or moderate importance
   - "low" - Minor improvement or internal-only

Respond with ONLY a valid JSON object containing these exact keys: title, description, category, priority, complexity, impact.
Do not include markdown code blocks or any other text. Just the raw JSON object."""


def _parse_refinement_response(response_text: str) -> TaskRefinementResult:
    """
    Parse the LLM response into a TaskRefinementResult.

    Args:
        response_text: Raw LLM response

    Returns:
        TaskRefinementResult with parsed fields

    Raises:
        ValueError: If parsing fails or required fields are missing
    """
    text = response_text.strip()

    # Handle markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse refinement response as JSON: {e}")
        logger.debug(f"Response text: {text[:500]}")
        raise ValueError(f"Invalid JSON response from AI: {e}")

    if not isinstance(data, dict):
        raise ValueError("AI response is not a JSON object")

    # Validate required fields
    required_fields = ["title", "description", "category", "priority", "complexity", "impact"]
    missing_fields = [f for f in required_fields if f not in data or not data[f]]

    if missing_fields:
        raise ValueError(f"Missing required fields in AI response: {', '.join(missing_fields)}")

    # Validate enum values
    valid_categories = {"feature", "bug", "refactor", "documentation", "testing", "chore"}
    valid_priorities = {"critical", "high", "medium", "low"}
    valid_complexities = {"simple", "moderate", "complex"}
    valid_impacts = {"high", "medium", "low"}

    category = data["category"].lower()
    priority = data["priority"].lower()
    complexity = data["complexity"].lower()
    impact = data["impact"].lower()

    # Normalize to valid values (fallback to reasonable defaults if AI returns unexpected values)
    if category not in valid_categories:
        logger.warning(f"Invalid category '{category}', defaulting to 'feature'")
        category = "feature"

    if priority not in valid_priorities:
        logger.warning(f"Invalid priority '{priority}', defaulting to 'medium'")
        priority = "medium"

    if complexity not in valid_complexities:
        logger.warning(f"Invalid complexity '{complexity}', defaulting to 'moderate'")
        complexity = "moderate"

    if impact not in valid_impacts:
        logger.warning(f"Invalid impact '{impact}', defaulting to 'medium'")
        impact = "medium"

    return TaskRefinementResult(
        title=str(data["title"]).strip(),
        description=str(data["description"]).strip(),
        category=category,
        priority=priority,
        complexity=complexity,
        impact=impact,
    )


async def _run_refinement(brief_description: str) -> TaskRefinementResult:
    """
    Run the refinement using Claude Agent SDK.

    Args:
        brief_description: Brief task description to refine

    Returns:
        TaskRefinementResult with all refined fields

    Raises:
        RuntimeError: If SDK is not available or refinement fails
    """
    if not SDK_AVAILABLE:
        raise RuntimeError("Claude Agent SDK is not installed")

    if not get_auth_token():
        raise RuntimeError("No authentication token found")

    # Ensure SDK can find the token
    ensure_claude_code_oauth_token()

    model = get_refinement_model()
    prompt = _build_refinement_prompt(brief_description)

    # Create a minimal SDK client for task refinement
    client = ClaudeSDKClient(
        options=ClaudeAgentOptions(
            model=model,
            system_prompt=(
                "You are a task refinement assistant that expands brief task descriptions "
                "into well-structured, detailed tasks. Always respond with valid JSON only."
            ),
            allowed_tools=[],  # No tools needed for refinement
            max_turns=1,  # Single turn refinement
        )
    )

    try:
        # Use async context manager to handle connect/disconnect
        async with client:
            await client.query(prompt)

            # Collect the response
            response_text = ""
            async for msg in client.receive_response():
                msg_type = type(msg).__name__
                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        if hasattr(block, "text"):
                            response_text += block.text

        logger.info(f"Task refinement response: {len(response_text)} chars")

        if not response_text.strip():
            raise RuntimeError("Empty response from AI")

        return _parse_refinement_response(response_text)

    except Exception as e:
        logger.error(f"Task refinement failed: {e}")
        raise RuntimeError(f"Task refinement failed: {e}")


def refine_task_with_ai(brief_description: str) -> dict[str, Any]:
    """
    Refine a brief task description into a complete task using AI.

    This is the main entry point for task refinement, called from IPC handlers.
    Uses Claude Haiku for fast, cost-effective refinement.

    Args:
        brief_description: Brief task description (e.g., "add dark mode toggle")

    Returns:
        Dict with refined task fields:
        - title: Clear, concise task title
        - description: Detailed task description
        - category: One of: feature, bug, refactor, documentation, testing, chore
        - priority: One of: critical, high, medium, low
        - complexity: One of: simple, moderate, complex
        - impact: One of: high, medium, low

    Raises:
        ValueError: If brief_description is empty or whitespace-only
        RuntimeError: If SDK is unavailable, auth fails, or AI call fails
    """
    # Validate input
    if not brief_description or not brief_description.strip():
        raise ValueError("Brief description cannot be empty")

    brief_description = brief_description.strip()

    # Check availability before attempting refinement
    if not is_refinement_available():
        if not SDK_AVAILABLE:
            raise RuntimeError("Claude Agent SDK is not installed")
        if not get_auth_token():
            raise RuntimeError("No authentication token found for AI refinement")

    logger.info(f"Refining task: '{brief_description[:50]}...'")

    try:
        result = asyncio.run(_run_refinement(brief_description))
        return result.to_dict()
    except Exception as e:
        logger.error(f"Task refinement error: {e}")
        raise
