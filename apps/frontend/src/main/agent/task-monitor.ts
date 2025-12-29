/**
 * Task Monitor Service - Automatic recovery for stuck tasks
 *
 * Monitors all tasks at regular intervals and automatically recovers tasks
 * that appear stuck (marked as running but no active process). Uses rate
 * limiting to prevent restart loops.
 *
 * Features:
 * - Runs checks every 10 seconds
 * - Rate limiting: Max 3 restarts per task within 3-minute sliding window
 * - Grace period: Avoids false positives during process spawn
 * - Reuses existing recovery logic via shared function
 *
 * Configuration:
 * - CHECK_INTERVAL_MS: How often to check for stuck tasks (10 seconds)
 * - RATE_LIMIT_COUNT: Maximum restarts per task within the window (3)
 * - RATE_LIMIT_WINDOW_MS: Sliding window for rate limiting (3 minutes)
 * - GRACE_PERIOD_MS: Wait time after status change before checking (2 seconds)
 */

import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type { AgentManager } from './agent-manager';
import type { ProjectStore } from '../project-store';
import type { Project, Task } from '../../shared/types';
import { recoverStuckTaskInternal } from '../ipc-handlers/task/execution-handlers';

interface RestartAttempt {
  timestamp: number;
}

export class TaskMonitorService extends EventEmitter {
  private restartAttempts: Map<string, RestartAttempt[]> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private agentManager: AgentManager | null = null;
  private projectStore: ProjectStore | null = null;
  private getMainWindow: (() => BrowserWindow | null) | null = null;
  private isRecovering: Set<string> = new Set(); // Track tasks being recovered

  // Configuration constants
  private readonly CHECK_INTERVAL_MS = 10000; // 10 seconds
  private readonly RATE_LIMIT_COUNT = 3;
  private readonly RATE_LIMIT_WINDOW_MS = 180000; // 3 minutes
  private readonly GRACE_PERIOD_MS = 2000; // 2 seconds

  constructor() {
    super();
  }

  /**
   * Start monitoring for stuck tasks
   * @param agentManager - The AgentManager instance to check running status
   * @param projectStore - The ProjectStore instance to get all projects and tasks
   * @param getMainWindow - Function to get the main BrowserWindow for IPC communication
   */
  startMonitoring(
    agentManager: AgentManager,
    projectStore: ProjectStore,
    getMainWindow: () => BrowserWindow | null
  ): void {
    if (this.monitorInterval) {
      console.log('[TaskMonitor] Already running, skipping start');
      return;
    }

    this.agentManager = agentManager;
    this.projectStore = projectStore;
    this.getMainWindow = getMainWindow;

    console.log('[TaskMonitor] Starting monitoring with interval:', this.CHECK_INTERVAL_MS, 'ms');

    // Start the monitoring loop
    this.monitorInterval = setInterval(() => {
      this.checkAllTasks();
    }, this.CHECK_INTERVAL_MS);

    this.emit('monitoring-started');
  }

  /**
   * Stop monitoring for stuck tasks
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('[TaskMonitor] Stopped monitoring');
    }

    // Clear all references
    this.agentManager = null;
    this.projectStore = null;
    this.getMainWindow = null;
    this.restartAttempts.clear();
    this.isRecovering.clear();

    this.emit('monitoring-stopped');
  }

  /**
   * Check if rate limit has been exceeded for a task
   * @param taskId - The task ID to check
   * @param maxAttempts - Maximum allowed attempts (task-specific, defaults to RATE_LIMIT_COUNT)
   * @returns true if within rate limit (can restart), false if exceeded
   */
  checkRateLimit(taskId: string, maxAttempts: number = this.RATE_LIMIT_COUNT): boolean {
    const attempts = this.restartAttempts.get(taskId) || [];
    return attempts.length < maxAttempts;
  }

  /**
   * Record a restart attempt for a task
   * @param taskId - The task ID that was restarted
   */
  recordRestartAttempt(taskId: string): void {
    const attempts = this.restartAttempts.get(taskId) || [];
    attempts.push({ timestamp: Date.now() });
    this.restartAttempts.set(taskId, attempts);
  }

  /**
   * Clean up restart attempts older than the rate limit window
   * @param taskId - The task ID to clean up
   */
  cleanupOldAttempts(taskId: string): void {
    const attempts = this.restartAttempts.get(taskId);
    if (!attempts || attempts.length === 0) {
      return;
    }

    const now = Date.now();
    const validAttempts = attempts.filter(
      (attempt) => now - attempt.timestamp < this.RATE_LIMIT_WINDOW_MS
    );

    if (validAttempts.length === 0) {
      this.restartAttempts.delete(taskId);
    } else {
      this.restartAttempts.set(taskId, validAttempts);
    }
  }

  /**
   * Check if a task is within the grace period after status change
   * Uses the task's updatedAt timestamp to determine if we should wait
   * before checking for stuck state (avoids false positives during process spawn)
   * @param task - The task to check
   * @returns true if within grace period (should skip), false otherwise
   */
  private isWithinGracePeriod(task: Task): boolean {
    if (!task.updatedAt) {
      return false;
    }

    // Convert Date to timestamp if needed
    const updatedAtTimestamp = task.updatedAt instanceof Date
      ? task.updatedAt.getTime()
      : new Date(task.updatedAt).getTime();

    const timeSinceUpdate = Date.now() - updatedAtTimestamp;
    return timeSinceUpdate < this.GRACE_PERIOD_MS;
  }

  /**
   * Mark a task as being recovered (to prevent concurrent recovery)
   * @param taskId - The task ID being recovered
   */
  markRecovering(taskId: string): void {
    this.isRecovering.add(taskId);
  }

  /**
   * Unmark a task as being recovered
   * @param taskId - The task ID that finished recovery
   */
  unmarkRecovering(taskId: string): void {
    this.isRecovering.delete(taskId);
  }

  /**
   * Check if a task is currently being recovered
   * @param taskId - The task ID to check
   * @returns true if task is being recovered, false otherwise
   */
  isTaskRecovering(taskId: string): boolean {
    return this.isRecovering.has(taskId);
  }

  /**
   * Check all tasks for stuck state and attempt recovery
   * This is the main monitoring loop that runs every CHECK_INTERVAL_MS
   */
  private async checkAllTasks(): Promise<void> {
    if (!this.projectStore || !this.agentManager) {
      return;
    }

    try {
      // Get all projects
      const projects = this.projectStore.getProjects();

      for (const project of projects) {
        // Get tasks for this project
        const tasks = this.projectStore.getTasks(project.id);

        for (const task of tasks) {
          await this.checkTask(task, project);
        }
      }
    } catch (error) {
      console.error('[TaskMonitor] Error checking tasks:', error);
    }
  }

