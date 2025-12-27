# Pattern Discovery Pipeline Analysis

## Overview
The `PatternDiscoverer` class in `apps/backend/context/pattern_discovery.py` is part of the context building system that discovers code and UI/UX patterns from reference files to guide implementation.

## Pipeline Flow

### 1. **Initialization**
- **Location**: `apps/backend/context/builder.py:34`
- `PatternDiscoverer` is instantiated in `ContextBuilder.__init__()`
- Takes `project_dir` as parameter
- Configurable via `PatternDiscovererConfig` (UI/UX terms, CSS properties, HTML structure)

### 2. **Pattern Discovery Trigger**
- **Location**: `apps/backend/context/builder.py:103` (sync) and `:198` (async)
- Called during `ContextBuilder.build_context()` or `build_context_async()`
- **Input**: 
  - `files_to_reference`: List of `FileMatch` objects (files categorized as reference files, not to be modified)
  - `keywords`: Extracted keywords from task description
- **Method**: `pattern_discoverer.discover_patterns(files_to_reference, keywords, max_files=5)`

### 3. **Pattern Discovery Process**
The `discover_patterns()` method analyzes reference files and extracts:

#### Code Patterns
- Searches for keyword occurrences in code
- Extracts snippets (3 lines before, 4 lines after match)
- Creates pattern keys like `{keyword}_pattern`

#### UI/UX Patterns
- **Tailwind Classes**: Detects utility classes (e.g., `text-`, `bg-`, `w-`, `h-`, padding/margin utilities)
- **CSS Properties**: Extracts CSS rules from `.css`, `.scss`, `.less` files
- **Visual Hierarchy**: Font sizes, weights, headings, text transforms
- **Card/Components**: Detects card, component, panel, container patterns
- **Border/Shadow**: Border and shadow styling patterns
- **Padding/Margin**: Spacing patterns
- **UI Structure**: HTML/React structure tags and semantic elements

### 4. **Output Structure**
Returns a dictionary with keys like:
- `{keyword}_pattern`: Code snippets matching keywords
- `tailwind_classes`: Comma-separated list of Tailwind classes found
- `css_properties`: CSS rules extracted
- `visual_hierarchy`: Visual hierarchy patterns
- `cards_components`: Card/component patterns
- `border_shadow`: Border and shadow patterns
- `padding_margin`: Spacing patterns
- `ui_structure`: UI structure patterns

### 5. **Storage in TaskContext**
- **Location**: `apps/backend/context/builder.py:135` and `:216`
- Patterns stored in `TaskContext.patterns_discovered` field
- Part of the complete context returned by `build_context()`

### 6. **Serialization to JSON**
- **Location**: `apps/backend/context/serialization.py:29`
- `patterns_discovered` is serialized as `"patterns"` in `context.json`
- Saved to spec directory: `{spec_dir}/context.json`

### 7. **Context Discovery Execution**
- **Location**: `apps/backend/spec/context.py:15`
- `run_context_discovery()` runs the context builder script
- Creates `context.json` in the spec directory
- Called during spec creation phase

### 8. **Consumption by Agents**

#### Planner Agent
- **Location**: `apps/backend/planner_lib/context.py:54-58`
- `ContextLoader.load_context()` loads `context.json`
- Patterns available in `PlannerContext.task_context["patterns"]`
- **Prompt Reference**: `apps/backend/prompts/planner.md:130-157`
  - Instructs planner to read `context.json`
  - Mentions patterns should be documented in context.json
  - References `files_to_reference` which contain patterns to copy

#### Coder Agent
- **Location**: `apps/backend/prompts/coder.md:49-50`
- Prompt instructs coder to read `context.json` directly
- **Location**: `apps/backend/prompts_pkg/prompt_generator.py:295-353`
- `load_subtask_context()` loads patterns from `subtask["patterns_from"]` files
- These are specific files referenced in subtasks, not the general patterns from context.json
- Patterns from `patterns_from` are injected into prompts via `format_context_for_prompt()`

### 9. **Pattern Usage in Implementation**
- **Location**: `apps/backend/prompts/coder.md:73-78`
- Coder reads `memory/patterns.md` (accumulated patterns from past sessions)
- **Location**: `apps/backend/prompts/coder.md:202-209`
- Coder is instructed to follow patterns from `patterns_from` files
- Patterns guide:
  - Code style matching
  - Naming conventions
  - Component structure
  - UI/UX styling approaches

## Key Files in Pipeline

1. **Pattern Discovery**: `apps/backend/context/pattern_discovery.py`
2. **Context Builder**: `apps/backend/context/builder.py`
3. **Context Models**: `apps/backend/context/models.py`
4. **Context Serialization**: `apps/backend/context/serialization.py`
5. **Context Discovery**: `apps/backend/spec/context.py`
6. **Planner Context Loader**: `apps/backend/planner_lib/context.py`
7. **Prompt Generator**: `apps/backend/prompts_pkg/prompt_generator.py`
8. **Coder Agent**: `apps/backend/agents/coder.py`

## Usage Points

### Direct Usage
- ✅ **Used in ContextBuilder**: Lines 103, 198
- ✅ **Exported in context package**: `apps/backend/context/__init__.py:29`
- ✅ **Called during context building**: Both sync and async flows

### Indirect Usage
- ✅ **Stored in context.json**: Via serialization
- ✅ **Loaded by planner**: Via ContextLoader
- ✅ **Referenced in prompts**: Planner and coder prompts mention reading context.json
- ⚠️ **Note**: Patterns from `context.json["patterns"]` are not directly injected into prompts - agents read the file themselves. However, `patterns_from` files in subtasks ARE injected.

## Pattern Discovery Configuration

The `PatternDiscovererConfig` class defines:
- **UI_UX_TERMS**: 40+ terms for UI/UX detection (card, component, border, shadow, Tailwind classes, etc.)
- **CSS_PROPERTIES**: 20+ CSS properties to extract
- **HTML_STRUCTURE_TAGS_REGEX**: Regex for semantic HTML/React structure detection

## Limitations & Notes

1. **Max Files**: Only analyzes first 5 reference files by default (`max_files=5`)
2. **Pattern Accumulation**: Patterns from multiple files are merged/accumulated
3. **Truncation**: Pattern content is truncated to ~300-950 characters per pattern type
4. **Not Directly Injected**: Patterns from `context.json["patterns"]` are not automatically injected into agent prompts - agents must read the file themselves
5. **Two Pattern Sources**:
   - General patterns from `context.json["patterns"]` (from PatternDiscoverer)
   - Specific patterns from `subtask["patterns_from"]` files (loaded and injected into prompts)

## Summary

The pattern discovery pipeline is **actively used** in the context building system:
1. ✅ Initialized in ContextBuilder
2. ✅ Executed during context building
3. ✅ Results stored in TaskContext and serialized to context.json
4. ✅ Loaded by planner and coder agents
5. ✅ Referenced in agent prompts

The system helps agents understand codebase patterns, UI/UX conventions, and styling approaches to guide consistent implementation.

