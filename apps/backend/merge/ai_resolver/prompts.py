"""
Prompt Templates
================

Prompt templates for AI-based conflict resolution.

This module contains the prompt templates used to guide the AI
in merging conflicting code changes.
"""

from __future__ import annotations
from typing import Optional

# Default system prompt for the AI
DEFAULT_SYSTEM_PROMPT = "You are an expert code merge assistant. Your primary goal is to preserve ALL functionality from ALL tasks being merged. Never remove features or reduce code quality. When in doubt, include more rather than less."

# Legacy constant for backward compatibility
SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT

# Main merge prompt template
MERGE_PROMPT_TEMPLATE = """You are a code merge assistant. Your task is to merge changes from multiple development tasks into a single coherent result.

CONTEXT:
{context}

INSTRUCTIONS:
1. Analyze what each task intended to accomplish
2. Merge the changes so that ALL task intents are preserved
3. Resolve any conflicts by understanding the semantic purpose
4. Output ONLY the merged code - no explanations

CRITICAL RULES - NEVER VIOLATE:
- NEVER remove existing functions, methods, or features from any task
- NEVER reduce the total count of features, imports, or capabilities
- ONLY add or edit code - deletion is FORBIDDEN unless explicitly replacing with better implementation
- If tasks conflict, find a way to include BOTH approaches, not choose one
- When in doubt, include MORE code rather than less
- Preserve ALL functionality from ALL tasks - no features should be lost

MERGE RULES:
- All imports from all tasks MUST be included (combine and deduplicate)
- All hook calls MUST be preserved (order matters: earlier tasks first)
- All component props MUST be preserved from all tasks
- All state variables MUST be preserved from all tasks
- If tasks modify the same function, COMBINE their changes - never discard one version
- If tasks add different features to the same area, include ALL features
- If tasks wrap JSX differently, apply wrappings from outside-in (earlier task = outer)
- Preserve code style consistency

OUTPUT FORMAT:
Return only the merged code block, wrapped in triple backticks with the language:
```{language}
merged code here
```

Merge the code now:"""

# Batch merge prompt template for multiple conflicts in the same file
BATCH_MERGE_PROMPT_TEMPLATE = """You are a code merge assistant. Your task is to merge changes from multiple development tasks.

There are {num_conflicts} conflict regions in {file_path}. Resolve each one.

{combined_context}

For each conflict region, output the merged code in a separate code block labeled with the location:

## Location: <location>
```{language}
merged code
```

Resolve all conflicts now:"""


def format_merge_prompt(context: str, language: str) -> str:
    """
    Format the main merge prompt.

    Args:
        context: The conflict context to include
        language: Programming language for code block formatting

    Returns:
        Formatted prompt string
    """
    return MERGE_PROMPT_TEMPLATE.format(context=context, language=language)


def format_batch_merge_prompt(
    file_path: str,
    num_conflicts: int,
    combined_context: str,
    language: str,
) -> str:
    """
    Format the batch merge prompt for multiple conflicts.

    Args:
        file_path: Path to the file with conflicts
        num_conflicts: Number of conflicts to resolve
        combined_context: Combined context from all conflicts
        language: Programming language for code block formatting

    Returns:
        Formatted batch prompt string
    """
    return BATCH_MERGE_PROMPT_TEMPLATE.format(
        file_path=file_path,
        num_conflicts=num_conflicts,
        combined_context=combined_context,
        language=language,
    )


def build_system_prompt_from_config(config: Optional[dict] = None) -> str:
    """
    Build the system prompt from merge configuration.

    Args:
        config: Merge configuration dict with keys:
            - systemPrompt: Custom system prompt override
            - preventDeletion: Prevent code deletion
            - preventFeatureReduction: Prevent feature reduction
            - preserveAllImports: Preserve all imports
            - preserveAllHooks: Preserve all hooks
            - preserveAllProps: Preserve all props
            - preserveAllState: Preserve all state
            - combineConflicts: Combine both approaches
            - includeMoreWhenUncertain: Include more when uncertain
            - customInstructions: Additional custom instructions

    Returns:
        Complete system prompt string
    """
    if not config:
        return DEFAULT_SYSTEM_PROMPT

    # Use custom system prompt if provided, otherwise use default
    return config.get('systemPrompt', DEFAULT_SYSTEM_PROMPT)


