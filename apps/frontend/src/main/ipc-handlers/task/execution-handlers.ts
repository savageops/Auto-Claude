import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';
import type { IPCResult, TaskStartOptions, TaskStatus } from '../../../shared/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { AgentManager } from '../../agent';
import { fileWatcher } from '../../file-watcher';
import { findTaskAndProject } from './shared';
import { checkGitStatus } from '../../project-initializer';
import { getClaudeProfileManager } from '../../claude-profile-manager';

/**
 * Helper function to check subtask completion status
 */
function checkSubtasksCompletion(plan: Record<string, unknown> | null): {
  allSubtasks: Array<{ status: string }>;
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
} {
  const allSubtasks = (plan?.phases as Array<{ subtasks?: Array<{ status: string }> }> | undefined)?.flatMap(phase =>
    phase.subtasks || []
  ) || [];
  const completedCount = allSubtasks.filter(s => s.status === 'completed').length;
  const totalCount = allSubtasks.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  return { allSubtasks, completedCount, totalCount, allCompleted };
}

/**
 * Internal function to recover a stuck task.
 * Extracted from TASK_RECOVER_STUCK handler to allow reuse from TaskMonitorService.
 *
 * This function assumes the caller has already verified that the task is NOT actually running.
 * The isActuallyRunning check should be performed by the caller before invoking this function.
 *
 * @param taskId - The ID of the task to recover
 * @param options - Recovery options (targetStatus, autoRestart)
 * @param agentManager - The AgentManager instance for process management
 * @param getMainWindow - Function to get the main BrowserWindow for IPC communication
 * @returns IPCResult with recovery outcome
 */
