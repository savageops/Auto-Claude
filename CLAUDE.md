# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Turret is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It uses the Claude Agent SDK to run agents in isolated workspaces with security controls.

**CRITICAL: All AI interactions use the Claude Agent SDK (`claude-agent-sdk` package), NOT the Anthropic API directly.**

## Project Structure

```
autonomous-coding/
├── apps/
│   ├── backend/           # Python backend/CLI - ALL agent logic lives here
│   │   ├── core/          # Client, auth, security
│   │   ├── agents/        # Agent implementations
│   │   ├── spec_agents/   # Spec creation agents
│   │   ├── integrations/  # Graphiti, Linear, GitHub
│   │   └── prompts/       # Agent system prompts
│   └── frontend/          # Electron desktop UI
├── guides/                # Documentation
├── tests/                 # Test suite
└── scripts/               # Build and utility scripts
```

**When working with AI/LLM code:**
- Look in `apps/backend/core/client.py` for the Claude SDK client setup
- Reference `apps/backend/agents/` for working agent implementations
- Check `apps/backend/spec_agents/` for spec creation agent examples
- NEVER use `anthropic.Anthropic()` directly - always use `create_client()` from `core.client`

**Frontend (Electron Desktop App):**
- Built with Electron, React, TypeScript
- AI agents can perform E2E testing using the Electron MCP server
- When bug fixing or implementing features, use the Electron MCP server for automated testing
- See "End-to-End Testing" section below for details

## Commands

### Setup

**Requirements:**
- Python 3.12+ (required for backend)
- Node.js (for frontend)

```bash
# Install all dependencies from root
npm run install:all

# Or install separately:
# Backend (from apps/backend/)
cd apps/backend && uv venv && uv pip install -r requirements.txt

# Frontend (from apps/frontend/)
cd apps/frontend && npm install

# Set up OAuth token
claude setup-token
# Add to apps/backend/.env: CLAUDE_CODE_OAUTH_TOKEN=your-token
```

### Creating and Running Specs
```bash
cd apps/backend

# Create a spec interactively
python spec_runner.py --interactive

# Create spec from task description
python spec_runner.py --task "Add user authentication"

# Force complexity level (simple/standard/complex)
python spec_runner.py --task "Fix button" --complexity simple

# Run autonomous build
python run.py --spec 001

# List all specs
python run.py --list
```

### Workspace Management
```bash
cd apps/backend

# Review changes in isolated worktree
python run.py --spec 001 --review

# Merge completed build into project
python run.py --spec 001 --merge

# Discard build
python run.py --spec 001 --discard
```

### QA Validation
```bash
cd apps/backend

# Run QA manually
python run.py --spec 001 --qa

# Check QA status
python run.py --spec 001 --qa-status
```

### Testing
```bash
# Install test dependencies (required first time)
cd apps/backend && uv pip install -r ../../tests/requirements-test.txt

# Run all tests (use virtual environment pytest)
apps/backend/.venv/bin/pytest tests/ -v

# Run single test file
apps/backend/.venv/bin/pytest tests/test_security.py -v

# Run specific test
apps/backend/.venv/bin/pytest tests/test_security.py::test_bash_command_validation -v

# Skip slow tests
apps/backend/.venv/bin/pytest tests/ -m "not slow"

# Or from root
npm run test:backend
```

### Spec Validation
```bash
python apps/backend/validate_spec.py --spec-dir apps/backend/specs/001-feature --checkpoint all
```

### Releases
```bash
# 1. Bump version on your branch (creates commit, no tag)
node scripts/bump-version.js patch   # 2.8.0 -> 2.8.1
node scripts/bump-version.js minor   # 2.8.0 -> 2.9.0
node scripts/bump-version.js major   # 2.8.0 -> 3.0.0

# 2. Push and create PR to main
git push origin your-branch
gh pr create --base main

# 3. Merge PR → GitHub Actions automatically:
#    - Creates tag
#    - Builds all platforms
#    - Creates release with changelog
#    - Updates README
```

See [RELEASE.md](RELEASE.md) for detailed release process documentation.

## Architecture

### Core Pipeline

**Spec Creation (spec_runner.py)** - Dynamic 3-8 phase pipeline based on task complexity:
- SIMPLE (3 phases): Discovery → Quick Spec → Validate
- STANDARD (6-7 phases): Discovery → Requirements → [Research] → Context → Spec → Plan → Validate
- COMPLEX (8 phases): Full pipeline with Research and Self-Critique phases

