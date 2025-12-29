# Specification: Add Accordion Behavior to Done Kanban Items

## Overview

This feature enhances the kanban board by adding collapsible accordion functionality to tasks in the "done" column. Tasks will be collapsed by default, showing only essential information (title and badges) to reduce visual clutter. Users can click to expand individual tasks to view full details with smooth CSS transitions. This improves the user experience by maintaining a clean interface while preserving access to complete task information when needed.

## Workflow Type

**Type**: feature

**Rationale**: This is a non-breaking enhancement to existing kanban board functionality. It adds new interactive behavior without modifying the core kanban workflow, task data structures, or existing features. The implementation is isolated to the "done" column's task rendering logic.

## Task Scope

### Services Involved
- **frontend** (primary) - React/TypeScript application where kanban board is implemented

### This Task Will:
- [ ] Add collapsible accordion behavior using Radix UI Collapsible component
- [ ] Configure tasks in "done" column to be collapsed by default
- [ ] Show only title and badges when collapsed
- [ ] Implement click-to-expand/collapse interaction
- [ ] Add smooth CSS transitions for expand/collapse animations
- [ ] Maintain existing task card functionality (drag-drop, badges, etc.)

### Out of Scope:
- Collapsible behavior for other kanban columns (todo, in-progress)
- Changes to task data model or backend API
- Modifications to existing task card content or layout beyond accordion structure
- Persistent state (collapsed/expanded state resets on page reload)
- Keyboard shortcuts for expand/collapse

## Service Context

### Frontend

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Build tool: Vite
- Styling: Tailwind CSS
- State management: Zustand
- UI components: Radix UI (Collapsible already available)
- Drag-drop: @dnd-kit
- Testing: Vitest (unit), Playwright (E2E)

**Entry Point:** `apps/frontend/src`

**How to Run:**
```bash
cd apps/frontend
npm run dev
```

**Port:** 3000

**Key Dependencies:**
- `@radix-ui/react-collapsible` (already installed)
- `@dnd-kit/core`, `@dnd-kit/sortable` (for kanban board)
- Tailwind CSS (for styling transitions)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| *[To be identified during exploration]* | frontend | Kanban task card component - wrap content in Radix Collapsible |
| *[To be identified during exploration]* | frontend | Done column task renderer - apply collapsed default state |
| *[To be identified during exploration]* | frontend | Task card styles - add transition CSS for smooth animations |

**Note**: Context phase did not identify specific files. Implementation phase must explore to locate:
- Kanban board component (likely in `apps/frontend/src/components/`)
- Task card component
- Column-specific rendering logic

## Files to Reference

| File | Pattern to Copy |
|------|----------------|
| *[To be identified during exploration]* | Existing Radix UI component usage patterns |
| *[To be identified during exploration]* | Tailwind CSS transition utilities in use |
| *[To be identified during exploration]* | Current task card structure and props |

**Note**: During exploration, look for:
- Other Radix UI component implementations (Dialog, Dropdown, etc.)
- CSS transition patterns used elsewhere in the app
- Task card rendering logic to understand current structure

## Patterns to Follow

### Radix UI Collapsible Pattern

**Expected implementation structure:**

```tsx
import * as Collapsible from '@radix-ui/react-collapsible';

// Task card in "done" column
<Collapsible.Root defaultOpen={false}>
  <Collapsible.Trigger asChild>
    <div className="cursor-pointer">
      {/* Always visible: Title and badges */}
      <h3>{task.title}</h3>
      <div className="badges">{/* badges */}</div>
    </div>
  </Collapsible.Trigger>

  <Collapsible.Content className="transition-all duration-300 ease-in-out">
    {/* Expanded content: Full task details */}
    <div className="task-details">
      {/* description, metadata, actions, etc. */}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
```

**Key Points:**
- Use `defaultOpen={false}` for collapsed-by-default behavior
- Apply `asChild` to Trigger to merge with existing markup
- Add Tailwind transition classes to Content for smooth animation
- Keep title and badges outside Collapsible.Content so they remain visible