  /**
   * Check a single task for stuck state and attempt recovery
   * @param task - The task to check
   * @param project - The project containing the task
   */
  private async checkTask(task: Task, project: Project): Promise<void> {
    // Only check tasks with active statuses
    if (task.status !== 'in_progress' && task.status !== 'ai_review') {
      return;
    }

    // Skip if process is actually running
    if (this.agentManager?.isRunning(task.id)) {
      return;
    }

    // Skip if within grace period (avoid false positives during process spawn)
    if (this.isWithinGracePeriod(task)) {
      return;
    }

    // Skip if already being recovered (manual or concurrent)
    if (this.isTaskRecovering(task.id)) {
      return;
    }

    // Stuck task detected!
    console.log(`[TaskMonitor] Detected stuck task: ${task.id} (status: ${task.status})`);

    // Check if auto-recovery is enabled for this task (default: true)
    const autoRecoveryEnabled = task.metadata?.autoRecoveryEnabled ?? true;
    if (!autoRecoveryEnabled) {
      console.log(`[TaskMonitor] Auto-recovery disabled for task ${task.id}, skipping`);
      return;
    }

    // Clean up old attempts
    this.cleanupOldAttempts(task.id);

    // Check rate limit using task-specific max attempts
    const maxAttempts = task.metadata?.maxRecoveryAttempts ?? this.RATE_LIMIT_COUNT;
    if (!this.checkRateLimit(task.id, maxAttempts)) {
      console.log(`[TaskMonitor] Rate limit exceeded for task ${task.id} (max: ${maxAttempts}), skipping auto-recovery`);
      this.emit('rate-limit-exceeded', task.id);
      return;
    }

    // Attempt recovery
    const attemptCount = (this.restartAttempts.get(task.id)?.length || 0) + 1;
    console.log(`[TaskMonitor] Auto-recovering task ${task.id} (attempt ${attemptCount}/${maxAttempts})`);

    this.emit('recovery-attempt', {
      taskId: task.id,
      projectId: project.id,
      projectPath: project.path,
      specId: task.specId,
      attemptNumber: attemptCount
    });

    // Set isRecovering flag to prevent concurrent recovery attempts
    this.markRecovering(task.id);

    try {
      // Get the required dependencies for recoverStuckTaskInternal
      const agentManager = this.agentManager;
      const getMainWindow = this.getMainWindow;

      if (!agentManager || !getMainWindow) {
        console.error('[TaskMonitor] Missing dependencies for recovery - agentManager or getMainWindow is null');
        return;
      }

      // Call the shared recovery function with autoRestart enabled
      const result = await recoverStuckTaskInternal(
        task.id,
        { autoRestart: true },
        agentManager,
        getMainWindow
      );

      // Record the attempt after recovery
      this.recordRestartAttempt(task.id);

      if (result.success) {
        console.log(`[TaskMonitor] Successfully recovered task ${task.id}: ${result.data?.message}`);
        this.emit('recovery-success', {
          taskId: task.id,
          result: result.data
        });
      } else {
        console.error(`[TaskMonitor] Failed to recover task ${task.id}: ${result.error}`);
        this.emit('recovery-failed', {
          taskId: task.id,
          error: result.error
        });
      }
    } catch (error) {
      console.error(`[TaskMonitor] Error during recovery of task ${task.id}:`, error);
      // Still record the attempt even if it failed
      this.recordRestartAttempt(task.id);
      this.emit('recovery-error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      // Always clear the isRecovering flag
      this.unmarkRecovering(task.id);
    }
  }

  /**
   * Get the current rate limit status for a task
   * @param taskId - The task ID to check
   * @returns Object with attempt count and remaining attempts
   */
  getRateLimitStatus(taskId: string): { attempts: number; remaining: number; windowMs: number } {
    this.cleanupOldAttempts(taskId);
    const attempts = this.restartAttempts.get(taskId)?.length || 0;
    return {
      attempts,
      remaining: Math.max(0, this.RATE_LIMIT_COUNT - attempts),
      windowMs: this.RATE_LIMIT_WINDOW_MS
    };
  }

  /**
   * Get the stored getMainWindow callback
   * @returns The getMainWindow callback or null if not initialized
   */
  getMainWindowCallback(): (() => BrowserWindow | null) | null {
    return this.getMainWindow;
  }

  /**
   * Get the stored AgentManager reference
   * @returns The AgentManager or null if not initialized
   */
  getAgentManagerInstance(): AgentManager | null {
    return this.agentManager;
  }
}

// Singleton instance
let taskMonitorInstance: TaskMonitorService | null = null;

/**
 * Get the singleton TaskMonitorService instance
 */
export function getTaskMonitor(): TaskMonitorService {
  if (!taskMonitorInstance) {
    taskMonitorInstance = new TaskMonitorService();
  }
  return taskMonitorInstance;
}