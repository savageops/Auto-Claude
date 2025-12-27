import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS } from '../../../shared/constants';
import type { IPCResult, WorktreeStatus, WorktreeDiff, WorktreeDiffFile, WorktreeMergeResult, WorktreeDiscardResult, WorktreeFileDiscardResult, WorktreeListResult, WorktreeListItem } from '../../../shared/types';
import path from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { execSync, spawn, spawnSync } from 'child_process';
import { projectStore } from '../../project-store';
import { PythonEnvManager } from '../../python-env-manager';
import { getEffectiveSourcePath } from '../../turret-updater';
import { getProfileEnv } from '../../rate-limit-detector';
import { findTaskAndProject } from './shared';
import { findPythonCommand, parsePythonCommand } from '../../python-detector';

/**
 * Read the stored base branch from task_metadata.json
 * This is the branch the task was created from (set by user during task creation)
 */
function getTaskBaseBranch(specDir: string): string | undefined {
  try {
    const metadataPath = path.join(specDir, 'task_metadata.json');
    if (existsSync(metadataPath)) {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      // Return baseBranch if explicitly set (not the __project_default__ marker)
      if (metadata.baseBranch && metadata.baseBranch !== '__project_default__') {
        return metadata.baseBranch;
      }
    }
  } catch (e) {
    console.warn('[getTaskBaseBranch] Failed to read task metadata:', e);
  }
  return undefined;
}

/**
 * Register worktree management handlers
 */
