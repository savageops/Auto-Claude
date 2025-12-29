# Specification: Add CLAUDE.md Project Setting for Agent Context

## Overview

This feature enables per-project customization of AI agent behavior by reading a `CLAUDE.md` file from the project root and injecting its contents into the agent's system prompt. Users can toggle this feature on/off through the Project Settings UI. When enabled, the agent will receive project-specific instructions that guide its behavior, coding patterns, and domain knowledge for that particular project.

## Workflow Type

**Type**: feature

**Rationale**: This is a new end-to-end feature that spans multiple services (backend and frontend), requires UI changes, type updates, configuration changes, and i18n support. It introduces new functionality rather than modifying existing behavior.

## Task Scope

### Services Involved
- **frontend** (primary) - Provides UI toggle, stores setting, passes env var to backend
- **backend** (integration) - Loads CLAUDE.md file and injects into system prompt

### This Task Will:
- [ ] Add `useClaudeMd` boolean toggle to ProjectSettings type and defaults
- [ ] Add UI toggle switch in GeneralSettings component
- [ ] Pass `USE_CLAUDE_MD` environment variable from frontend to backend agent process
- [ ] Add `should_use_claude_md()` and `load_claude_md()` functions in backend
- [ ] Modify `create_client()` to append CLAUDE.md content to system prompt
- [ ] Add i18n translations for EN and FR locales
- [ ] Add debug console output for CLAUDE.md status

### Out of Scope:
- CLAUDE.md file content validation or schema enforcement
- File size limits for CLAUDE.md
- Support for CLAUDE.md files in subdirectories
- Real-time CLAUDE.md changes (requires agent restart)
- UI feedback beyond console logs
- Other language translations beyond EN/FR

## Service Context

### Frontend

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Build Tool: Vite
- Styling: Tailwind CSS
- State Management: Zustand
- UI Components: Radix UI
- Testing: Vitest (unit), Playwright (e2e)
- Key directories: `src`

**Entry Point:** `apps/frontend/src/main/index.ts`

**How to Run:**
```bash
npm run dev
```

**Port:** 3000

### Backend

**Tech Stack:**
- Language: Python
- SDK: claude-agent-sdk
- Key directories: `services` (business logic)

**Entry Point:** `apps/backend/core/client.py`

**How to Run:**
```bash
# Backend is spawned by frontend's agent process manager
python -m apps.backend.main
```

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/backend/core/client.py` | backend | Add `should_use_claude_md()` and `load_claude_md()` functions; modify `create_client()` to append CLAUDE.md to system prompt |
| `apps/frontend/src/main/agent/agent-process.ts` | frontend | Set `USE_CLAUDE_MD` env var when spawning agent based on project settings |
| `apps/frontend/src/renderer/components/project-settings/GeneralSettings.tsx` | frontend | Add toggle switch for CLAUDE.md feature |
| `apps/frontend/src/shared/constants/config.ts` | frontend | Add `useClaudeMd: true` to `DEFAULT_PROJECT_SETTINGS` |
| `apps/frontend/src/shared/types/project.ts` | frontend | Add `useClaudeMd?: boolean` to `ProjectSettings` interface |
| `apps/frontend/src/shared/i18n/locales/en/settings.json` | frontend | Add `useClaudeMd` and `useClaudeMdDescription` keys |
| `apps/frontend/src/shared/i18n/locales/fr/settings.json` | frontend | Add French translations for the new keys |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/renderer/components/project-settings/GeneralSettings.tsx` | Existing Switch toggle pattern with Label and description |
| `apps/frontend/src/main/agent/agent-process.ts` | Existing env var passing pattern (see `GRAPHITI_MCP_URL`) |
| `apps/backend/core/client.py` | Existing `os.environ.get()` patterns and system prompt construction |

## Patterns to Follow

### UI Toggle Pattern (GeneralSettings)

From `GeneralSettings.tsx`:

```tsx
<div className="flex items-center justify-between pt-2">
  <div className="space-y-0.5">
    <Label className="font-normal text-foreground">
      {t('projectSections.general.useClaudeMd')}
    </Label>
    <p className="text-xs text-muted-foreground">
      {t('projectSections.general.useClaudeMdDescription')}
    </p>
  </div>
  <Switch
    checked={settings.useClaudeMd ?? true}
    onCheckedChange={(checked) =>
      setSettings({ ...settings, useClaudeMd: checked })
    }
  />
</div>
```

**Key Points:**
- Use `useTranslation(['settings'])` hook for i18n
- Default to `true` using nullish coalescing: `?? true`
- Place toggle in the General section after existing settings

### Environment Variable Pattern (agent-process.ts)

From `agent-process.ts`:

```typescript
// CLAUDE.md integration (enabled by default)
if (project.settings.useClaudeMd !== false) {
  env['USE_CLAUDE_MD'] = 'true';
}
```

**Key Points:**
- Check for `!== false` to default to enabled when undefined
- Set as string `'true'` not boolean
- Place after existing env var assignments (after GRAPHITI_MCP_URL)

### Backend File Loading Pattern (client.py)

```python
def should_use_claude_md() -> bool:
    """Check if CLAUDE.md instructions should be included in system prompt."""
    return os.environ.get("USE_CLAUDE_MD", "").lower() == "true"

def load_claude_md(project_dir: Path) -> str | None:
    """
    Load CLAUDE.md content from project root if it exists.

    Args:
        project_dir: Root directory of the project

    Returns:
        Content of CLAUDE.md if found, None otherwise
    """
    claude_md_path = project_dir / "CLAUDE.md"
    if claude_md_path.exists():
        try:
            return claude_md_path.read_text(encoding="utf-8")
        except Exception:
            return None
    return None
```

