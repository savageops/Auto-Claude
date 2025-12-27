# Specification: Auto-Recovery for Stuck Tasks

## Overview

Implement an automatic self-healing system that detects and recovers tasks that appear stuck (marked as running but no active process). The system will run as a background monitoring service that checks all tasks every 10 seconds and automatically restarts stuck tasks with rate limiting (max 3 restarts per 3 minutes per task). This prevents tasks from entering a limbo state where the UI shows them as running while no actual process is executing, improving user experience and system reliability.

## Workflow Type

**Type**: feature

**Rationale**: This is a new capability that adds automatic task recovery to the existing task management system. It requires creating a new service class, integrating it with existing components, and modifying lifecycle management - all characteristic of a feature implementation.

## Task Scope

### Services Involved
- **frontend** (primary) - Electron main process task monitoring and recovery

### This Task Will:
- [ ] Create new `TaskMonitorService` class with rate-limited monitoring logic
- [ ] Integrate the monitor into `AgentManager` with lifecycle methods
- [ ] Extract recovery logic from IPC handler into a shared internal function
- [ ] Initialize monitoring on app startup and stop on app quit
- [ ] Implement proper logging for monitoring events

### Out of Scope:
- Backend changes
- UI/renderer changes (no visual indicators for auto-recovery)
- Configuration UI for monitor settings (uses constants)
- Notification system for recovery events

## Service Context

### Frontend Service

**Tech Stack:**
- Language: TypeScript
- Framework: Electron + React
- State Management: Zustand
- Key directories: `apps/frontend/src/main` (main process), `apps/frontend/src/renderer` (renderer)

**Entry Point:** `apps/frontend/src/main/index.ts`

**How to Run:**
```bash
cd apps/frontend
npm run dev
```

**Port:** 3000 (Vite dev server for renderer)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `apps/frontend/src/main/agent/task-monitor.ts` | frontend | **NEW FILE** - Create TaskMonitorService class |
| `apps/frontend/src/main/agent/agent-manager.ts` | frontend | Add taskMonitor property, startTaskMonitoring/stopTaskMonitoring methods |
| `apps/frontend/src/main/agent/index.ts` | frontend | Export TaskMonitorService if needed |
| `apps/frontend/src/main/ipc-handlers/task/execution-handlers.ts` | frontend | Extract recovery logic to shared `recoverStuckTaskInternal()` function |
| `apps/frontend/src/main/index.ts` | frontend | Start monitoring after init, stop on before-quit |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `apps/frontend/src/main/agent/agent-manager.ts` | Class structure, EventEmitter pattern, lifecycle management |
| `apps/frontend/src/main/ipc-handlers/task/execution-handlers.ts` | TASK_RECOVER_STUCK handler - existing recovery logic (lines 553-815) |
| `apps/frontend/src/main/index.ts` | App lifecycle hooks (before-quit, killAll pattern) |
| `apps/frontend/src/main/claude-profile/usage-monitor.ts` | Background monitor service pattern with start/stop methods |

## Patterns to Follow

### AgentManager Class Pattern

From `apps/frontend/src/main/agent/agent-manager.ts`:

```typescript
export class AgentManager extends EventEmitter {
  private state: AgentState;
  private processManager: AgentProcessManager;

  constructor() {
    super();
    // Initialize modular components
    this.state = new AgentState();
    // ...
  }

  // Public methods for lifecycle management
  async killAll(): Promise<void> {
    await this.processManager.killAllProcesses();
  }

  isRunning(taskId: string): boolean {
    return this.state.hasProcess(taskId);
  }
}
```

**Key Points:**
- Classes extend EventEmitter for event-based communication
- Private properties with public accessor methods
- Async cleanup methods for lifecycle management

### Recovery Logic Pattern

From `apps/frontend/src/main/ipc-handlers/task/execution-handlers.ts` (TASK_RECOVER_STUCK handler):