**Implementation (run.py → agent.py)** - Multi-session build:
1. Planner Agent creates subtask-based implementation plan
2. Coder Agent implements subtasks (can spawn subagents for parallel work)
3. QA Reviewer validates acceptance criteria (can perform E2E testing via Electron MCP for frontend changes)
4. QA Fixer resolves issues in a loop (with E2E testing to verify fixes)

### Key Components (apps/backend/)

**Core Infrastructure:**
- **core/client.py** - Claude Agent SDK client factory with security hooks and tool permissions
- **core/security.py** - Dynamic command allowlisting based on detected project stack
- **core/auth.py** - OAuth token management for Claude SDK authentication
- **agents/** - Agent implementations (planner, coder, qa_reviewer, qa_fixer)
- **spec_agents/** - Spec creation agents (gatherer, researcher, writer, critic)

**Memory & Context:**
- **integrations/graphiti/** - Graphiti memory system (mandatory)
  - `queries_pkg/graphiti.py` - Main GraphitiMemory class
  - `queries_pkg/client.py` - LadybugDB client wrapper
  - `queries_pkg/queries.py` - Graph query operations
  - `queries_pkg/search.py` - Semantic search logic
  - `queries_pkg/schema.py` - Graph schema definitions
- **graphiti_config.py** - Configuration and validation for Graphiti integration
- **graphiti_providers.py** - Multi-provider factory (OpenAI, Anthropic, Azure, Ollama, Google AI)
- **agents/memory_manager.py** - Session memory orchestration

**Workspace & Security:**
- **cli/worktree.py** - Git worktree isolation for safe feature development
- **context/project_analyzer.py** - Project stack detection for dynamic tooling
- **turret_tools.py** - Custom MCP tools integration

**Integrations:**
- **linear_updater.py** - Optional Linear integration for progress tracking
- **runners/github/** - GitHub Issues & PRs automation
- **Electron MCP** - E2E testing integration for QA agents (Chrome DevTools Protocol)
  - Enabled with `ELECTRON_MCP_ENABLED=true` in `.env`
  - Allows QA agents to interact with running Electron app
  - See "End-to-End Testing" section for details

### Agent Prompts (apps/backend/prompts/)

| Prompt | Purpose |
|--------|---------|
| planner.md | Creates implementation plan with subtasks |
| coder.md | Implements individual subtasks |
| coder_recovery.md | Recovers from stuck/failed subtasks |
| qa_reviewer.md | Validates acceptance criteria |
| qa_fixer.md | Fixes QA-reported issues |
| spec_gatherer.md | Collects user requirements |
| spec_researcher.md | Validates external integrations |
| spec_writer.md | Creates spec.md document |
| spec_critic.md | Self-critique using ultrathink |
| complexity_assessor.md | AI-based complexity assessment |

### Spec Directory Structure

Each spec in `.turret/specs/XXX-name/` contains:
- `spec.md` - Feature specification
- `requirements.json` - Structured user requirements
- `context.json` - Discovered codebase context
- `implementation_plan.json` - Subtask-based plan with status tracking
- `qa_report.md` - QA validation results
- `QA_FIX_REQUEST.md` - Issues to fix (when rejected)

### Branching & Worktree Strategy

Turret uses git worktrees for isolated builds. All branches stay LOCAL until user explicitly pushes:

```
main (user's branch)
└── turret/{spec-name}  ← spec branch (isolated worktree)
```

**Key principles:**
- ONE branch per spec (`turret/{spec-name}`)
- Parallel work uses subagents (agent decides when to spawn)
- NO automatic pushes to GitHub - user controls when to push
- User reviews in spec worktree (`.worktrees/{spec-name}/`)
- Final merge: spec branch → main (after user approval)

**Workflow:**
1. Build runs in isolated worktree on spec branch
2. Agent implements subtasks (can spawn subagents for parallel work)
3. User tests feature in `.worktrees/{spec-name}/`
4. User runs `--merge` to add to their project
5. User pushes to remote when ready

### Security Model

Three-layer defense:
1. **OS Sandbox** - Bash command isolation
2. **Filesystem Permissions** - Operations restricted to project directory
3. **Command Allowlist** - Dynamic allowlist from project analysis (security.py + project_analyzer.py)

Security profile cached in `.turret-security.json`.

### Claude Agent SDK Integration

**CRITICAL: Turret uses the Claude Agent SDK for ALL AI interactions. Never use the Anthropic API directly.**

**Client Location:** `apps/backend/core/client.py`

The `create_client()` function creates a configured `ClaudeSDKClient` instance with:
- Multi-layered security (sandbox, permissions, security hooks)
- Agent-specific tool permissions (planner, coder, qa_reviewer, qa_fixer)
- Dynamic MCP server integration based on project capabilities
- Extended thinking token budget control

**Example usage in agents:**
```python
from core.client import create_client

# Create SDK client (NOT raw Anthropic API client)
client = create_client(
    project_dir=project_dir,
    spec_dir=spec_dir,
    model="claude-sonnet-4-5-20250929",
    agent_type="coder",
    max_thinking_tokens=None  # or 5000/10000/16000
)

# Run agent session
response = client.create_agent_session(
    name="coder-agent-session",
    starting_message="Implement the authentication feature"
)
```

**Why use the SDK:**
- Pre-configured security (sandbox, allowlists, hooks)
- Automatic MCP server integration (Context7, Linear, Graphiti, Electron, Puppeteer)
- Tool permissions based on agent role
- Session management and recovery
- Unified API across all agent types

**Where to find working examples:**
- `apps/backend/agents/planner.py` - Planner agent
- `apps/backend/agents/coder.py` - Coder agent
- `apps/backend/agents/qa_reviewer.py` - QA reviewer
- `apps/backend/agents/qa_fixer.py` - QA fixer
- `apps/backend/spec_agents/` - Spec creation agents

### Memory System

**Graphiti Memory (Mandatory)** - `integrations/graphiti/`

Turret uses Graphiti as its primary memory system with embedded LadybugDB (no Docker required):

- **Graph database with semantic search** - Knowledge graph for cross-session context
- **Session insights** - Patterns, gotchas, discoveries automatically extracted
- **Multi-provider support:**
  - LLM: OpenAI, Anthropic, Azure OpenAI, Ollama, Google AI (Gemini)
  - Embedders: OpenAI, Voyage AI, Azure OpenAI, Ollama, Google AI
- **Modular architecture:** (`integrations/graphiti/queries_pkg/`)
  - `graphiti.py` - Main GraphitiMemory class
  - `client.py` - LadybugDB client wrapper
  - `queries.py` - Graph query operations
  - `search.py` - Semantic search logic
  - `schema.py` - Graph schema definitions

**Configuration:**
- Set provider credentials in `apps/backend/.env` (see `.env.example`)
- Required env vars: `GRAPHITI_ENABLED=true`, `ANTHROPIC_API_KEY` or other provider keys
- Memory data stored in `.turret/specs/XXX/graphiti/`

**Usage in agents:**
```python
from integrations.graphiti.memory import get_graphiti_memory

memory = get_graphiti_memory(spec_dir, project_dir)
context = memory.get_context_for_session("Implementing feature X")
memory.add_session_insight("Pattern: use React hooks for state")
```

## Development Guidelines

### Frontend Internationalization (i18n)

**CRITICAL: Always use i18n translation keys for all user-facing text in the frontend.**

The frontend uses `react-i18next` for internationalization. All labels, buttons, messages, and user-facing text MUST use translation keys.

**Translation file locations:**
- `apps/frontend/src/shared/i18n/locales/en/*.json` - English translations
- `apps/frontend/src/shared/i18n/locales/fr/*.json` - French translations

**Translation namespaces:**
- `common.json` - Shared labels, buttons, common terms
- `navigation.json` - Sidebar navigation items, sections
- `settings.json` - Settings page content
- `dialogs.json` - Dialog boxes and modals
- `tasks.json` - Task/spec related content
- `onboarding.json` - Onboarding wizard content
- `welcome.json` - Welcome screen content

**Usage pattern:**
```tsx
import { useTranslation } from 'react-i18next';

// In component
const { t } = useTranslation(['navigation', 'common']);

// Use translation keys, NOT hardcoded strings
<span>{t('navigation:items.githubPRs')}</span>  // ✅ CORRECT
<span>GitHub PRs</span>                          // ❌ WRONG
```

**When adding new UI text:**
1. Add the translation key to ALL language files (at minimum: `en/*.json` and `fr/*.json`)
2. Use `namespace:section.key` format (e.g., `navigation:items.githubPRs`)
3. Never use hardcoded strings in JSX/TSX files

### AutoMem Memory Association

**CRITICAL: When storing memories in AutoMem, always associate related memories using the correct relation types.**

AutoMem supports the following relation types for associating memories:

**Relation Types:**

| Type | When to Use | Example |
|------|-------------|---------|
| `CONTRADICTS` | Memory conflicts with or invalidates another | "Prefer early returns" contradicts "Use nested conditionals" |
| `DERIVED_FROM` | Memory is a conclusion drawn from another | "Use h-1.5 for progress bars" derived from "RoadmapGenerationProgress pattern" |
| `EVOLVED_INTO` | Memory represents an evolution of a previous approach | "No Component Pop-ins pattern" evolved from "Skeleton loading approach" |
| `EXEMPLIFIES` | Memory is a concrete example of a general principle | "WorkspaceStatus loading state" exemplifies "No Component Pop-ins" |
| `EXPLAINS` | Memory provides reasoning/context for another | "Topographic spacing system" explains "Use .5 increments" |
| `INVALIDATED_BY` | Memory was made obsolete by new information | "CSS animations" invalidated by "Use framer-motion standard" |
| `LEADS_TO` | Memory caused or resulted in another decision | "User prefers no pop-ins" leads to "Structure stability pattern" |
| `OCCURRED_BEFORE` | Temporal relationship between memories | "First skeleton attempt" occurred before "Framer-motion redesign" |
| `PARALLEL_CONTEXT` | Memories exist in similar but separate contexts | "Backend loading patterns" parallel context to "Frontend loading patterns" |
| `PART_OF` | Memory belongs to a larger concept/system | "Progress bar height h-1.5" part of "Design system requirements" |
| `PRECEDED_BY` | Memory follows chronologically from another | "Final implementation" preceded by "Design research phase" |
| `PREFERS_OVER` | Memory documents a preference between alternatives | "Framer-motion" prefers over "CSS animations" |
| `REINFORCES` | Memory strengthens or supports another | "RoadmapGenerationProgress pattern" reinforces "Design system consistency" |
| `RELATES_TO` | General relationship between memories | "Loading states" relates to "User experience" |
| `SHARES_THEME` | Memories share common themes/topics | "Spacing system" shares theme with "Color opacity system" |
| `SIMILAR_TO` | Memories are analogous or comparable | "Topographic spacing" similar to "Topographic colors" |

**Best Practices:**

1. **Use specific relation types** - Prefer `EXEMPLIFIES`, `DERIVED_FROM`, `PREFERS_OVER` over generic `RELATES_TO`
2. **Create bidirectional associations** - Associate both memories with complementary relation types
3. **Build knowledge graphs** - Link design decisions to their rationale using `EXPLAINS` and `LEADS_TO`
4. **Document evolution** - Use `EVOLVED_INTO` and `INVALIDATED_BY` to track design pattern changes
5. **Mark preferences** - Use `PREFERS_OVER` to document user/project preferences clearly

**Example Usage:**
```python
# Store a design pattern
pattern_id = store_memory({
  content: "Progress bars use h-1.5 height, rounded-full container, framer-motion animation",
  importance: 0.95,
  tags: ["design-system", "golden-standard", "ui-patterns"]
})

# Store the source it was derived from
source_id = store_memory({
  content: "RoadmapGenerationProgress.tsx is the canonical pattern for loading states",
  importance: 0.90,
  tags: ["design-system", "reference-implementation"]
})

# Associate them
associate_memories(pattern_id, source_id, "DERIVED_FROM")
associate_memories(source_id, pattern_id, "EXEMPLIFIES")
```

### UI Loading States - No Component Pop-ins

**CRITICAL DESIGN RULE: Components must render their full structure immediately. Loading states show placeholder VALUES, never hide entire sections.**

This prevents jarring layout shifts and creates a professional, polished user experience.

**Core Pattern:**
- ✅ Full component structure visible on mount
- ✅ Placeholder values during loading (skeleton text, loading spinners, subtle progress bars)
- ✅ Smooth transitions from placeholder → real data (animate values only, not layout)
- ✅ Progress indicators blend into the design system (subtle, integrated)
- ❌ Never hide/show entire sections based on loading state
- ❌ Never mount/unmount components conditionally for loading
- ❌ Never let components "pop in" after data loads

**Anti-Pattern Example:**
```tsx
// ❌ WRONG - component pops in when data loads
{isLoadingPreview && !data ? null : <StatusCard data={data} />}
```

**Golden Standard Example:**
```tsx
// ✅ CORRECT - structure always visible, values update smoothly
<div className="p-2.5 rounded-lg border bg-muted/30">
  <div className="flex-1 space-y-1.5">
    <div className="flex items-center gap-2">
      {isLoading ? (
        <>
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground/80">Analyzing...</span>
        </>
      ) : (
        <>
          <CheckCircle className="h-4 w-4 text-success" />
          <span className="text-sm font-medium text-success">{data.status}</span>
        </>
      )}
    </div>

    {/* Progress bar - visible when loading, matching RoadmapGenerationProgress */}
    {isLoading && (
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute h-full w-1/3 rounded-sm bg-primary"
          animate={{ x: ['-100%', '400%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ opacity: 0.7 }}
        />
      </div>
    )}
  </div>
</div>
```

**Design System Requirements:**
- **Progress Bars**: Use `h-1.5` height, `rounded-full` container, `rounded-sm` fill
- **Animation**: Use `motion` from `motion/react` (framer-motion), NOT CSS animations
- **Spacing**: Clean, tight padding (`p-2.5`, `space-y-1.5`, consistent gaps)
- **Colors**: Topographic monochromatic scheme with opacity variations (0.7, 0.8, 1.0)
  - Loading: `bg-muted/30`, `text-muted-foreground/80`
  - Success: `bg-success/10`, `text-success`
  - Warning: `bg-warning/10`, `text-warning`
  - Error: `bg-destructive/10`, `text-destructive`
- **Transitions**: Use `transition-all duration-300` for smooth state changes

**Real-World Example (Merge Preview in TaskReview):**
- Card structure ALWAYS identical (same padding, border, spacing)
- Loading state: placeholder text + indeterminate progress bar (h-1.5, framer-motion)
- Loaded state: real data, no progress bar
- Only content/opacity changes, structure remains 100% stable
- Matches RoadmapGenerationProgress design system exactly

**Reference Implementation:**
See `RoadmapGenerationProgress.tsx` (lines 342-369) for the canonical progress bar pattern used throughout the app.

**Why This Matters:**
- **Professional UX** - No jarring layout shifts or pop-in effects
- **Perceived Performance** - User sees progress immediately, feels faster
- **Consistent Structure** - User knows what to expect, reduces cognitive load
- **Design Consistency** - Progress bars look identical across the entire app
- **Clean, Sharp Aesthetic** - Topographic monochromatic design with tight padding

This is a **UNIVERSAL PRINCIPLE** - apply to all loading states across the application.

### End-to-End Testing (Electron App)

**IMPORTANT: When bug fixing or implementing new features in the frontend, AI agents can perform automated E2E testing using the Electron MCP server.**

The Electron MCP server allows QA agents to interact with the running Electron app via Chrome DevTools Protocol:

**Setup:**
1. Start the Electron app with remote debugging enabled:
   ```bash
   npm run dev  # Already configured with --remote-debugging-port=9222
   ```

2. Enable Electron MCP in `apps/backend/.env`:
   ```bash
   ELECTRON_MCP_ENABLED=true
   ELECTRON_DEBUG_PORT=9222  # Default port
   ```

**Available Testing Capabilities:**

QA agents (`qa_reviewer` and `qa_fixer`) automatically get access to Electron MCP tools:

1. **Window Management**
   - `mcp__electron__get_electron_window_info` - Get info about running windows
   - `mcp__electron__take_screenshot` - Capture screenshots for visual verification

2. **UI Interaction**
   - `mcp__electron__send_command_to_electron` with commands:
     - `click_by_text` - Click buttons/links by visible text
     - `click_by_selector` - Click elements by CSS selector
     - `fill_input` - Fill form fields by placeholder or selector
     - `select_option` - Select dropdown options
     - `send_keyboard_shortcut` - Send keyboard shortcuts (Enter, Ctrl+N, etc.)
     - `navigate_to_hash` - Navigate to hash routes (#settings, #create, etc.)

3. **Page Inspection**
   - `get_page_structure` - Get organized overview of page elements
   - `debug_elements` - Get debugging info about buttons and forms
   - `verify_form_state` - Check form state and validation
   - `eval` - Execute custom JavaScript code

4. **Logging**
   - `mcp__electron__read_electron_logs` - Read console logs for debugging

**Example E2E Test Flow:**

```python
# 1. Agent takes screenshot to see current state
agent: "Take a screenshot to see the current UI"
# Uses: mcp__electron__take_screenshot

# 2. Agent inspects page structure
agent: "Get page structure to find available buttons"
# Uses: mcp__electron__send_command_to_electron (command: "get_page_structure")

# 3. Agent clicks a button to navigate
agent: "Click the 'Create New Spec' button"
# Uses: mcp__electron__send_command_to_electron (command: "click_by_text", args: {text: "Create New Spec"})

# 4. Agent fills out a form
agent: "Fill the task description field"
# Uses: mcp__electron__send_command_to_electron (command: "fill_input", args: {placeholder: "Describe your task", value: "Add login feature"})

# 5. Agent submits and verifies
agent: "Click Submit and verify success"
# Uses: click_by_text → take_screenshot → verify result
```

**When to Use E2E Testing:**

- **Bug Fixes**: Reproduce the bug, apply fix, verify it's resolved
- **New Features**: Implement feature, test the UI flow end-to-end
- **UI Changes**: Verify visual changes and interactions work correctly
- **Form Validation**: Test form submission, validation, error handling

**Configuration in `core/client.py`:**

The client automatically enables Electron MCP tools for QA agents when:
- Project is detected as Electron (`is_electron` capability)
- `ELECTRON_MCP_ENABLED=true` is set
- Agent type is `qa_reviewer` or `qa_fixer`

**Note:** Screenshots are automatically compressed (1280x720, quality 60, JPEG) to stay under Claude SDK's 1MB JSON message buffer limit.

## Running the Application

**As a standalone CLI tool**:
```bash
cd apps/backend
python run.py --spec 001
```

**With the Electron frontend**:
```bash
npm start        # Build and run desktop app
npm run dev      # Run in development mode (includes --remote-debugging-port=9222 for E2E testing)
```

**For E2E Testing with QA Agents:**
1. Start the Electron app: `npm run dev`
2. Enable Electron MCP in `apps/backend/.env`: `ELECTRON_MCP_ENABLED=true`
3. Run QA: `python run.py --spec 001 --qa`
4. QA agents will automatically interact with the running app for testing

**Project data storage:**
- `.turret/specs/` - Per-project data (specs, plans, QA reports, memory) - gitignored

## Active Development Plan Template

**Plan**: `use-ful-naming.md`
**Location**: `.docs/plans/ddmmyyhhmm-use-ful-naming.md`

| Phase | Status |
|-------|--------|
| Phase 1: Full-Height UI | ✅ Complete |
| Phase 2: Smarter AI + Config | ✅ Complete |
| Phase 3: Multiplayer/Sockets | ✅ Complete |
| Phase 4: Hero Powers | ✅ Complete |
| Phase 5: Game Over Enhancement | ✅ Complete |
| Phase 6: Tiered Spells | ✅ Complete |

---

## Reference Documentation Requirements

**CRITICAL**: All code changes MUST consult the reference documentation in `.docs/` before implementation.

### Reference Documents

| Document | Consult For |
|----------|-------------|
| `DIRECTORY_REFERENCE.md` | File structure, architecture, where to put code |
| `MECHANICS_REFERENCE.md` | Game rules, combat logic, trigger ordering |
| `SCHEMA_REFERENCE.md` | TypeScript interfaces, data structures, JSON schemas |
| `AI_PLAYER_INTEGRATION.md` | LLM tools, controller patterns, AI architecture |
| `BATTLEGROUNDS_MASTER_REVIEW.md` | Complete game mechanics, edge cases, seasonal features |
| `MONOREPO_ARCHITECTURE.md` | Package dependencies, build order, where to add features |

---

## Mandatory Workflow

### Before Writing ANY Code

1. **Identify which system** you're modifying (combat, tavern, triggers, AI, etc.)
2. **Read the relevant reference doc section** - find exact specifications
3. **Use interfaces verbatim** from SCHEMA_REFERENCE.md - no custom variants
4. **Follow directory structure exactly** from DIRECTORY_REFERENCE.md
5. **If the reference docs don't cover it**, ask before implementing

### Before Committing

1. Verify code matches reference doc specifications
2. Ensure file is in correct directory per DIRECTORY_REFERENCE.md
3. Confirm interfaces match SCHEMA_REFERENCE.md exactly
4. Check that mechanics follow MECHANICS_REFERENCE.md rules

---

## What TO DO

- **Always read reference docs first** before implementing any feature
- **Use exact interfaces** defined in documentation - copy them verbatim
- **Follow the directory structure** - put files where DIRECTORY_REFERENCE.md specifies
- **Keep engine layer pure** - no I/O, no side effects, fully testable
- **Use context objects** - pass state explicitly, never use globals
- **Update reference docs** when adding new systems (with user approval)
- **Ask for clarification** if reference docs are ambiguous or incomplete

## What NOT TO DO

- **Never implement without reading docs** - always consult first
- **Never deviate from documented interfaces** - use them exactly as written
- **Never add files to wrong directories**
- **Never use global state** - use context objects
- **Never assume mechanics**
- **Never create undocumented patterns** - if it's not in docs, ask first

---

## Project Structure

```
.docs/                    # Reference documentation (READ-ONLY unless approved)
├── DIRECTORY_REFERENCE.md
├── MECHANICS_REFERENCE.md
├── SCHEMA_REFERENCE.md
├── BATTLEGROUNDS_MASTER_REVIEW.md
└── MONOREPO_ARCHITECTURE.md

backend/src/              # Implementation (follows DIRECTORY_REFERENCE.md)
├── data/                 # JSON data files only
├── engine/               # Pure game logic
├── ai/                   # LLM player system
├── api/                  # REST/WebSocket adapters
└── cli/                  # Terminal interface
```

---

## Decision Making

### When Reference Docs Are Clear
- Follow them exactly, no interpretation needed

### When Reference Docs Are Ambiguous
- Ask user for clarification before proceeding
- Do not make assumptions

### When Reference Docs Don't Cover Something
- Stop and ask user how to proceed
- Propose adding to reference docs if it's a new system

### When Implementation Conflicts With Docs
- Docs are authoritative - implementation must conform
- If docs are wrong, get approval to update them first

---

## File Naming (from DIRECTORY_REFERENCE.md)

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `board-entity.ts` |
| Exports | PascalCase | `BoardEntity` |
| Registry files | underscore prefix | `_card-mappings.ts` |
| Constants | UPPER_SNAKE | `STARTING_GOLD` |
| Functions | camelCase | `applyDamage()` |

---

## Adding New Features Checklist

1. [ ] Read relevant sections of all applicable reference docs
2. [ ] Identify correct directory from DIRECTORY_REFERENCE.md
3. [ ] Copy exact interfaces from SCHEMA_REFERENCE.md
4. [ ] Implement mechanics per MECHANICS_REFERENCE.md
5. [ ] If AI-related, follow AI_PLAYER_INTEGRATION.md patterns
6. [ ] Verify implementation matches documentation
7. [ ] Ask if reference docs need updating for new patterns

---

## AutoMem Memory Association

**CRITICAL: Always associate related memories using correct relation types when storing in AutoMem.**

### Relation Types

| Type | Use Case | Example |
|------|----------|---------|
| `CONTRADICTS` | Conflicts with another memory | "Early returns" contradicts "Nested conditionals" |
| `DERIVED_FROM` | Conclusion from another memory | "Use h-1.5" derived from "Progress bar pattern" |
| `EVOLVED_INTO` | Evolution of previous approach | "No pop-ins" evolved from "Skeleton loading" |
| `EXEMPLIFIES` | Concrete example of principle | "WorkspaceStatus loading" exemplifies "No pop-ins" |
| `EXPLAINS` | Provides reasoning/context | "Spacing system" explains "Use .5 increments" |
| `INVALIDATED_BY` | Made obsolete by new info | "CSS animations" invalidated by "Framer-motion" |
| `LEADS_TO` | Caused another decision | "No pop-ins preference" leads to "Stability pattern" |
| `OCCURRED_BEFORE` | Temporal relationship | "First attempt" occurred before "Redesign" |
| `PARALLEL_CONTEXT` | Similar but separate contexts | "Backend patterns" parallel to "Frontend patterns" |
| `PART_OF` | Belongs to larger system | "Progress height" part of "Design system" |
| `PRECEDED_BY` | Follows chronologically | "Implementation" preceded by "Research" |
| `PREFERS_OVER` | Preference between alternatives | "Framer-motion" prefers over "CSS animations" |
| `REINFORCES` | Strengthens another memory | "Progress pattern" reinforces "Design consistency" |
| `RELATES_TO` | General relationship | "Loading states" relates to "User experience" |
| `SHARES_THEME` | Common themes/topics | "Spacing" shares theme with "Color opacity" |
| `SIMILAR_TO` | Analogous or comparable | "Topographic spacing" similar to "Topographic colors" |

### Best Practices

1. **Use specific types** - Prefer `EXEMPLIFIES`, `DERIVED_FROM`, `PREFERS_OVER` over generic `RELATES_TO`
2. **Bidirectional associations** - Link both memories with complementary relation types
3. **Build knowledge graphs** - Use `EXPLAINS` and `LEADS_TO` to connect decisions to rationale
4. **Document evolution** - Use `EVOLVED_INTO` and `INVALIDATED_BY` to track pattern changes
5. **Mark preferences** - Use `PREFERS_OVER` to document clear preferences

### Example

```python
# Store pattern and source
pattern_id = store_memory({
  content: "Progress bars: h-1.5, rounded-full, framer-motion",
  importance: 0.95,
  tags: ["design-system", "ui-patterns"]
})

source_id = store_memory({
  content: "RoadmapGenerationProgress.tsx is canonical pattern",
  importance: 0.90,
  tags: ["design-system", "reference"]
})

# Associate bidirectionally
associate_memories(pattern_id, source_id, "DERIVED_FROM")
associate_memories(source_id, pattern_id, "EXEMPLIFIES")
```

---

## Post-Compact Recovery (MANDATORY)

**After ANY `/compact` or context reset, IMMEDIATELY:**

1. **Read checkpoint**: `Read .checkpoint/session.md`
2. **Parse state**: Extract `[PHASE]`, `[BLOCKED]`, progress items
3. **Load context**: Reference the "Context Keywords" for quick lookups
4. **Resume work**: Follow "Resume Instructions" section exactly

This ensures continuity across compaction boundaries. The checkpoint contains:
- Files modified and why
- Key decisions made
- Current progress state
- Exact next steps to take

**Never start work after compacting without reading the checkpoint first.**

---

# Professional DevOps Protocol (Telegraphic)
Modulab MMLLM 1. Focus: Production-ready, modular, maintainable.

## Core Principles (MANDATORY)
**Arch**: KISS (Clarity); LEVER (Leverage/Evolve/Validate/Execute/Repeat); STEP (Simple/Testable/Extensible/Performant); YAGNI (No unnecessary additions); DRY (Reuse patterns); UNIFORM (Consistent naming/UI).
**Modularity**: Plug-in/adapter arch; 1 file/entity; externalize/import funcs; painless replacement.
**Quality**: Production-ready; TODO impl plans; no complexity; back-compat; non-destructive (inject/blend); Discriminated unions/type guards; no `any`; rigorous error handling.

## Documentation (CRITICAL)
| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules, stack, "never deviate" |
| `technical_summary.md` | Arch, flow, env, deps, deploy |
| `.docs/plan.md` | Roadmap, arch decisions |
| `.docs/todo.md` | Tasks, blockers, progress |
| `.docs/changelog/` | Latest changes (prepend) |
*Check CLAUDE.md at start; create if missing.*

## AutoMem (DevOps Extension)
**Tools**: `recall_memory` (Context); `store_memory` (Persist); `associate_memories` (Link); `update_memory` (Edit); `delete_memory` (Remove); `check_database_health` (Integrity).
**Store**: Knowledge/pref + reasoning, how-to, rules, arch decisions. **Never**: commands, complaints, retries, chat.
**Recall**: Mandatory before significant work.
| Trigger | Focus | Tags |
|---|---|---|
| Session start | Project context/decisions | `[project]`, `architecture` |
| Complex task | Patterns/impls | `[project]`, `patterns` |
| Refactor | Anti-patterns/standards | `anti-pattern`, `golden-standard` |
| Bug fix | Root causes/past fixes | `bug-fix`, `critical` |
| Arch change | Layer rules/deps | `architecture`, `golden-standard` |
| Delegation | Subagent context | `[relevant-topic]` |

**Associations** (CRITICAL): Always link related memories. **Types**: `CONTRADICTS`, `DERIVED_FROM`, `EVOLVED_INTO`, `EXEMPLIFIES`, `EXPLAINS`, `INVALIDATED_BY`, `LEADS_TO`, `OCCURRED_BEFORE`, `PARALLEL_CONTEXT`, `PART_OF`, `PRECEDED_BY`, `PREFERS_OVER`, `REINFORCES`, `RELATES_TO`, `SHARES_THEME`, `SIMILAR_TO`. **Best**: Use specific types (`EXEMPLIFIES`, `DERIVED_FROM`, `PREFERS_OVER`) over `RELATES_TO`; bidirectional links; build graphs with `EXPLAINS`/`LEADS_TO`; track evolution with `EVOLVED_INTO`/`INVALIDATED_BY`.

**Patterns**:
```javascript
// Recall (Nontrivial task = mandatory)
mcp__automem__recall_memory({ query: "arch/patterns/anti-patterns", tags: ["project", "architecture"], limit: 15 })
// Store (ONLY IF KNOWLEDGE/DATA/CONTEXT CONTRIBUTES TO THE MEMORY. IF IT DOESNT ADD VALUE, DO NOT STORE. PROJECT TASKS, ACTIONS, ETC DONT ADD VALUE TO LONG TERM MEMORY.) (Tag first + associate)
await store_memory({ content: "X using Y: Z", tags: ["tag", "tag", "tag", "tag", "tag", "cat"], importance: 0.9, metadata: { files: ["f.ts"] } });
await associate_memories({ memory1_id: "A", memory2_id: "B", type: "DERIVED_FROM", strength: 0.9 });
// Bidirectional: associate_memories(B, A, "EXEMPLIFIES")
```
