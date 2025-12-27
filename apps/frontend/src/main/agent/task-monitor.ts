/**
 * Task Monitor Service - Automatic recovery for stuck tasks
 *
 * Monitors all tasks in the background and automatically recovers tasks
 * that appear stuck (marked as running but no active process).
 *
 * Features:
 * - Runs checks every 10 seconds
 * - Rate limiting: Max 3 restarts per task within 3-minute sliding window
 * - Reuses existing recovery logic via shared function
 */

import { EventEmitter } from 'events';
import { projectStore } from '../project-store';
import type { AgentManager } from './agent-manager';
import { recoverStuckTaskInternal } from '../ipc-handlers/task/execution-handlers';

export class TaskMonitorService extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private restartAttempts: Map<string, Array<{ timestamp: number }>> = new Map();
  private agentManager: AgentManager | null = null;
  private isChecking = false;

  // Configuration constants
  private readonly CHECK_INTERVAL_MS = 10000; // 10 seconds
  private readonly RATE_LIMIT_COUNT = 3;
  private readonly RATE_LIMIT_WINDOW_MS = 180000; // 3 minutes
  private readonly GRACE_PERIOD_MS = 2000; // 2 seconds (unused for now, reserved for future)

  /**
   * Start monitoring all tasks
   */
  startMonitoring(agentManager: AgentManager): void {
    if (this.intervalId) {
      console.log('[TaskMonitor] Already running');
      return;
    }

    this.agentManager = agentManager;
    console.log('[TaskMonitor] Starting monitor with interval:', this.CHECK_INTERVAL_MS, 'ms');

    // Start interval
    this.intervalId = setInterval(() => {
      this.checkAllTasks();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[TaskMonitor] Stopped');
    }
  }

  /**
   * Check all tasks for stuck state
   */
  private async checkAllTasks(): Promise<void> {
    if (this.isChecking) {
      return; // Prevent concurrent checks
    }

    this.isChecking = true;

    try {
      if (!this.agentManager) {
        return;
      }

      const projects = projectStore.getProjects();

      for (const project of projects) {
        const tasks = projectStore.getTasks(project.id);

        for (const task of tasks) {
          // Only check active tasks
          if (task.status !== 'in_progress' && task.status !== 'ai_review') {
            continue;
          }

          // Check if process is actually running
          const isRunning = this.agentManager.isRunning(task.id);
          if (isRunning) {
            continue; // Not stuck
          }

          // Stuck task detected!
          console.log(`[TaskMonitor] Detected stuck task: ${task.id} (status: ${task.status})`);

          // Check if auto-recovery is enabled for this task (default: true)
          const autoRecoveryEnabled = task.metadata?.autoRecoveryEnabled ?? true;
          if (!autoRecoveryEnabled) {
            console.log(`[TaskMonitor] Auto-recovery disabled for task ${task.id}, skipping`);
            continue;
          }

          // Clean up old restart attempts
          this.cleanupOldAttempts(task.id);

          // Check rate limit using task-specific max attempts
          const maxAttempts = task.metadata?.maxRecoveryAttempts ?? 3;
          if (!this.checkRateLimit(task.id, maxAttempts)) {
            console.log(`[TaskMonitor] Rate limit exceeded for task ${task.id} (max: ${maxAttempts}), skipping auto-recovery`);
            continue;
          }

          // Attempt auto-recovery
          const attemptCount = (this.restartAttempts.get(task.id)?.length || 0) + 1;
          console.log(`[TaskMonitor] Auto-recovering task ${task.id} (attempt ${attemptCount})`);

          try {
            await recoverStuckTaskInternal(task.id, { autoRestart: true });
            this.recordRestartAttempt(task.id);
            console.log(`[TaskMonitor] Successfully auto-recovered task ${task.id}`);
          } catch (error) {
            console.error(`[TaskMonitor] Failed to recover task ${task.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[TaskMonitor] Check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check if task is within rate limit
   * @param taskId - Task ID to check
   * @param maxAttempts - Maximum allowed attempts (task-specific)
   */
  private checkRateLimit(taskId: string, maxAttempts: number): boolean {
    const attempts = this.restartAttempts.get(taskId) || [];
    return attempts.length < maxAttempts;
  }

  /**
   * Record restart attempt for task
   */
  private recordRestartAttempt(taskId: string): void {
    const attempts = this.restartAttempts.get(taskId) || [];
    attempts.push({ timestamp: Date.now() });
    this.restartAttempts.set(taskId, attempts);
  }

  /**
   * Clean up restart attempts older than rate limit window
   */
  private cleanupOldAttempts(taskId: string): void {
    const attempts = this.restartAttempts.get(taskId);
    if (!attempts) return;

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
}