```typescript
// Check if task is actually running
const isActuallyRunning = agentManager.isRunning(taskId);

if (isActuallyRunning) {
  return { success: false, error: 'Task is still running' };
}

// Find task and project
const { task, project } = findTaskAndProject(taskId);

// Determine target status based on subtask progress
const { completedCount, totalCount, allCompleted } = checkSubtasksCompletion(plan);

// If all subtasks completed, set to human_review without restart
if (allCompleted) {
  plan.status = 'human_review';
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  return { success: true, data: { recovered: true, newStatus: 'human_review' }};
}

// Reset only stuck subtasks (in_progress -> pending)
for (const subtask of phase.subtasks) {
  if (subtask.status === 'in_progress') {
    subtask.status = 'pending';
  }
}

// Auto-restart if requested
if (autoRestart && project) {
  agentManager.startTaskExecution(taskId, project.path, task.specId, { ... });
}
```

**Key Points:**
- Check `isRunning(taskId)` to detect stuck state
- Use `findTaskAndProject(taskId)` to get task context
- Use `checkSubtasksCompletion()` to determine appropriate action
- Reset only in_progress subtasks, keep completed ones
- Call appropriate start method based on task state

### App Lifecycle Pattern

From `apps/frontend/src/main/index.ts`:

```typescript
app.on('before-quit', async () => {
  // Stop usage monitor
  const usageMonitor = getUsageMonitor();
  usageMonitor.stop();

  // Kill all running agent processes
  if (agentManager) {
    await agentManager.killAll();
  }
});
```

**Key Points:**
- Use `before-quit` event for cleanup
- Stop monitors before killing processes
- Handle null checks for managers

## Requirements

### Functional Requirements

1. **Background Task Monitoring**
   - Description: TaskMonitorService runs a check every 10 seconds to identify stuck tasks
   - Acceptance: Monitor detects tasks with status `in_progress` or `ai_review` but no running process

2. **Rate-Limited Auto-Recovery**
   - Description: Automatically restart stuck tasks up to 3 times within a 3-minute sliding window per task
   - Acceptance: 4th restart attempt within 3 minutes is blocked with log message

3. **Sliding Window Rate Limit**
   - Description: Track restart attempts with timestamps, automatically expire attempts older than 3 minutes
   - Acceptance: Rate limit resets after 3-minute window passes

4. **Recovery Integration**
   - Description: Reuse existing TASK_RECOVER_STUCK handler logic via shared internal function
   - Acceptance: Both IPC handler and monitor use same recovery logic

5. **Lifecycle Management**
   - Description: Monitor starts after app init, stops on app quit
   - Acceptance: No orphaned intervals after app closes

### Edge Cases

1. **Task Being Manually Recovered** - Skip auto-recovery if manual recovery is in progress (add isRecovering flag)
2. **Status Changes During Check** - Skip if task status changes between detection and recovery
3. **Grace Period** - Wait 2 seconds after status change before checking (avoid false positives during process spawn)
4. **ProjectStore Unavailable** - Graceful degradation if projectStore not initialized yet
5. **All Subtasks Completed** - Don't restart, just update status to human_review

## Implementation Notes

### DO
- Follow the class pattern in `agent-manager.ts` for TaskMonitorService
- Reuse the recovery logic from TASK_RECOVER_STUCK handler via shared function
- Use `Map<string, Array<{timestamp: number}>>` for tracking restart attempts
- Log all significant events with `[TaskMonitor]` prefix
- Clean up old attempts (>3 min) before checking rate limit
- Use `setInterval` for the 10-second monitoring loop
- Call `findTaskAndProject` to get task context
- Check `agentManager.isRunning(taskId)` to detect stuck state

### DON'T
- Create a new recovery implementation - reuse existing logic
- Store restart history persistently - in-memory is sufficient
- Interfere with manual recovery operations
- Restart tasks that have all subtasks completed
- Skip the 2-second grace period after status changes

## Development Environment

### Start Services

```bash
# Frontend (Electron app)
cd apps/frontend
npm run dev
```

### Service URLs
- Frontend: http://localhost:3000 (Vite dev server)
- Electron DevTools: Opens automatically in dev mode

### Required Environment Variables
- `DEBUG`: Set to `true` for additional logging

## Success Criteria

The task is complete when:

1. [ ] TaskMonitorService class created with all required methods
2. [ ] Rate limiting works correctly (3 restarts per 3 minutes per task)
3. [ ] Monitor integrates with AgentManager via startTaskMonitoring/stopTaskMonitoring
4. [ ] Recovery logic extracted to shared function used by both IPC handler and monitor
5. [ ] Monitor starts on app init and stops on app quit
6. [ ] No console errors during normal operation
7. [ ] Existing tests still pass
8. [ ] Manual recovery still works independently

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Rate limit enforcement | `apps/frontend/src/main/agent/task-monitor.test.ts` | 4th restart blocked within 3 minutes |
| Rate limit reset | `apps/frontend/src/main/agent/task-monitor.test.ts` | Limit resets after 3-minute window |
| Cleanup old attempts | `apps/frontend/src/main/agent/task-monitor.test.ts` | Attempts older than 3 min are removed |
| Grace period | `apps/frontend/src/main/agent/task-monitor.test.ts` | No false positives within 2s of status change |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Monitor + AgentManager | frontend | Monitor detects stuck tasks via isRunning check |
| Recovery invocation | frontend | Monitor calls recoverStuckTaskInternal correctly |
| Lifecycle management | frontend | Monitor stops cleanly on app quit |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Stuck task detection | 1. Start task 2. Kill process externally 3. Wait 10s | Task auto-recovers and restarts |
| Rate limit hit | 1. Force 3 failures 2. Wait for 4th attempt | 4th recovery blocked, log shows rate limit |
| Manual recovery | 1. Task is stuck 2. User manually recovers | Auto-recovery skips task, no interference |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Task Board | `http://localhost:3000` | Tasks don't stay stuck indefinitely |
| Console (DevTools) | N/A | `[TaskMonitor]` logs appear for detections and recoveries |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| N/A | N/A | No database changes for this feature |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete (if applicable)
- [ ] Database state verified (if applicable)
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced

## Technical Implementation Details

### TaskMonitorService Class Structure

```typescript
export class TaskMonitorService {
  private restartAttempts: Map<string, Array<{timestamp: number}>> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private agentManager: AgentManager | null = null;
  private projectStore: ProjectStore | null = null;

  // Configuration constants
  private readonly CHECK_INTERVAL_MS = 10000; // 10 seconds
  private readonly RATE_LIMIT_COUNT = 3;
  private readonly RATE_LIMIT_WINDOW_MS = 180000; // 3 minutes
  private readonly GRACE_PERIOD_MS = 2000; // 2 seconds

  // Public methods
  startMonitoring(agentManager: AgentManager, projectStore: ProjectStore): void
  stopMonitoring(): void

  // Private methods
  private checkRateLimit(taskId: string): boolean
  private recordRestartAttempt(taskId: string): void
  private cleanupOldAttempts(taskId: string): void
  private async checkAllTasks(): Promise<void>
}
```

### Monitoring Loop Logic

```typescript
private async checkAllTasks(): Promise<void> {
  if (!this.projectStore) return;

  const projects = this.projectStore.getAllProjects();

  for (const project of projects) {
    for (const task of project.tasks) {
      // Only check active tasks
      if (task.status !== 'in_progress' && task.status !== 'ai_review') continue;

      // Skip if process is actually running
      if (this.agentManager?.isRunning(task.id)) continue;

      // Skip if within grace period (check statusUpdatedAt)
      if (this.isWithinGracePeriod(task)) continue;

      // Stuck task detected
      console.log(`[TaskMonitor] Detected stuck task: ${task.id}`);

      // Clean up old attempts and check rate limit
      this.cleanupOldAttempts(task.id);

      if (!this.checkRateLimit(task.id)) {
        console.log(`[TaskMonitor] Rate limit exceeded for task ${task.id}, skipping auto-recovery`);
        continue;
      }

      // Attempt recovery
      const attemptCount = (this.restartAttempts.get(task.id)?.length || 0) + 1;
      console.log(`[TaskMonitor] Auto-recovering task ${task.id} (attempt ${attemptCount})`);

      await recoverStuckTaskInternal(task.id, { autoRestart: true });
      this.recordRestartAttempt(task.id);
    }
  }
}
```

### Integration Points

1. **AgentManager constructor**: Create TaskMonitorService instance
2. **After projectStore init**: Call `agentManager.startTaskMonitoring(projectStore)`
3. **On before-quit**: Call `agentManager.stopTaskMonitoring()`