export function registerWorktreeHandlers(
  pythonEnvManager: PythonEnvManager,
  getMainWindow: () => BrowserWindow | null
): void {
  /**
   * Get the worktree status for a task
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_STATUS,
    async (_, taskId: string): Promise<IPCResult<WorktreeStatus>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return {
            success: true,
            data: { exists: false }
          };
        }

        // Get branch info from git
        try {
          // Get current branch in worktree
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Get base branch - the current branch in the main project (where changes will be merged)
          // This matches the Python merge logic which merges into the user's current branch
          let baseBranch = 'main';
          try {
            baseBranch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd: project.path,
              encoding: 'utf-8'
            }).trim();
          } catch {
            baseBranch = 'main';
          }

          // Get commit count (cross-platform - no shell syntax)
          let commitCount = 0;
          try {
            const countOutput = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
              cwd: worktreePath,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
            commitCount = parseInt(countOutput, 10) || 0;
          } catch {
            commitCount = 0;
          }

          // Get diff stats
          let filesChanged = 0;
          let additions = 0;
          let deletions = 0;

          let diffStat = '';
          try {
            diffStat = execSync(`git diff --stat ${baseBranch}...HEAD`, {
              cwd: worktreePath,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();

            // Parse the summary line (e.g., "3 files changed, 50 insertions(+), 10 deletions(-)")
            const summaryMatch = diffStat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            if (summaryMatch) {
              filesChanged = parseInt(summaryMatch[1], 10) || 0;
              additions = parseInt(summaryMatch[2], 10) || 0;
              deletions = parseInt(summaryMatch[3], 10) || 0;
            }
          } catch {
            // Ignore diff errors
          }

          return {
            success: true,
            data: {
              exists: true,
              worktreePath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            }
          };
        } catch (gitError) {
          console.error('Git error getting worktree status:', gitError);
          return {
            success: true,
            data: { exists: true, worktreePath }
          };
        }
      } catch (error) {
        console.error('Failed to get worktree status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree status'
        };
      }
    }
  );

  /**
   * Get the diff for a task's worktree
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DIFF,
    async (_, taskId: string): Promise<IPCResult<WorktreeDiff>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return { success: false, error: 'No worktree found for this task' };
        }

        // Get base branch - the current branch in the main project (where changes will be merged)
        let baseBranch = 'main';
        try {
          baseBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: project.path,
            encoding: 'utf-8'
          }).trim();
        } catch {
          baseBranch = 'main';
        }

        // Get the diff with file stats
        const files: WorktreeDiffFile[] = [];

        let numstat = '';
        let nameStatus = '';
        try {
          // Get numstat for additions/deletions per file (cross-platform)
          numstat = execSync(`git diff --numstat ${baseBranch}...HEAD`, {
            cwd: worktreePath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          // Get name-status for file status (cross-platform)
          nameStatus = execSync(`git diff --name-status ${baseBranch}...HEAD`, {
            cwd: worktreePath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          // Parse name-status to get file statuses
          const statusMap: Record<string, 'added' | 'modified' | 'deleted' | 'renamed'> = {};
          nameStatus.split('\n').filter(Boolean).forEach((line: string) => {
            const [status, ...pathParts] = line.split('\t');
            const filePath = pathParts.join('\t'); // Handle files with tabs in name
            switch (status[0]) {
              case 'A': statusMap[filePath] = 'added'; break;
              case 'M': statusMap[filePath] = 'modified'; break;
              case 'D': statusMap[filePath] = 'deleted'; break;
              case 'R': statusMap[pathParts[1] || filePath] = 'renamed'; break;
              default: statusMap[filePath] = 'modified';
            }
          });

          // Parse numstat for additions/deletions
          numstat.split('\n').filter(Boolean).forEach((line: string) => {
            const [adds, dels, filePath] = line.split('\t');
            files.push({
              path: filePath,
              status: statusMap[filePath] || 'modified',
              additions: parseInt(adds, 10) || 0,
              deletions: parseInt(dels, 10) || 0
            });
          });
        } catch (diffError) {
          console.error('Error getting diff:', diffError);
        }

        // Generate summary
        const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
        const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
        const summary = `${files.length} files changed, ${totalAdditions} insertions(+), ${totalDeletions} deletions(-)`;

        return {
          success: true,
          data: { files, summary }
        };
      } catch (error) {
        console.error('Failed to get worktree diff:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree diff'
        };
      }
    }
  );

  /**
   * Merge the worktree changes into the main branch
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_MERGE,
    async (_, taskId: string, options?: { noCommit?: boolean }): Promise<IPCResult<WorktreeMergeResult>> => {
      // Always log merge operations for debugging
      const debug = (...args: unknown[]) => {
        console.warn('[MERGE DEBUG]', ...args);
      };

      try {
        console.warn('[MERGE] Handler called with taskId:', taskId, 'options:', options);
        debug('Starting merge for taskId:', taskId, 'options:', options);

        // Ensure Python environment is ready
        if (!pythonEnvManager.isEnvReady()) {
          const autoBuildSource = getEffectiveSourcePath();
          if (autoBuildSource) {
            const status = await pythonEnvManager.initialize(autoBuildSource);
            if (!status.ready) {
              return { success: false, error: `Python environment not ready: ${status.error || 'Unknown error'}` };
            }
          } else {
            return { success: false, error: 'Python environment not ready and Turret source not found' };
          }
        }

        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          debug('Task or project not found');
          return { success: false, error: 'Task not found' };
        }

        debug('Found task:', task.specId, 'project:', project.path);

        // Use run.py --merge to handle the merge
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return { success: false, error: 'Turret source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs', task.specId);

        if (!existsSync(specDir)) {
          debug('Spec directory not found:', specDir);
          return { success: false, error: 'Spec directory not found' };
        }

        // Check worktree exists before merge
        const worktreePath = path.join(project.path, '.worktrees', task.specId);
        debug('Worktree path:', worktreePath, 'exists:', existsSync(worktreePath));

        // Check if changes are already staged (for stage-only mode)
        if (options?.noCommit) {
          const stagedResult = spawnSync('git', ['diff', '--staged', '--name-only'], {
            cwd: project.path,
encoding: 'utf-8'
          });

          if (stagedResult.status === 0 && stagedResult.stdout?.trim()) {
            const stagedFiles = stagedResult.stdout.trim().split('\n');
            debug('Changes already staged:', stagedFiles.length, 'files');
            // Return success - changes are already staged
            return {
              success: true,
              data: {
                success: true,
                merged: false,
                message: `Changes already staged (${stagedFiles.length} files). Review with git diff --staged.`,
                staged: true,
                alreadyStaged: true,
                projectPath: project.path
              }
            };
          }
        }

        // Get git status before merge
        try {
          const gitStatusBefore = execSync('git status --short', { cwd: project.path, encoding: 'utf-8' });
          debug('Git status BEFORE merge in main project:\n', gitStatusBefore || '(clean)');
          const gitBranch = execSync('git branch --show-current', { cwd: project.path, encoding: 'utf-8' }).trim();
          debug('Current branch:', gitBranch);
        } catch (e) {
          debug('Failed to get git status before:', e);
        }

        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--merge'
        ];

        // Add --no-commit flag if requested (stage changes without committing)
        if (options?.noCommit) {
          args.push('--no-commit');
        }

        // Add --base-branch if task was created with a specific base branch
        const taskBaseBranch = getTaskBaseBranch(specDir);
        if (taskBaseBranch) {
          args.push('--base-branch', taskBaseBranch);
          debug('Using stored base branch:', taskBaseBranch);
        }

        const pythonPath = pythonEnvManager.getPythonPath() || findPythonCommand() || 'python';
        debug('Running command:', pythonPath, args.join(' '));
        debug('Working directory:', sourcePath);

        // Get profile environment with OAuth token for AI merge resolution
        const profileEnv = getProfileEnv();
        debug('Profile env for merge:', {
          hasOAuthToken: !!profileEnv.CLAUDE_CODE_OAUTH_TOKEN,
          hasConfigDir: !!profileEnv.CLAUDE_CONFIG_DIR
        });

        return new Promise((resolve) => {
          const MERGE_TIMEOUT_MS = 600000; // 10 minutes timeout for AI merge operations with many files
          let timeoutId: NodeJS.Timeout | null = null;
          let resolved = false;

          // Parse Python command to handle space-separated commands like "py -3"
          const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
          const mergeProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
            cwd: sourcePath,
            env: {
              ...process.env,
              ...profileEnv, // Include active Claude profile OAuth token
              PYTHONUNBUFFERED: '1',
              PYTHONIOENCODING: 'utf-8',
              PYTHONUTF8: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe'] // Don't connect stdin to avoid blocking
          });

          let stdout = '';
          let stderr = '';

          // Set up timeout to kill hung processes
          timeoutId = setTimeout(() => {
            if (!resolved) {
              debug('TIMEOUT: Merge process exceeded', MERGE_TIMEOUT_MS, 'ms, killing...');
              resolved = true;
              mergeProcess.kill('SIGTERM');
              setTimeout(() => {
                if (!resolved) {
                  debug('FORCE KILL: Process still running, sending SIGKILL...');
                  mergeProcess.kill('SIGKILL');
                }
              }, 5000);
            }
          }, MERGE_TIMEOUT_MS);

          mergeProcess.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString('utf-8');
            stdout += chunk;
            debug('STDOUT:', chunk);
          });

          mergeProcess.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString('utf-8');
            stderr += chunk;
            debug('STDERR:', chunk);
          });

          mergeProcess.on('close', (code: number) => {
            if (resolved) return; // Already timed out
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            debug('Merge process exited with code:', code);
            debug('FINAL STDOUT:', stdout);
            debug('FINAL STDERR:', stderr);

            if (code === 0) {
              // Parse success output
              try {
                const output = stdout.trim();
                debug('Parsing output:', output);

                // Try to find JSON in output
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const result = JSON.parse(jsonMatch[0]);
                  debug('Parsed merge result:', result);
                  return resolve({
                    success: true,
                    data: {
                      success: true,
                      merged: true,
                      message: result.message || 'Merge completed successfully',
                      projectPath: project.path,
                      ...result
                    }
                  });
                }

                // Fallback if no JSON found
                resolve({
                  success: true,
                  data: {
                    success: true,
                    merged: true,
                    message: 'Merge completed successfully',
                    projectPath: project.path
                  }
                });
              } catch (parseError) {
                debug('Error parsing merge output:', parseError);
                resolve({
                  success: true,
                  data: {
                    success: true,
                    merged: true,
                    message: 'Merge completed successfully',
                    projectPath: project.path
                  }
                });
              }
            } else {
              // Merge failed
              const errorMessage = stderr || stdout || `Merge failed with exit code ${code}`;
              debug('Merge error:', errorMessage);

              resolve({
                success: false,
                error: errorMessage,
                data: {
                  success: false,
                  merged: false,
                  message: `Merge failed: ${errorMessage}`,
                  projectPath: project.path
                }
              });
            }
          });

          mergeProcess.on('error', (error: Error) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            debug('Process error:', error);
            resolve({
              success: false,
              error: error.message,
              data: {
                success: false,
                merged: false,
                message: `Failed to execute merge: ${error.message}`,
                projectPath: project.path
              }
            });
          });
        });
      } catch (error) {
        console.error('Failed to merge worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge worktree'
        };
      }
    }
  );

  /**
   * Discard all changes from a task's worktree
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DISCARD,
    async (_, taskId: string): Promise<IPCResult<WorktreeDiscardResult>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs', task.specId);
        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Call run.py --discard to handle cleanup
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return { success: false, error: 'Turret source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--discard'
        ];

        // Add --base-branch if task was created with a specific base branch
        const taskBaseBranch = getTaskBaseBranch(specDir);
        if (taskBaseBranch) {
          args.push('--base-branch', taskBaseBranch);
        }

        const pythonPath = pythonEnvManager.getPythonPath() || findPythonCommand() || 'python';

        return new Promise((resolve) => {
          const DISCARD_TIMEOUT_MS = 120000; // 2 minutes timeout for discard operations
          let timeoutId: NodeJS.Timeout | null = null;
          let resolved = false;

          const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
          const discardProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
            cwd: sourcePath,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1',
              PYTHONIOENCODING: 'utf-8',
              PYTHONUTF8: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              discardProcess.kill('SIGTERM');
              setTimeout(() => {
                if (!resolved) {
                  discardProcess.kill('SIGKILL');
                }
              }, 5000);
            }
          }, DISCARD_TIMEOUT_MS);

          discardProcess.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
          });

          discardProcess.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
          });

          discardProcess.on('close', (code: number) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            if (code === 0) {
              resolve({
                success: true,
                data: {
                  success: true,
                  discarded: true,
                  message: 'Changes discarded successfully',
                  projectPath: project.path
                }
              });
            } else {
              const errorMessage = stderr || stdout || `Discard failed with exit code ${code}`;
              resolve({
                success: false,
                error: errorMessage,
                data: {
                  success: false,
                  discarded: false,
                  message: `Discard failed: ${errorMessage}`,
                  projectPath: project.path
                }
              });
            }
          });

          discardProcess.on('error', (error: Error) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            resolve({
              success: false,
              error: error.message,
              data: {
                success: false,
                discarded: false,
                message: `Failed to execute discard: ${error.message}`,
                projectPath: project.path
              }
            });
          });
        });
      } catch (error) {
        console.error('Failed to discard worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discard worktree'
        };
      }
    }
  );

  /**
   * Discard individual file from a task's worktree
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DISCARD_FILE,
    async (_, taskId: string, filePath: string): Promise<IPCResult<WorktreeFileDiscardResult>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs', task.specId);
        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Get the worktree path
        const worktreePath = path.join(project.path, '.worktrees', task.specId);
        if (!existsSync(worktreePath)) {
          return { success: false, error: 'Worktree not found for this task' };
        }

        // Get base branch
        let baseBranch = 'main';
        try {
          baseBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: project.path,
            encoding: 'utf-8'
          }).trim();
        } catch {
          baseBranch = 'main';
        }

        // Use git checkout to discard the file from the base branch
        try {
          execSync(`git checkout ${baseBranch} -- "${filePath}"`, {
            cwd: worktreePath,
            encoding: 'utf-8'
          });

          return {
            success: true,
            data: {
              success: true,
              discarded: true,
              file: filePath,
              message: `File ${filePath} discarded successfully`,
              projectPath: project.path
            }
          };
        } catch (gitError) {
          console.error('Failed to discard file:', gitError);
          return {
            success: false,
            error: `Failed to discard file: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`,
            data: {
              success: false,
              discarded: false,
              file: filePath,
              message: `Failed to discard file ${filePath}`,
              projectPath: project.path
            }
          };
        }
      } catch (error) {
        console.error('Failed to discard file from worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discard file from worktree',
          data: {
            success: false,
            discarded: false,
            message: 'Failed to discard file from worktree',
            projectPath: project.path
          }
        };
      }
    }
  );

  /**
   * List tasks with worktrees
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST_WORKTREES,
    async (): Promise<IPCResult<WorktreeListResult>> => {
      try {
        const items: WorktreeListItem[] = [];

        for (const project of projectStore.projects) {
          const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs');
          if (!existsSync(specDir)) continue;

          try {
            const specDirs = readdirSync(specDir);
            for (const specId of specDirs) {
              const specPath = path.join(specDir, specId);
              const stat = statSync(specPath);
              if (!stat.isDirectory()) continue;

              // Look for associated task
              const task = project.tasks?.find((t) => t.specId === specId);
              if (!task) continue;

              // Check if worktree exists
              const worktreePath = path.join(project.path, '.worktrees', specId);
              if (existsSync(worktreePath)) {
                try {
                  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
                    cwd: worktreePath,
                    encoding: 'utf-8'
                  }).trim();

                  // Get base branch from main project
                  let baseBranch = 'main';
                  try {
                    baseBranch = execSync('git rev-parse --abbrev-ref HEAD', {
                      cwd: project.path,
                      encoding: 'utf-8'
                    }).trim();
                  } catch {
                    baseBranch = 'main';
                  }

                  // Get commit count
                  let commitCount = 0;
                  try {
                    const countOutput = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
                      cwd: worktreePath,
                      encoding: 'utf-8',
                      stdio: ['pipe', 'pipe', 'pipe']
                    }).trim();
                    commitCount = parseInt(countOutput, 10) || 0;
                  } catch {
                    commitCount = 0;
                  }

                  items.push({
                    taskId: task.id,
                    specId,
                    projectId: project.id,
                    branch,
                    baseBranch,
                    commitCount
                  });
                } catch (gitError) {
                  console.error(`Failed to get worktree info for ${specId}:`, gitError);
                }
              }
            }
          } catch (readError) {
            console.error('Failed to list worktrees for project:', readError);
          }
        }

        return {
          success: true,
          data: { items }
        };
      } catch (error) {
        console.error('Failed to list worktrees:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list worktrees'
        };
      }
    }
  );
}