def build_merge_rules_from_config(config: Optional[dict] = None) -> str:
    """
    Build the critical rules and merge rules sections from configuration.

    Args:
        config: Merge configuration dict

    Returns:
        String containing critical and merge rules
    """
    if not config:
        # Return default rules
        return """CRITICAL RULES - NEVER VIOLATE:
- NEVER remove existing functions, methods, or features from any task
- NEVER reduce the total count of features, imports, or capabilities
- ONLY add or edit code - deletion is FORBIDDEN unless explicitly replacing with better implementation
- If tasks conflict, find a way to include BOTH approaches, not choose one
- When in doubt, include MORE code rather than less
- Preserve ALL functionality from ALL tasks - no features should be lost

MERGE RULES:
- All imports from all tasks MUST be included (combine and deduplicate)
- All hook calls MUST be preserved (order matters: earlier tasks first)
- All component props MUST be preserved from all tasks
- All state variables MUST be preserved from all tasks
- If tasks modify the same function, COMBINE their changes - never discard one version
- If tasks add different features to the same area, include ALL features
- If tasks wrap JSX differently, apply wrappings from outside-in (earlier task = outer)
- Preserve code style consistency"""

    rules = []

    # Critical rules section
    if config.get('preventDeletion', True) or config.get('preventFeatureReduction', True):
        critical_rules = ["CRITICAL RULES - NEVER VIOLATE:"]

        if config.get('preventDeletion', True):
            critical_rules.append("- NEVER remove existing functions, methods, or features from any task")

        if config.get('preventFeatureReduction', True):
            critical_rules.append("- NEVER reduce the total count of features, imports, or capabilities")
            critical_rules.append("- ONLY add or edit code - deletion is FORBIDDEN unless explicitly replacing with better implementation")

        if config.get('combineConflicts', True):
            critical_rules.append("- If tasks conflict, find a way to include BOTH approaches, not choose one")

        if config.get('includeMoreWhenUncertain', True):
            critical_rules.append("- When in doubt, include MORE code rather than less")

        critical_rules.append("- Preserve ALL functionality from ALL tasks - no features should be lost")

        rules.append("\n".join(critical_rules))

    # Merge rules section
    merge_rules = ["MERGE RULES:"]

    if config.get('preserveAllImports', True):
        merge_rules.append("- All imports from all tasks MUST be included (combine and deduplicate)")

    if config.get('preserveAllHooks', True):
        merge_rules.append("- All hook calls MUST be preserved (order matters: earlier tasks first)")

    if config.get('preserveAllProps', True):
        merge_rules.append("- All component props MUST be preserved from all tasks")

    if config.get('preserveAllState', True):
        merge_rules.append("- All state variables MUST be preserved from all tasks")

    merge_rules.append("- If tasks modify the same function, COMBINE their changes - never discard one version")
    merge_rules.append("- If tasks add different features to the same area, include ALL features")
    merge_rules.append("- If tasks wrap JSX differently, apply wrappings from outside-in (earlier task = outer)")
    merge_rules.append("- Preserve code style consistency")

    rules.append("\n".join(merge_rules))

    # Add custom instructions if provided
    if config.get('customInstructions'):
        rules.append(f"\nCUSTOM INSTRUCTIONS:\n{config['customInstructions']}")

    return "\n\n".join(rules)


def build_merge_prompt_from_config(context: str, language: str, config: Optional[dict] = None) -> str:
    """
    Build the merge prompt from configuration.

    Args:
        context: The conflict context to include
        language: Programming language for code block formatting
        config: Merge configuration dict

    Returns:
        Formatted prompt string with configured rules
    """
    rules = build_merge_rules_from_config(config)

    return f"""You are a code merge assistant. Your task is to merge changes from multiple development tasks into a single coherent result.

CONTEXT:
{context}

INSTRUCTIONS:
1. Analyze what each task intended to accomplish
2. Merge the changes so that ALL task intents are preserved
3. Resolve any conflicts by understanding the semantic purpose
4. Output ONLY the merged code - no explanations

{rules}

OUTPUT FORMAT:
Return only the merged code block, wrapped in triple backticks with the language:
```{language}
merged code here
```

Merge the code now:"""
