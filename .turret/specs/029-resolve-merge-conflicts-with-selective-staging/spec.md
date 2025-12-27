# Specification: Selective Staging for Merge Conflicts Preview

## Overview

Add functionality to the merge conflicts preview dialog (`ConflictDetailsDialog`) that allows users to selectively exclude files from staging by clicking to toggle individual conflict cards on/off. This enables users reviewing conflicts before staging to disable specific files (e.g., CSS files they don't want to commit) so only enabled conflicts proceed to "Stage with AI Merge".

## Workflow Type

**Type**: feature

**Rationale**: This is a new feature enhancement to an existing component (ConflictDetailsDialog). It requires adding new state management, UI interaction patterns, and modifying the staging logic to filter based on selection state.

## Task Scope

### Services Involved
- **frontend** (primary) - All changes are in the React/TypeScript frontend for UI interaction and state management

### This Task Will:
- [ ] Add selection state management to track enabled/disabled conflict cards
- [ ] Make conflict cards clickable/toggleable with visual feedback
- [ ] Filter staged conflicts based on enabled state when "Stage with AI Merge" is clicked
- [ ] Show clear visual distinction between enabled and disabled cards
- [ ] Handle edge case when all cards are disabled (prevent staging)

### Out of Scope:
- Backend changes to merge logic
- Modifying conflict detection algorithms
- Changes to the actual AI merge resolution process
- Persisting selection state across dialog open/close cycles

## Service Context

### Frontend Service

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Build Tool: Vite
- State Management: Zustand
- Styling: Tailwind CSS
- UI Components: Radix UI

**Key directories:**
- `src/renderer/components/task-detail/task-review/` - Contains all task review components

**Entry Point:** `apps/frontend/src/renderer/components/task-detail/task-review/ConflictDetailsDialog.tsx`

**How to Run:**
```bash
cd apps/frontend && npm run dev
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/frontend/src/renderer/components/task-detail/task-review/ConflictDetailsDialog.tsx` | frontend | Add selection state, make cards toggleable, visual feedback, filter logic |
| `apps/frontend/src/renderer/components/task-detail/TaskReview.tsx` | frontend | Pass excluded files to onMerge callback |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/renderer/components/linear-import/hooks/useIssueSelection.ts` | Selection state management with Set<string>, toggle function pattern |
| `apps/frontend/src/renderer/components/task-detail/task-review/WorkspaceStatus.tsx` | Checkbox usage, cn() utility for conditional styling |
| `apps/frontend/src/shared/types/task.ts` | MergeConflict interface structure |

## Patterns to Follow

### Selection State Pattern

From `useIssueSelection.ts`:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleItem = useCallback((id: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}, []);
```

**Key Points:**
- Use `Set<string>` for O(1) lookup performance
- Use `useCallback` for stable function references
- Toggle by creating new Set to trigger re-render

### Conditional Styling Pattern

From `ConflictDetailsDialog.tsx` and `WorkspaceStatus.tsx`:

```typescript
import { cn } from '../../../lib/utils';

<div className={cn(
  "p-3 rounded-lg border",
  isDisabled ? "opacity-50 bg-muted/20" : "bg-secondary/30",
  isClickable && "cursor-pointer hover:bg-secondary/50"
)} />
```

**Key Points:**
- Use `cn()` utility for conditional class merging
- Apply opacity reduction for disabled state
- Add cursor and hover states for interactive elements

### Card Structure Pattern

Current conflict card structure to extend:

```tsx
<div
  key={idx}
  className={cn(
    "p-3 rounded-lg border",
    conflict.canAutoMerge
      ? "bg-secondary/30 border-border"
      : conflict.severity === 'high' || conflict.severity === 'critical'
        ? "bg-destructive/10 border-destructive/30"
        : "bg-warning/10 border-warning/30"
  )}
>
```

**Key Points:**
- Cards already have severity-based styling
- Need to add selection state to existing conditional classes
- onClick handler needs to be added to the div

## Requirements

### Functional Requirements

1. **Toggle Conflict Cards**
   - Description: Users can click on any conflict card to toggle its enabled/disabled state
   - Acceptance: Clicking a card toggles its visual state and updates internal selection

2. **Visual Feedback for Disabled Cards**
   - Description: Disabled cards should be visually distinct (reduced opacity, strikethrough, or crossed out)
   - Acceptance: Disabled cards are clearly distinguishable from enabled cards at a glance

3. **Selection State Indicator**
   - Description: Each card shows its selection state (checkbox or similar indicator)
   - Acceptance: Users can see which cards are enabled/disabled without clicking

4. **Filtered Staging**
   - Description: "Stage with AI Merge" only processes enabled conflict cards
   - Acceptance: Disabled files are excluded from the staging operation

5. **Default Selection**
   - Description: All cards start in enabled state
   - Acceptance: When dialog opens, all conflict cards are selected by default

6. **Count Display Update**
   - Description: Show count of selected vs total conflicts in dialog header
   - Acceptance: Header shows "X of Y conflicts selected" or similar

### Edge Cases

1. **All Cards Disabled** - Disable the "Stage with AI Merge" button and show tooltip explaining why
2. **Single Card Remaining** - Allow staging with just one enabled card
3. **Empty Conflicts List** - No change needed (existing "No conflicts detected" message)
4. **Dialog Close/Reopen** - Selection state resets to all enabled (no persistence needed)

## Implementation Notes

### DO
- Initialize selection state with all conflict file paths (all enabled by default)
- Use the file path as unique identifier for selection state: `conflict.file`
- Follow the existing `useIssueSelection.ts` pattern for state management
- Add Checkbox component from Radix UI as visual indicator
- Use `cn()` for all conditional styling
- Add `cursor-pointer` and hover states to make cards feel clickable
- Update dialog description to show selection count
- Pass excluded files through `onMerge` callback modification or via parent state

### DON'T
- Create new global/store state - use component local state
- Modify the MergeConflict type - work with existing structure
- Change existing card colors for severity - layer selection state on top
- Remove existing functionality - only add selection layer

## Development Environment

### Start Services

```bash
cd apps/frontend && npm run dev
```

### Service URLs
- Frontend: http://localhost:3000

### Required Environment Variables
- None specific for this feature (uses existing frontend environment)

## Success Criteria

The task is complete when:

1. [ ] Conflict cards are clickable and toggle between enabled/disabled states
2. [ ] Disabled cards show reduced opacity (50%) and a visual indicator
3. [ ] Each card has a checkbox showing selection state
4. [ ] "Stage with AI Merge" button is disabled when no cards are selected
5. [ ] Only enabled conflicts are passed to the merge function
6. [ ] Dialog header shows count of selected conflicts
7. [ ] No console errors
8. [ ] Existing tests still pass
9. [ ] New functionality verified via browser

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Toggle selection state | `ConflictDetailsDialog.test.tsx` | Clicking card toggles its selection |
| Default all selected | `ConflictDetailsDialog.test.tsx` | All cards start enabled |
| Filter disabled conflicts | `ConflictDetailsDialog.test.tsx` | onMerge receives only enabled files |
| Empty selection disables button | `ConflictDetailsDialog.test.tsx` | Button disabled when none selected |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Selection affects staging | frontend → parent component | Excluded files not passed to merge handler |
| Dialog state reset | frontend | Re-opening dialog resets selection to all |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Selective staging | 1. Open conflict dialog 2. Disable 2 of 4 cards 3. Click Stage | Only 2 enabled files staged |
| Toggle all disabled | 1. Open dialog 2. Disable all cards | Stage button disabled with tooltip |
| Visual feedback | 1. Open dialog 2. Toggle cards | Disabled cards show reduced opacity + strikethrough |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Task Review Panel | `http://localhost:3000` (with active task in review) | Conflict dialog opens, cards are toggleable |
| Conflict Card | Same | Click toggles visual state |
| Stage Button | Same | Disabled when no selection, enabled otherwise |
| Selection Count | Same | Header shows "X of Y selected" |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| N/A | N/A | No database changes for this feature |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (useCallback, cn(), Set-based selection)
- [ ] No security vulnerabilities introduced
- [ ] Accessibility: Cards are keyboard navigable and have proper ARIA attributes