### Tailwind CSS Transitions

**For smooth expand/collapse:**

```tsx
<Collapsible.Content
  className="
    transition-all
    duration-300
    ease-in-out
    data-[state=closed]:animate-collapse
    data-[state=open]:animate-expand
  "
>
```

**Key Points:**
- Use `transition-all` for height/opacity changes
- `duration-300` provides smooth timing (adjust based on project standards)
- Radix UI provides `data-[state]` attributes for styling
- May need to add custom animations in Tailwind config

## Requirements

### Functional Requirements

1. **Collapsed by Default in Done Column**
   - Description: Tasks in the "done" column render in collapsed state on initial load
   - Acceptance: When kanban board loads, all done tasks show only title and badges

2. **Click to Expand/Collapse**
   - Description: Clicking on a collapsed task expands it; clicking on an expanded task collapses it
   - Acceptance: User can toggle task state by clicking anywhere on the visible portion

3. **Smooth Animation**
   - Description: Expand/collapse transitions use CSS animations for smooth visual feedback
   - Acceptance: Animation duration ~300ms with easing, no jarring layout shifts

4. **Preserve Existing Functionality**
   - Description: Drag-drop, badges, and other task card features continue to work
   - Acceptance: Can still drag tasks between columns, badges display correctly, no regressions

### Edge Cases

1. **Empty Done Column** - No tasks to render; should not cause errors
2. **Rapid Clicking** - Prevent animation conflicts if user clicks repeatedly
3. **Long Task Content** - Ensure smooth animation even with large content blocks
4. **Drag During Animation** - Handle drag-drop interactions during expand/collapse transition
5. **Column Switch** - If task moves to/from done column, remove/apply accordion behavior appropriately

## Implementation Notes

### DO
- Use the existing `@radix-ui/react-collapsible` dependency (already installed)
- Follow Tailwind CSS patterns for transitions (check existing usage in project)
- Apply accordion behavior ONLY to "done" column tasks
- Keep title and badges always visible (outside Collapsible.Content)
- Test with various task content lengths to ensure smooth animations
- Maintain accessibility (Radix UI handles ARIA attributes automatically)

### DON'T
- Create custom accordion implementation when Radix UI provides it
- Apply collapsible behavior to other kanban columns (out of scope)
- Modify task data structure or add persistence for collapse state
- Break existing drag-drop functionality from @dnd-kit
- Use JavaScript animations instead of CSS transitions

### Technical Considerations

**State Management:**
- Individual task collapse state managed by Radix Collapsible internally
- No need to lift state to Zustand unless persistence is required (out of scope)

**Performance:**
- CSS transitions are GPU-accelerated; no performance concerns
- If many tasks in done column, consider virtualization (future optimization)

**Accessibility:**
- Radix UI Collapsible provides ARIA attributes automatically
- Ensure click target is large enough (entire visible card area)

## Development Environment

### Start Services

```bash
# Frontend (primary service for this task)
cd apps/frontend
npm install  # Ensure @radix-ui/react-collapsible is installed
npm run dev

# Backend (not needed for UI-only changes, but for full app testing)
cd apps/backend
pip install -r requirements.txt
python main.py
```

### Service URLs
- Frontend: http://localhost:3000
- Backend: (port not specified in project_index, but not required for this feature)

### Required Environment Variables
- `GRAPHITI_ENABLED`: Set in `.env.example` (may be needed for backend if testing full app)

**For this task:** Frontend can run standalone for development and testing of accordion behavior.

## Success Criteria

The task is complete when:

1. [ ] Tasks in "done" column are collapsed by default on page load
2. [ ] Clicking a task toggles between collapsed and expanded states
3. [ ] Title and badges are visible in both collapsed and expanded states
4. [ ] Full task details are visible only when expanded
5. [ ] Smooth CSS transitions animate the expand/collapse (no jarring jumps)
6. [ ] Existing kanban functionality works (drag-drop, badges, etc.)
7. [ ] No console errors or warnings
8. [ ] Existing tests still pass
9. [ ] Tasks in other columns (todo, in-progress) are NOT affected
10. [ ] Verified via browser at http://localhost:3000

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Task Card Rendering | `[path/to/task-card.test.tsx]` | Renders with Collapsible component in done column |
| Collapsed State Default | `[path/to/task-card.test.tsx]` | `defaultOpen={false}` is set for done column tasks |
| Expanded State Toggle | `[path/to/task-card.test.tsx]` | Click handler toggles collapsed/expanded state |
| Column-Specific Behavior | `[path/to/kanban.test.tsx]` | Accordion only applied to done column, not others |

**Note**: Specific test file paths to be determined during exploration phase.

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Kanban Board Rendering | frontend | Done column tasks render with accordion behavior |
| Drag-Drop Compatibility | frontend | Can drag tasks between columns without breaking accordion |
| State Isolation | frontend | Expanding one task doesn't affect others |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| View Done Tasks | 1. Load kanban board 2. Observe done column | All tasks collapsed, showing title/badges only |
| Expand Task | 1. Click collapsed task 2. Observe animation | Task smoothly expands, full details visible |
| Collapse Task | 1. Click expanded task 2. Observe animation | Task smoothly collapses, only title/badges visible |
| Drag Collapsed Task | 1. Drag collapsed task to another column 2. Observe | Task moves successfully, no errors |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Kanban Board | `http://localhost:3000` | Done column tasks collapsed by default |
| Task Interaction | `http://localhost:3000` | Click toggles expand/collapse smoothly |
| Drag-Drop | `http://localhost:3000` | Can drag tasks between columns |
| Animation Quality | `http://localhost:3000` | Transitions are smooth (~300ms), no jank |

### Database Verification (if applicable)
**Not applicable** - This is a frontend-only UI feature with no database changes.

### QA Sign-off Requirements
- [ ] All unit tests pass (existing + new tests for accordion)
- [ ] All integration tests pass (kanban board functionality intact)
- [ ] All E2E tests pass (Playwright tests for user flows)
- [ ] Browser verification complete:
  - [ ] Tasks collapsed by default in done column
  - [ ] Click toggles expand/collapse
  - [ ] Smooth animations (no layout shifts or jank)
  - [ ] Other columns unaffected
  - [ ] Drag-drop still works
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns (Radix UI, Tailwind CSS)
- [ ] No security vulnerabilities introduced
- [ ] No console errors or warnings
- [ ] Accessibility preserved (keyboard navigation, screen readers)

---

## Exploration Phase Actions

**Since context.json did not identify specific files**, the implementation phase must begin with exploration:

1. **Locate Kanban Board Component**
   - Search in `apps/frontend/src/components/` for kanban/board files
   - Look for usage of `@dnd-kit/core` and `@dnd-kit/sortable`

2. **Identify Task Card Component**
   - Find component that renders individual tasks
   - Understand current props and structure

3. **Find Column Rendering Logic**
   - Determine how tasks are filtered by status (todo/in-progress/done)
   - Identify where to apply conditional accordion behavior

4. **Review Radix UI Usage**
   - Find existing Radix UI components in project (Dialog, Dropdown, etc.)
   - Copy import and usage patterns

5. **Check Tailwind Transition Patterns**
   - Review existing transition utilities in project
   - Ensure consistency with app-wide animation standards

**Suggested Exploration Commands:**
```bash
# Find kanban board components
fd -e tsx -e ts kanban apps/frontend/src/

# Find task card components
fd -e tsx -e ts task apps/frontend/src/

# Search for dnd-kit usage (kanban board likely uses this)
rg "@dnd-kit" apps/frontend/src/

# Find existing Radix UI Collapsible usage (if any)
rg "react-collapsible" apps/frontend/src/
```