**Key Points:**
- Use `Path` for file operations
- Specify `encoding="utf-8"` explicitly
- Catch all exceptions and return `None` for graceful degradation
- Check existence before reading

### System Prompt Construction Pattern

```python
# Build system prompt
base_prompt = (
    f"You are an expert full-stack developer..."
)

# Include CLAUDE.md if enabled and present
if should_use_claude_md():
    claude_md_content = load_claude_md(project_dir)
    if claude_md_content:
        base_prompt = f"{base_prompt}\n\n# Project Instructions (from CLAUDE.md)\n\n{claude_md_content}"
        print("   - CLAUDE.md: included in system prompt")
    else:
        print("   - CLAUDE.md: not found in project root")
else:
    print("   - CLAUDE.md: disabled by project settings")
```

**Key Points:**
- Extract base prompt to variable for modification
- Add section header: `# Project Instructions (from CLAUDE.md)`
- Use print() for debug output with consistent formatting
- Handle all three states: included, not found, disabled

## Requirements

### Functional Requirements

1. **Project Setting Toggle**
   - Description: Users can enable/disable CLAUDE.md integration per project
   - Acceptance: Toggle appears in Project Settings > General section and persists across sessions

2. **Environment Variable Passing**
   - Description: Frontend passes `USE_CLAUDE_MD=true` to backend when setting enabled
   - Acceptance: Env var is set when agent starts if `useClaudeMd !== false`

3. **File Loading**
   - Description: Backend loads `CLAUDE.md` from project root when enabled
   - Acceptance: Content is read with UTF-8 encoding; graceful failure if missing

4. **System Prompt Injection**
   - Description: CLAUDE.md content appended to agent system prompt
   - Acceptance: Content appears under "# Project Instructions" section in prompt

5. **Debug Output**
   - Description: Console shows CLAUDE.md status during agent initialization
   - Acceptance: One of three messages: "included", "not found", or "disabled"

6. **i18n Support**
   - Description: UI labels available in English and French
   - Acceptance: Labels display correctly in both locales

### Edge Cases

1. **CLAUDE.md not found** - Agent starts normally without error; logs "not found"
2. **CLAUDE.md unreadable** - Returns `None`, agent starts without instructions
3. **Setting undefined** - Defaults to enabled (`true`)
4. **Empty CLAUDE.md** - Empty string appended (no special handling)
5. **Large CLAUDE.md** - No size limit enforced; may impact prompt token count

## Implementation Notes

### DO
- Follow the existing Switch toggle pattern in GeneralSettings.tsx
- Reuse `useTranslation` hook for i18n
- Use nullish coalescing (`?? true`) for default-on behavior
- Place functions before `create_client()` in client.py
- Use `Path` objects for file operations
- Include clear debug output for troubleshooting

### DON'T
- Create new UI components when existing Switch works
- Add complex validation to CLAUDE.md content
- Throw exceptions on file read errors (return None)
- Modify existing system prompt construction logic - extend it
- Use synchronous blocking for file reads in frontend

## Development Environment

### Start Services

```bash
# Frontend (Electron app)
cd apps/frontend && npm run dev

# The backend is spawned by the frontend agent process manager
```

### Service URLs
- Frontend: http://localhost:3000

### Required Environment Variables
- `USE_CLAUDE_MD`: Set by frontend to `"true"` when feature enabled

## Success Criteria

The task is complete when:

1. [ ] Toggle appears in Project Settings > General section labeled "Use CLAUDE.md"
2. [ ] Toggle defaults to ON for new/existing projects
3. [ ] Toggling OFF prevents CLAUDE.md from being loaded
4. [ ] CLAUDE.md content appears in agent system prompt when enabled
5. [ ] Console shows appropriate status message during agent init
6. [ ] Setting persists after closing and reopening project
7. [ ] No console errors during toggle or agent launch
8. [ ] Existing tests still pass
9. [ ] EN and FR translations display correctly

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| should_use_claude_md returns correct value | `apps/backend/spec/test_client.py` | Returns true when env var is "true", false otherwise |
| load_claude_md reads file | `apps/backend/spec/test_client.py` | Returns content when file exists, None otherwise |
| DEFAULT_PROJECT_SETTINGS includes useClaudeMd | `apps/frontend/src/shared/constants/config.test.ts` | `useClaudeMd` is `true` by default |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Env var passed to agent | frontend ↔ backend | USE_CLAUDE_MD env var set when spawning agent |
| Setting persistence | frontend | useClaudeMd saved to project.json and loaded |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Enable CLAUDE.md | 1. Open project settings 2. Toggle ON 3. Start agent | Agent includes CLAUDE.md in prompt, console shows "included" |
| Disable CLAUDE.md | 1. Open project settings 2. Toggle OFF 3. Start agent | Agent excludes CLAUDE.md, console shows "disabled" |
| Missing CLAUDE.md | 1. Toggle ON 2. Delete CLAUDE.md 3. Start agent | Agent starts without error, console shows "not found" |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Project Settings | Settings dialog > General tab | Toggle visible with correct label and description |
| Toggle State | Settings dialog | Toggle reflects saved state, defaults to ON |
| i18n - English | App in EN locale | "Use CLAUDE.md" label displays |
| i18n - French | App in FR locale | "Utiliser CLAUDE.md" label displays |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Setting stored | Read project.json | `settings.useClaudeMd` exists as boolean |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete (if applicable)
- [ ] Database state verified (if applicable)
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced
