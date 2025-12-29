# Specification: Add Selective File Discard to Human Review Workflow

## Overview

Add the ability to selectively discard specific files when reviewing task changes in the human_review column. This allows users to exclude unwanted files (like accidental CSS changes or other undesired modifications) from the task's changes before staging or merging, while keeping the intended modifications. Users will see per-file discard buttons in the DiffViewDialog, with confirmation prompts before destructive actions.

## Workflow Type

**Type**: feature

**Rationale**: This is a net-new capability that extends the existing human review workflow with granular file-level control. It's not a bug fix or refactor, but an enhancement that adds new UI controls, IPC handlers, and git operations.

## Task Scope

### Services Involved
- **frontend** (primary) - UI changes to DiffViewDialog, new confirmation dialogs, IPC communication
- **frontend/main** (integration) - New IPC handler for git restore operations on individual files

### This Task Will:
- [x] Add a new IPC channel `TASK_WORKTREE_DISCARD_FILE` for discarding individual files
- [x] Create a new IPC handler in `worktree-handlers.ts` that uses `git restore` to revert specific files
- [x] Update `DiffViewDialog.tsx` to show a discard button for each file in the diff view
- [x] Add confirmation dialog before discarding files (destructive action warning)
- [x] Show success toast notification after file is discarded
- [x] Automatically refresh the diff view after successful discard to remove the file from the list
- [x] Update TypeScript types to support the new IPC channel and operations

### Out of Scope:
- Undo functionality for discarded files (git restore is destructive)
- Batch discard of multiple files at once (future enhancement)
- Discarding changes from already-committed files in the worktree history
- Preview of what will be discarded (assumes user viewed the file diff already)

## Service Context

### Frontend (React/TypeScript/Electron)

**Tech Stack:**
- Language: TypeScript
- Framework: React
- Key directories: `src/renderer/components` (UI), `src/main/ipc-handlers` (backend)
- Build tool: Vite
- Styling: Tailwind CSS
- State management: Zustand
- UI components: Radix UI

**Entry Point:** `apps/frontend/src/renderer/components/task-detail/task-review/DiffViewDialog.tsx`

**How to Run:**
```bash
cd apps/frontend
npm run dev
```

**Port:** 3000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/frontend/src/shared/constants/ipc.ts` | frontend | Add new IPC channel constant `TASK_WORKTREE_DISCARD_FILE` |
| `apps/frontend/src/shared/types/task.ts` | frontend | Add `WorktreeDiscardFileResult` type definition |
| `apps/frontend/src/main/ipc-handlers/task/worktree-handlers.ts` | frontend/main | Add new IPC handler for discarding individual files using `git restore <file>` |
| `apps/frontend/src/renderer/components/task-detail/task-review/DiffViewDialog.tsx` | frontend | Add discard button per file, confirmation dialog, IPC call, refresh logic |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/renderer/components/task-detail/task-review/DiscardDialog.tsx` | Confirmation dialog pattern with AlertDialog components |
| `apps/frontend/src/main/ipc-handlers/task/worktree-handlers.ts` | IPC handler registration pattern with `ipcMain.handle`, git command execution with `execSync` |
| `apps/frontend/src/renderer/hooks/useToast.ts` | Toast notification pattern for success messages |
| `apps/frontend/src/renderer/components/task-detail/task-review/WorkspaceStatus.tsx` | Pattern for calling `onShowDiffDialog` and managing dialog state |

## Patterns to Follow

### IPC Handler Pattern

From `apps/frontend/src/main/ipc-handlers/task/worktree-handlers.ts`:

```typescript
ipcMain.handle(
  IPC_CHANNELS.TASK_WORKTREE_DISCARD,
  async (_, taskId: string): Promise<IPCResult<WorktreeDiscardResult>> => {
    try {
      const { task, project } = findTaskAndProject(taskId);
      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      const worktreePath = path.join(project.path, '.worktrees', task.specId);

      // Perform git operations with execSync
      execSync('git command', {
        cwd: worktreePath,
        encoding: 'utf-8'
      });

      return {
        success: true,
        data: { success: true, message: 'Success message' }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error message'
      };
    }
  }
);
```

**Key Points:**
- Use `ipcMain.handle` with `async` handler function
- Use `findTaskAndProject` helper to get task and project details
- Construct worktree path: `path.join(project.path, '.worktrees', task.specId)`
- Execute git commands with `execSync` in the worktree directory
- Return `IPCResult<T>` with success/error structure
- Catch and handle errors gracefully

### Confirmation Dialog Pattern

From `apps/frontend/src/renderer/components/task-detail/task-review/DiscardDialog.tsx`:

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';

<AlertDialog open={open} onOpenChange={onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-destructive" />
        Action Title
      </AlertDialogTitle>
      <AlertDialogDescription>
        Warning message about destructive action
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={(e) => {
          e.preventDefault();
          onConfirm();
        }}
        className="bg-destructive text-destructive-foreground"
      >
        Confirm Action
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Key Points:**
- Use Radix UI AlertDialog components for confirmation
- Include destructive styling for dangerous actions
- Use `onOpenChange` to control dialog visibility
- Prevent default on action button click
- Show clear warning about permanent changes

### Toast Notification Pattern

From `apps/frontend/src/renderer/hooks/useToast.ts`:

```typescript
import { toast } from '../../../hooks/useToast';

// Show success message
toast({
  title: 'Success',
  description: 'Operation completed successfully'
});

// Show error message
toast({
  title: 'Error',
  description: 'Operation failed',
  variant: 'destructive'
});
```

**Key Points:**
- Import `toast` function from `useToast` hook
- Call `toast()` with title and description
- Use `variant: 'destructive'` for error messages

## Requirements

### Functional Requirements

1. **Per-File Discard Button**
   - Description: Each file in DiffViewDialog shows a discard button/icon
   - Acceptance: User can click discard button next to any file in the diff list

2. **Confirmation Dialog**
   - Description: Before discarding, show confirmation dialog warning about permanent action
   - Acceptance: Dialog shows file name, warning message, and requires explicit confirmation

3. **Git Restore Operation**
   - Description: Discard operation uses `git restore <file>` to revert the file in the worktree
   - Acceptance: File is reverted to base branch state without affecting other files

4. **Success Feedback**
   - Description: After successful discard, show toast notification with success message
   - Acceptance: User sees "File discarded successfully" toast message

5. **Automatic Diff Refresh**
   - Description: After discarding a file, refresh the diff view to remove it from the list
   - Acceptance: Discarded file no longer appears in the diff view without manual refresh

### Edge Cases

1. **Empty Diff After Discarding** - If all files are discarded, diff view shows "No changed files found" message
2. **File Already Discarded** - If file doesn't exist in worktree, return success with informative message
3. **Git Errors** - If git restore fails (e.g., permissions), show error toast with git error message
4. **Concurrent Discards** - Disable discard buttons while a discard operation is in progress
5. **Staged vs Unstaged** - `git restore` works on both staged and unstaged changes, reverting file completely

## Implementation Notes

### DO
- Follow the existing IPC handler pattern in `worktree-handlers.ts`
- Reuse the AlertDialog pattern from `DiscardDialog.tsx` for consistency
- Use the `toast` function from `useToast` for success/error feedback
- Use `git restore <file>` command to revert individual files in the worktree
- Refresh the diff by re-calling `window.api.taskWorktreeDiff(taskId)` after discard
- Add the new IPC channel to `IPC_CHANNELS` constant object
- Use TypeScript types from `shared/types/task.ts`
- Handle loading states (disable buttons during operations)
- Use lucide-react icons (e.g., `Trash2`, `X`) for the discard button

### DON'T
- Use `git reset` (affects index, not just working tree)
- Use `git checkout` (deprecated in favor of `git restore`)
- Discard files from the main project directory (only operate in worktree)
- Allow discarding files while merge/stage operation is in progress
- Forget to handle the case when diff becomes empty after discarding all files
- Create a new discard dialog component (embed inline in DiffViewDialog for simplicity)

## Development Environment

### Start Services

```bash
# Frontend (Electron app)
cd apps/frontend
npm run dev
```

### Service URLs
- Frontend: Electron desktop app (no localhost URL)

### Required Environment Variables
- `CLAUDE_CODE_OAUTH_TOKEN`: OAuth token for Claude API (optional for this task)

## Success Criteria

The task is complete when:

1. [x] User can see a discard button/icon next to each file in the DiffViewDialog
2. [x] Clicking discard shows a confirmation dialog with file name and warning
3. [x] Confirming the discard runs `git restore <file>` in the worktree directory
4. [x] Success toast appears after file is discarded
5. [x] Diff view automatically refreshes and no longer shows the discarded file
6. [x] Other files remain unchanged when discarding a single file
7. [x] No console errors
8. [x] Existing tests still pass
9. [x] New functionality verified via Electron app UI

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| IPC handler tests | `apps/frontend/src/main/ipc-handlers/__tests__/worktree-handlers.test.ts` | Test TASK_WORKTREE_DISCARD_FILE handler with valid/invalid inputs |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| File discard flow | frontend (renderer ↔ main) | IPC call successfully invokes git restore and returns result |
| Diff refresh after discard | frontend | Diff view updates after file discarded, removed from list |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Discard single file | 1. Create task 2. Review changes 3. Click View in human_review 4. Click discard on one file 5. Confirm | File removed from diff, other files remain, success toast shown |
| Discard all files | 1. Review changes 2. Discard each file one by one 3. Confirm each | Diff view shows "No changed files found" after last discard |
| Cancel discard | 1. Click discard 2. Click Cancel in confirmation | File remains in diff view, no git operation performed |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| DiffViewDialog | Electron app → Task detail → Review tab → View button | Each file shows discard button, clicking triggers confirmation |
| Confirmation Dialog | After clicking discard on a file | Shows file name, warning, Cancel and Discard buttons |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Worktree state | `git status` in `.worktrees/<spec-id>/` | Discarded file no longer shows in git diff |
| Other files unchanged | `git diff <base>...HEAD` | Files not discarded still show in diff |

### QA Sign-off Requirements
- [x] All unit tests pass (if tests written)
- [x] Integration test verifies IPC call works correctly
- [x] E2E test confirms full discard flow works in Electron app
- [x] Browser verification complete - UI shows discard buttons and dialogs correctly
- [x] Git state verified - discarded files removed, other files intact
- [x] No regressions in existing functionality (merge, stage, full discard still work)
- [x] Code follows established patterns (IPC handlers, confirmation dialogs, toasts)
- [x] No security vulnerabilities introduced (git commands properly sanitized)
- [x] Error handling verified - invalid file paths, git errors handled gracefully
- [x] Loading states work - buttons disabled during operations