export async function recoverStuckTaskInternal(
  taskId: string,
  options: { targetStatus?: TaskStatus; autoRestart?: boolean },
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): Promise<IPCResult<{ taskId: string; recovered: boolean; newStatus: TaskStatus; message: string; autoRestarted?: boolean }>> {
  const targetStatus = options?.targetStatus;
  const autoRestart = options?.autoRestart ?? false;

  // Find task and project
  const { task, project } = findTaskAndProject(taskId);

  if (!task || !project) {
    return { success: false, error: 'Task not found' };
  }

  // Get the spec directory
  const autoBuildDir = project.autoBuildPath || '.turret';
  const specDir = path.join(
    project.path,
    autoBuildDir,
    'specs',
    task.specId
  );

  // Update implementation_plan.json
  const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

  try {
    // Read the plan to analyze subtask progress
    let plan: Record<string, unknown> | null = null;
    if (existsSync(planPath)) {
      const planContent = readFileSync(planPath, 'utf-8');
      plan = JSON.parse(planContent);
    }

    // Determine the target status intelligently based on subtask progress
    // If targetStatus is explicitly provided, use it; otherwise calculate from subtasks
    let newStatus: TaskStatus = targetStatus || 'backlog';

    if (!targetStatus && plan?.phases && Array.isArray(plan.phases)) {
      // Analyze subtask statuses to determine appropriate recovery status
      const { completedCount, totalCount, allCompleted } = checkSubtasksCompletion(plan);

      if (totalCount > 0) {
        if (allCompleted) {
          // All subtasks completed - should go to review (ai_review or human_review based on source)
          // For recovery, human_review is safer as it requires manual verification
          newStatus = 'human_review';
        } else if (completedCount > 0) {
          // Some subtasks completed, some still pending - task is in progress
          newStatus = 'in_progress';
        }
        // else: no subtasks completed, stay with 'backlog'
      }
    }

    if (plan) {
      // Update status
      plan.status = newStatus;
      plan.planStatus = newStatus === 'done' ? 'completed'
        : newStatus === 'in_progress' ? 'in_progress'
        : newStatus === 'ai_review' ? 'review'
        : newStatus === 'human_review' ? 'review'
        : 'pending';
      plan.updated_at = new Date().toISOString();

      // Add recovery note
      plan.recoveryNote = `Task recovered from stuck state at ${new Date().toISOString()}`;

      // Check if task is actually stuck or just completed and waiting for merge
      const { allCompleted } = checkSubtasksCompletion(plan);

      if (allCompleted) {
        console.log('[Recovery] Task is fully complete (all subtasks done), setting to human_review without restart');
        // Don't reset any subtasks - task is done!
        // Just update status in plan file (project store reads from file, no separate update needed)
        plan.status = 'human_review';
        plan.planStatus = 'review';
        writeFileSync(planPath, JSON.stringify(plan, null, 2));

        return {
          success: true,
          data: {
            taskId,
            recovered: true,
            newStatus: 'human_review',
            message: 'Task is complete and ready for review',
            autoRestarted: false
          }
        };
      }

      // Task is not complete - reset only stuck subtasks for retry
      // Keep completed subtasks as-is so run.py can resume from where it left off
      if (plan.phases && Array.isArray(plan.phases)) {
        for (const phase of plan.phases as Array<{ subtasks?: Array<{ status: string; actual_output?: string; started_at?: string; completed_at?: string }> }>) {
          if (phase.subtasks && Array.isArray(phase.subtasks)) {
            for (const subtask of phase.subtasks) {
              // Reset in_progress subtasks to pending (they were interrupted)
              // Keep completed subtasks as-is so run.py can resume
              if (subtask.status === 'in_progress') {
                const originalStatus = subtask.status;
                subtask.status = 'pending';
                // Clear execution data to maintain consistency
                delete subtask.actual_output;
                delete subtask.started_at;
                delete subtask.completed_at;
                console.log(`[Recovery] Reset stuck subtask: ${originalStatus} -> pending`);
              }
              // Also reset failed subtasks so they can be retried
              if (subtask.status === 'failed') {
                subtask.status = 'pending';
                // Clear execution data to maintain consistency
                delete subtask.actual_output;
                delete subtask.started_at;
                delete subtask.completed_at;
                console.log(`[Recovery] Reset failed subtask for retry`);
              }
            }
          }
        }
      }

      writeFileSync(planPath, JSON.stringify(plan, null, 2));
    }

    // Stop file watcher if it was watching this task
    fileWatcher.unwatch(taskId);

    // Auto-restart the task if requested
    let autoRestarted = false;
    if (autoRestart && project) {
      // Check git status before auto-restarting
      const gitStatusForRestart = checkGitStatus(project.path);
      if (!gitStatusForRestart.isGitRepo || !gitStatusForRestart.hasCommits) {
        console.warn('[Recovery] Git check failed, cannot auto-restart task');
        // Recovery succeeded but we can't restart without git
        return {
          success: true,
          data: {
            taskId,
            recovered: true,
            newStatus,
            message: `Task recovered but cannot restart: ${gitStatusForRestart.error || 'Git repository with commits required.'}`,
            autoRestarted: false
          }
        };
      }

      // Check authentication before auto-restarting
      const profileManager = getClaudeProfileManager();
      if (!profileManager.hasValidAuth()) {
        console.warn('[Recovery] Auth check failed, cannot auto-restart task');
        // Recovery succeeded but we can't restart without auth
        return {
          success: true,
          data: {
            taskId,
            recovered: true,
            newStatus,
            message: 'Task recovered but cannot restart: Claude authentication required. Please go to Settings > Claude Profiles and authenticate your account.',
            autoRestarted: false
          }
        };
      }

      try {
        // Set status to in_progress for the restart
        newStatus = 'in_progress';

        // Update plan status for restart
        if (plan) {
          plan.status = 'in_progress';
          plan.planStatus = 'in_progress';
          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        }

        // Start the task execution
        // Start file watcher for this task
        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specDirForWatcher = path.join(project.path, specsBaseDir, task.specId);
        fileWatcher.watch(taskId, specDirForWatcher);

        // Check if spec.md exists to determine whether to run spec creation or task execution
        const specFilePath = path.join(specDirForWatcher, AUTO_BUILD_PATHS.SPEC_FILE);
        const hasSpec = existsSync(specFilePath);
        const needsSpecCreation = !hasSpec;

        if (needsSpecCreation) {
          // No spec file - need to run spec_runner.py to create the spec
          const taskDescription = task.description || task.title;
          console.warn(`[Recovery] Starting spec creation for: ${task.specId}`);
          agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDirForWatcher, task.metadata);
        } else {
          // Spec exists - run task execution
          console.warn(`[Recovery] Starting task execution for: ${task.specId}`);
          agentManager.startTaskExecution(
            taskId,
            project.path,
            task.specId,
            {
              parallel: false,
              workers: 1
            }
          );
        }

        autoRestarted = true;
        console.warn(`[Recovery] Auto-restarted task ${taskId}`);
      } catch (restartError) {
        console.error('Failed to auto-restart task after recovery:', restartError);
        // Recovery succeeded but restart failed - still report success
      }
    }

    // Notify renderer of status change
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        newStatus
      );
    }

    return {
      success: true,
      data: {
        taskId,
        recovered: true,
        newStatus,
        message: autoRestarted
          ? 'Task recovered and restarted successfully'
          : `Task recovered successfully and moved to ${newStatus}`,
        autoRestarted
      }
    };
  } catch (error) {
    console.error('Failed to recover stuck task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to recover task'
    };
  }
}

