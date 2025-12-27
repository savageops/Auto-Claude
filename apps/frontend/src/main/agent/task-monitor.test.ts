/**
 * Unit tests for TaskMonitorService
 * Tests rate limiting, grace period, and lifecycle management
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TaskMonitorService } from './task-monitor';
import { recoverStuckTaskInternal } from '../ipc-handlers/task/execution-handlers';

// Mock the recoverStuckTaskInternal function
vi.mock('../ipc-handlers/task/execution-handlers', () => ({
  recoverStuckTaskInternal: vi.fn().mockResolvedValue({
    success: true,
    data: { message: 'Task recovered successfully' }
  })
}));

// Cast to mock for type safety
const mockRecoverStuckTaskInternal = recoverStuckTaskInternal as Mock;

// Mock console methods to avoid test output clutter
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Create mock AgentManager
function createMockAgentManager(runningTaskIds: string[] = []) {
  return {
    isRunning: vi.fn((taskId: string) => runningTaskIds.includes(taskId)),
    startTaskExecution: vi.fn(),
    killAll: vi.fn()
  };
}

// Create mock ProjectStore
function createMockProjectStore(projects: Array<{
  id: string;
  path: string;
  tasks: Array<{
    id: string;
    status: string;
    specId: string;
    updatedAt?: Date;
  }>;
}> = []) {
  return {
    getProjects: vi.fn(() => projects.map(p => ({ id: p.id, path: p.path }))),
    getTasks: vi.fn((projectId: string) => {
      const project = projects.find(p => p.id === projectId);
      return project?.tasks || [];
    })
  };
}

// Create mock getMainWindow
function createMockGetMainWindow() {
  return vi.fn(() => ({
    webContents: {
      send: vi.fn()
    }
  }));
}

describe('TaskMonitorService', () => {
  let monitor: TaskMonitorService;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new TaskMonitorService();
    mockRecoverStuckTaskInternal.mockClear();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Rate Limit Enforcement', () => {
    it('should allow first 3 restart attempts within rate limit window', () => {
      const taskId = 'task-123';

      // First attempt - should be allowed
      expect(monitor.checkRateLimit(taskId)).toBe(true);
      monitor.recordRestartAttempt(taskId);

      // Second attempt - should be allowed
      expect(monitor.checkRateLimit(taskId)).toBe(true);
      monitor.recordRestartAttempt(taskId);

      // Third attempt - should be allowed
      expect(monitor.checkRateLimit(taskId)).toBe(true);
      monitor.recordRestartAttempt(taskId);

      // All 3 attempts recorded
      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(3);
      expect(status.remaining).toBe(0);
    });

    it('should block 4th restart attempt within 3 minutes', () => {
      const taskId = 'task-456';

      // Record 3 attempts
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);

      // 4th attempt should be blocked
      expect(monitor.checkRateLimit(taskId)).toBe(false);

      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(3);
      expect(status.remaining).toBe(0);
    });

    it('should track rate limits independently per task', () => {
      const taskId1 = 'task-111';
      const taskId2 = 'task-222';

      // Exhaust rate limit for task 1
      monitor.recordRestartAttempt(taskId1);
      monitor.recordRestartAttempt(taskId1);
      monitor.recordRestartAttempt(taskId1);

      // Task 1 should be blocked
      expect(monitor.checkRateLimit(taskId1)).toBe(false);

      // Task 2 should still be allowed
      expect(monitor.checkRateLimit(taskId2)).toBe(true);
    });
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit after 3-minute window expires', () => {
      const taskId = 'task-789';

      // Record 3 attempts
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);

      // Should be blocked
      expect(monitor.checkRateLimit(taskId)).toBe(false);

      // Advance time by 3 minutes + 1 second
      vi.advanceTimersByTime(180001);

      // Cleanup old attempts
      monitor.cleanupOldAttempts(taskId);

      // Should be allowed again
      expect(monitor.checkRateLimit(taskId)).toBe(true);

      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(0);
      expect(status.remaining).toBe(3);
    });

    it('should only remove attempts older than 3 minutes during cleanup', () => {
      const taskId = 'task-sliding';

      // Record first attempt
      monitor.recordRestartAttempt(taskId);

      // Advance by 2 minutes
      vi.advanceTimersByTime(120000);

      // Record second attempt
      monitor.recordRestartAttempt(taskId);

      // Advance by 1.5 minutes (first attempt is now 3.5 min old)
      vi.advanceTimersByTime(90000);

      // Cleanup - should remove first attempt but keep second
      monitor.cleanupOldAttempts(taskId);

      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(1); // Only second attempt remains
      expect(status.remaining).toBe(2);
    });
  });

  describe('Cleanup Old Attempts', () => {
    it('should remove all attempts older than 3 minutes', () => {
      const taskId = 'task-cleanup';

      // Record attempts
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);

      // Verify attempts are recorded
      expect(monitor.getRateLimitStatus(taskId).attempts).toBe(3);

      // Advance time past the window
      vi.advanceTimersByTime(180001);

      // Cleanup
      monitor.cleanupOldAttempts(taskId);

      // All attempts should be removed
      expect(monitor.getRateLimitStatus(taskId).attempts).toBe(0);
    });

    it('should handle cleanup for task with no attempts', () => {
      const taskId = 'task-no-attempts';

      // Should not throw
      expect(() => monitor.cleanupOldAttempts(taskId)).not.toThrow();

      // Status should show 0 attempts
      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(0);
    });

    it('should delete task entry when all attempts expire', () => {
      const taskId = 'task-delete-entry';

      // Record and expire all attempts
      monitor.recordRestartAttempt(taskId);
      vi.advanceTimersByTime(180001);
      monitor.cleanupOldAttempts(taskId);

      // Internal map should have entry deleted (check via status)
      const status = monitor.getRateLimitStatus(taskId);
      expect(status.attempts).toBe(0);
    });
  });

  describe('Grace Period', () => {
    it('should skip recovery for tasks within 2 seconds of status change', async () => {
      const mockAgentManager = createMockAgentManager([]);

      // Create a project store that returns a dynamically-created task
      // with updatedAt set to 1 second before "now" at check time
      const mockProjectStore = {
        getProjects: vi.fn(() => [{ id: 'project-1', path: '/test/path' }]),
        getTasks: vi.fn((_projectId: string) => [{
          id: 'task-grace',
          status: 'in_progress' as const,
          specId: 'spec-1',
          // Set to 1 second before the current (fake) time - always within grace period
          updatedAt: new Date(Date.now() - 1000)
        }])
      };
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);

      // Allow any pending promises to resolve
      await Promise.resolve();

      // The task should not be recovered because it's within grace period
      expect(mockRecoverStuckTaskInternal).not.toHaveBeenCalled();
    });

    it('should attempt recovery for tasks past 2 second grace period', async () => {
      const now = Date.now();
      const task = {
        id: 'task-past-grace',
        status: 'in_progress' as const,
        specId: 'spec-2',
        updatedAt: new Date(now - 5000) // 5 seconds ago
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);

      // Allow async operations to complete
      await Promise.resolve();
      await Promise.resolve();

      // The task should be recovered
      expect(mockRecoverStuckTaskInternal).toHaveBeenCalledWith(
        'task-past-grace',
        { autoRestart: true },
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle missing updatedAt gracefully (no grace period applied)', async () => {
      const task = {
        id: 'task-no-timestamp',
        status: 'in_progress' as const,
        specId: 'spec-3'
        // No updatedAt field
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);

      // Allow async operations to complete
      await Promise.resolve();
      await Promise.resolve();

      // Without updatedAt, task should be checked (grace period returns false)
      expect(mockRecoverStuckTaskInternal).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Methods', () => {
    it('should start monitoring and emit event', () => {
      const startedHandler = vi.fn();
      monitor.on('monitoring-started', startedHandler);

      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      expect(startedHandler).toHaveBeenCalled();
    });

    it('should stop monitoring and emit event', () => {
      const stoppedHandler = vi.fn();
      monitor.on('monitoring-stopped', stoppedHandler);

      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );
      monitor.stopMonitoring();

      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should clear all state on stopMonitoring', () => {
      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Record some restart attempts
      monitor.recordRestartAttempt('task-1');
      monitor.recordRestartAttempt('task-2');

      // Mark task as recovering
      monitor.markRecovering('task-1');

      // Stop monitoring
      monitor.stopMonitoring();

      // All state should be cleared
      expect(monitor.getRateLimitStatus('task-1').attempts).toBe(0);
      expect(monitor.getRateLimitStatus('task-2').attempts).toBe(0);
      expect(monitor.isTaskRecovering('task-1')).toBe(false);
      expect(monitor.getAgentManager()).toBeNull();
      expect(monitor.getMainWindowCallback()).toBeNull();
    });

    it('should store references on startMonitoring', () => {
      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      expect(monitor.getAgentManager()).toBe(mockAgentManager);
      expect(monitor.getMainWindowCallback()).toBe(mockGetMainWindow);
    });

    it('should run check interval at correct frequency', () => {
      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Initially, getProjects should not have been called (interval not triggered yet)
      expect(mockProjectStore.getProjects).not.toHaveBeenCalled();

      // Advance by 10 seconds (CHECK_INTERVAL_MS)
      vi.advanceTimersByTime(10000);

      // Now it should have been called
      expect(mockProjectStore.getProjects).toHaveBeenCalledTimes(1);

      // Advance by another 10 seconds
      vi.advanceTimersByTime(10000);

      // Should be called again
      expect(mockProjectStore.getProjects).toHaveBeenCalledTimes(2);
    });
  });

  describe('Double-Start Prevention', () => {
    it('should be a no-op when starting while already started', () => {
      const startedHandler = vi.fn();
      monitor.on('monitoring-started', startedHandler);

      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      // Start first time
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      expect(startedHandler).toHaveBeenCalledTimes(1);

      // Try to start again
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Should not emit again - guard prevents double-start
      expect(startedHandler).toHaveBeenCalledTimes(1);
    });

    it('should log message when attempting double-start', () => {
      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      // Start first time
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Try to start again
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Should log the "Already running" message
      expect(console.log).toHaveBeenCalledWith(
        '[TaskMonitor] Already running, skipping start'
      );
    });

    it('should allow starting again after stopMonitoring', () => {
      const startedHandler = vi.fn();
      monitor.on('monitoring-started', startedHandler);

      const mockAgentManager = createMockAgentManager();
      const mockProjectStore = createMockProjectStore();
      const mockGetMainWindow = createMockGetMainWindow();

      // Start, stop, start again
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );
      monitor.stopMonitoring();
      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Should emit started event twice
      expect(startedHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Recovery Tracking', () => {
    it('should mark task as recovering to prevent concurrent recovery', () => {
      const taskId = 'task-concurrent';

      expect(monitor.isTaskRecovering(taskId)).toBe(false);

      monitor.markRecovering(taskId);
      expect(monitor.isTaskRecovering(taskId)).toBe(true);

      monitor.unmarkRecovering(taskId);
      expect(monitor.isTaskRecovering(taskId)).toBe(false);
    });

    it('should skip tasks that are already being recovered', async () => {
      const taskId = 'task-already-recovering';
      const task = {
        id: taskId,
        status: 'in_progress' as const,
        specId: 'spec-1',
        updatedAt: new Date(Date.now() - 5000) // Past grace period
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      // Mark task as already recovering BEFORE starting
      monitor.markRecovering(taskId);

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();

      // Recovery should not be called because task is already recovering
      expect(mockRecoverStuckTaskInternal).not.toHaveBeenCalled();
    });
  });

  describe('Event Emissions', () => {
    it('should emit rate-limit-exceeded event when rate limit hit', async () => {
      const rateLimitHandler = vi.fn();
      monitor.on('rate-limit-exceeded', rateLimitHandler);

      const taskId = 'task-rate-limited';
      const task = {
        id: taskId,
        status: 'in_progress' as const,
        specId: 'spec-1',
        updatedAt: new Date(Date.now() - 5000)
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      // Exhaust rate limit before starting
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);
      monitor.recordRestartAttempt(taskId);

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(rateLimitHandler).toHaveBeenCalledWith(taskId);
    });

    it('should emit recovery-attempt event when attempting recovery', async () => {
      const attemptHandler = vi.fn();
      monitor.on('recovery-attempt', attemptHandler);

      const task = {
        id: 'task-attempt',
        status: 'in_progress' as const,
        specId: 'spec-1',
        updatedAt: new Date(Date.now() - 5000)
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();

      expect(attemptHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-attempt',
          projectId: 'project-1',
          attemptNumber: 1
        })
      );
    });

    it('should emit recovery-success event on successful recovery', async () => {
      const successHandler = vi.fn();
      monitor.on('recovery-success', successHandler);

      const task = {
        id: 'task-success',
        status: 'in_progress' as const,
        specId: 'spec-1',
        updatedAt: new Date(Date.now() - 5000)
      };

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();

      expect(successHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-success'
        })
      );
    });
  });

  describe('Task Status Filtering', () => {
    it('should only check tasks with in_progress or ai_review status', async () => {
      const tasks = [
        { id: 'task-progress', status: 'in_progress', specId: 'spec-1', updatedAt: new Date(Date.now() - 5000) },
        { id: 'task-review', status: 'ai_review', specId: 'spec-2', updatedAt: new Date(Date.now() - 5000) },
        { id: 'task-backlog', status: 'backlog', specId: 'spec-3', updatedAt: new Date(Date.now() - 5000) },
        { id: 'task-done', status: 'done', specId: 'spec-4', updatedAt: new Date(Date.now() - 5000) }
      ];

      const mockAgentManager = createMockAgentManager([]);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: tasks as any
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();

      // Should only be called for in_progress and ai_review tasks
      expect(mockRecoverStuckTaskInternal).toHaveBeenCalledTimes(2);
      expect(mockRecoverStuckTaskInternal).toHaveBeenCalledWith('task-progress', expect.anything(), expect.anything(), expect.anything());
      expect(mockRecoverStuckTaskInternal).toHaveBeenCalledWith('task-review', expect.anything(), expect.anything(), expect.anything());
    });

    it('should skip tasks that are actually running', async () => {
      const task = {
        id: 'task-running',
        status: 'in_progress' as const,
        specId: 'spec-1',
        updatedAt: new Date(Date.now() - 5000)
      };

      // Task is marked as running in AgentManager
      const mockAgentManager = createMockAgentManager(['task-running']);
      const mockProjectStore = createMockProjectStore([{
        id: 'project-1',
        path: '/test/path',
        tasks: [task]
      }]);
      const mockGetMainWindow = createMockGetMainWindow();

      monitor.startMonitoring(
        mockAgentManager as any,
        mockProjectStore as any,
        mockGetMainWindow as any
      );

      // Trigger a check cycle
      vi.advanceTimersByTime(10000);
      await Promise.resolve();

      // Should check isRunning
      expect(mockAgentManager.isRunning).toHaveBeenCalledWith('task-running');

      // Should not attempt recovery
      expect(mockRecoverStuckTaskInternal).not.toHaveBeenCalled();
    });
  });
});