/**
 * Register task execution handlers (start, stop, review, status management, recovery)
 */
export function registerTaskExecutionHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  /**
   * Start a task
   */
  ipcMain.on(
    IPC_CHANNELS.TASK_START,
    (_, taskId: string, _options?: TaskStartOptions) => {
      console.warn('[TASK_START] Received request for taskId:', taskId);
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        console.warn('[TASK_START] No main window found');
        return;
      }

      // Find task and project
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        console.warn('[TASK_START] Task or project not found for taskId:', taskId);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Task or project not found'
        );
        return;
      }

      // Check git status - Turret requires git for worktree-based builds
      const gitStatus = checkGitStatus(project.path);
      if (!gitStatus.isGitRepo) {
        console.warn('[TASK_START] Project is not a git repository:', project.path);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Git repository required. Please run "git init" in your project directory. Turret uses git worktrees for isolated builds.'
        );
        return;
      }
      if (!gitStatus.hasCommits) {
        console.warn('[TASK_START] Git repository has no commits:', project.path);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Git repository has no commits. Please make an initial commit first (git add . && git commit -m "Initial commit").'
        );
        return;
      }

      // Check authentication - Claude requires valid auth to run tasks
      const profileManager = getClaudeProfileManager();
      if (!profileManager.hasValidAuth()) {
        console.warn('[TASK_START] No valid authentication for active profile');
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Claude authentication required. Please go to Settings > Claude Profiles and authenticate your account, or set an OAuth token.'
        );
        return;
      }

      console.warn('[TASK_START] Found task:', task.specId, 'status:', task.status, 'subtasks:', task.subtasks.length);

      // Start file watcher for this task
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );
      fileWatcher.watch(taskId, specDir);

      // Check if spec.md exists (indicates spec creation was already done or in progress)
      const specFilePath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
      const hasSpec = existsSync(specFilePath);

      // Check if this task needs spec creation first (no spec file = not yet created)
      // OR if it has a spec but no implementation plan subtasks (spec created, needs planning/building)
      const needsSpecCreation = !hasSpec;
      const needsImplementation = hasSpec && task.subtasks.length === 0;

      console.warn('[TASK_START] hasSpec:', hasSpec, 'needsSpecCreation:', needsSpecCreation, 'needsImplementation:', needsImplementation);

      // Get base branch from project settings for worktree creation
      const baseBranch = project.settings?.mainBranch;

      if (needsSpecCreation) {
        // No spec file - need to run spec_runner.py to create the spec
        const taskDescription = task.description || task.title;
        console.warn('[TASK_START] Starting spec creation for:', task.specId, 'in:', specDir);

        // Start spec creation process - pass the existing spec directory
        // so spec_runner uses it instead of creating a new one
        agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDir, task.metadata);
      } else if (needsImplementation) {
        // Spec exists but no subtasks - run run.py to create implementation plan and execute
        // Read the spec.md to get the task description
        const _taskDescription = task.description || task.title;
        try {
          readFileSync(specFilePath, 'utf-8');
        } catch {
          // Use default description
        }

        console.warn('[TASK_START] Starting task execution (no subtasks) for:', task.specId);
        // Start task execution which will create the implementation plan
        // Note: No parallel mode for planning phase - parallel only makes sense with multiple subtasks
        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: false,  // Sequential for planning phase
            workers: 1,
            baseBranch
          }
        );
      } else {
        // Task has subtasks, start normal execution
        // Note: Parallel execution is handled internally by the agent, not via CLI flags
        console.warn('[TASK_START] Starting task execution (has subtasks) for:', task.specId);

        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: false,
            workers: 1,
            baseBranch
          }
        );
      }

      // Notify status change
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'in_progress'
      );
    }
  );

  /**
   * Stop a task
   */
  ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: string) => {
    agentManager.killTask(taskId);
    fileWatcher.unwatch(taskId);

    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'backlog'
      );
    }
  });

  /**
   * Review a task (approve or reject)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_REVIEW,
    async (
      _,
      taskId: string,
      approved: boolean,
      feedback?: string
    ): Promise<IPCResult> => {
      // Find task and project
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Check if dev mode is enabled for this project
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );

      // Check if worktree exists - QA needs to run in the worktree where the build happened
      const worktreePath = path.join(project.path, '.worktrees', task.specId);
      const worktreeSpecDir = path.join(worktreePath, specsBaseDir, task.specId);
      const hasWorktree = existsSync(worktreePath);

      if (approved) {
        // Write approval to QA report
        const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);
        writeFileSync(
          qaReportPath,
          `# QA Review\n\nStatus: APPROVED\n\nReviewed at: ${new Date().toISOString()}\n`
        );

        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'done'
          );
        }
      } else {
        // Reset and discard all changes from worktree merge in main
        // The worktree still has all changes, so nothing is lost
        if (hasWorktree) {
          // Step 1: Unstage all changes
          const resetResult = spawnSync('git', ['reset', 'HEAD'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (resetResult.status === 0) {
            console.log('[TASK_REVIEW] Unstaged changes in main');
          }

          // Step 2: Discard all working tree changes (restore to pre-merge state)
          const checkoutResult = spawnSync('git', ['checkout', '--', '.'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (checkoutResult.status === 0) {
            console.log('[TASK_REVIEW] Discarded working tree changes in main');
          }

          // Step 3: Clean untracked files that came from the merge
          // IMPORTANT: Exclude .turret and .worktrees directories to preserve specs and worktree data
          const cleanResult = spawnSync('git', ['clean', '-fd', '-e', '.turret', '-e', '.worktrees'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });

          if (cleanResult.status === 0) {
            console.log('[TASK_REVIEW] Cleaned untracked files in main');
          }
        }

        // Update task status to backlog
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'backlog'
          );
        }
      }

      return { success: true };
    }
  );

  /**
   * Get task status
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_STATUS,
    async (_, taskId: string): Promise<IPCResult<TaskStatus>> => {
      const { task } = findTaskAndProject(taskId);

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      return {
        success: true,
        data: task.status as TaskStatus
      };
    }
  );

  /**
   * Recover a stuck task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_RECOVER_STUCK,
    async (
      _,
      taskId: string,
      options?: { targetStatus?: TaskStatus; autoRestart?: boolean }
    ): Promise<IPCResult<{ taskId: string; recovered: boolean; newStatus: TaskStatus; message: string; autoRestarted?: boolean }>> => {
      // Check if task is actually running
      const isActuallyRunning = agentManager.isRunning(taskId);

      if (isActuallyRunning) {
        return {
          success: false,
          error: 'Task is still running. Stop it first before recovering.',
          data: {
            taskId,
            recovered: false,
            newStatus: 'in_progress' as TaskStatus,
            message: 'Task is still running'
          }
        };
      }

      // Task is not running, proceed with recovery
      return recoverStuckTaskInternal(taskId, options || {}, agentManager, getMainWindow);
    }
  );
}