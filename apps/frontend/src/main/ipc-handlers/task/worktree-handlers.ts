import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS } from '../../../shared/constants';
import type { IPCResult, WorktreeStatus, WorktreeDiff, WorktreeDiffFile, WorktreeMergeResult, WorktreeDiscardResult, WorktreeDiscardFileResult, WorktreeListResult, WorktreeListItem } from '../../../shared/types';
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
   * Preview merge conflicts before merging
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_MERGE_PREVIEW,
    async (_, taskId: string): Promise<IPCResult<WorktreeMergeResult>> => {
      console.warn('[IPC] TASK_WORKTREE_MERGE_PREVIEW called with taskId:', taskId);
      try {
        // Ensure Python environment is ready
        if (!pythonEnvManager.isEnvReady()) {
          console.warn('[IPC] Python environment not ready, initializing...');
          const autoBuildSource = getEffectiveSourcePath();
          if (autoBuildSource) {
            const status = await pythonEnvManager.initialize(autoBuildSource);
            if (!status.ready) {
              console.error('[IPC] Python environment failed to initialize:', status.error);
              return { success: false, error: `Python environment not ready: ${status.error || 'Unknown error'}` };
            }
          } else {
            console.error('[IPC] Turret source not found');
            return { success: false, error: 'Python environment not ready and Turret source not found' };
          }
        }

        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          console.error('[IPC] Task not found:', taskId);
          return { success: false, error: 'Task not found' };
        }
        console.warn('[IPC] Found task:', task.specId, 'project:', project.name);

        // Check for uncommitted changes in the main project
        let hasUncommittedChanges = false;
        let uncommittedFiles: string[] = [];
        try {
          const gitStatus = execSync('git status --porcelain', {
            cwd: project.path,
            encoding: 'utf-8'
          });

          if (gitStatus && gitStatus.trim()) {
            // Parse the status output to get file names
            // Format: XY filename (where X and Y are status chars, then space, then filename)
            uncommittedFiles = gitStatus
              .split('\n')
              .filter(line => line.trim())
              .map(line => line.substring(3).trim()); // Skip 2 status chars + 1 space, trim any trailing whitespace

            hasUncommittedChanges = uncommittedFiles.length > 0;
          }
        } catch (e) {
          console.error('[IPC] Failed to check git status:', e);
        }

        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          console.error('[IPC] Turret source not found');
          return { success: false, error: 'Turret source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs', task.specId);
        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--merge-preview'
        ];

        // Add --base-branch if task was created with a specific base branch
        const taskBaseBranch = getTaskBaseBranch(specDir);
        if (taskBaseBranch) {
          args.push('--base-branch', taskBaseBranch);
          console.warn('[IPC] Using stored base branch for preview:', taskBaseBranch);
        }

        const pythonPath = pythonEnvManager.getPythonPath() || findPythonCommand() || 'python';
        console.warn('[IPC] Running merge preview:', pythonPath, args.join(' '));

        // Get profile environment for consistency
        const previewProfileEnv = getProfileEnv();

        return new Promise((resolve) => {
          // Parse Python command to handle space-separated commands like "py -3"
          const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
          const previewProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
            cwd: sourcePath,
            env: { ...process.env, ...previewProfileEnv, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', DEBUG: 'true' }
          });

          let stdout = '';
          let stderr = '';

          previewProcess.stdout.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            console.warn('[IPC] merge-preview stdout:', chunk);
          });

          previewProcess.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            console.warn('[IPC] merge-preview stderr:', chunk);
          });

          previewProcess.on('close', (code: number) => {
            console.warn('[IPC] merge-preview process exited with code:', code);
            if (code === 0) {
              try {
                // Parse JSON output from Python
                const result = JSON.parse(stdout.trim());
                console.warn('[IPC] merge-preview result:', JSON.stringify(result, null, 2));
                resolve({
                  success: true,
                  data: {
                    success: result.success,
                    message: result.error || 'Preview completed',
                    preview: {
                      files: result.files || [],
                      conflicts: result.conflicts || [],
                      summary: result.summary || {
                        totalFiles: 0,
                        conflictFiles: 0,
                        totalConflicts: 0,
                        autoMergeable: 0,
                        hasGitConflicts: false
                      },
                      gitConflicts: result.gitConflicts || null,
                      // Include uncommitted changes info for the frontend
                      uncommittedChanges: hasUncommittedChanges ? {
                        hasChanges: true,
                        files: uncommittedFiles,
                        count: uncommittedFiles.length
                      } : null
                    }
                  }
                });
              } catch (parseError) {
                console.error('[IPC] Failed to parse preview result:', parseError);
                console.error('[IPC] stdout:', stdout);
                console.error('[IPC] stderr:', stderr);
                resolve({
                  success: false,
                  error: `Failed to parse preview result: ${stderr || stdout}`
                });
              }
            } else {
              console.error('[IPC] Preview failed with exit code:', code);
              console.error('[IPC] stderr:', stderr);
              console.error('[IPC] stdout:', stdout);
              resolve({
                success: false,
                error: `Preview failed: ${stderr || stdout}`
              });
            }
          });

          previewProcess.on('error', (err: Error) => {
            console.error('[IPC] merge-preview spawn error:', err);
            resolve({
              success: false,
              error: `Failed to run preview: ${err.message}`
            });
          });
        });
      } catch (error) {
        console.error('[IPC] TASK_WORKTREE_MERGE_PREVIEW error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to preview merge'
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
                if (!mergeProcess.killed) {
                  debug('FORCE KILL: Process still running, sending SIGKILL...');
                  mergeProcess.kill('SIGKILL');
                }
              }, 5000);
              resolve({
                success: false,
                error: 'Merge operation timed out after 10 minutes',
                data: {
                  success: false,
                  merged: false,
                  message: 'Merge operation timed out',
                  projectPath: project.path
                }
              });
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

          // Consolidated exit handler
          const handleProcessExit = (code: number) => {
            if (resolved) return; // Already timed out
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            debug('Merge process exited with code:', code);
            debug('FINAL STDOUT:', stdout);
            debug('FINAL STDERR:', stderr);

            // Determine merge result
            let newStatus: string | undefined;
            let planStatus: string | undefined;
            let message = '';
            let staged = false;

            if (code === 0) {
              // Verify git status after merge
              try {
                const gitStatusAfter = execSync('git status --short', { cwd: project.path, encoding: 'utf-8' });
                debug('Git status AFTER merge:\n', gitStatusAfter || '(clean)');

                // For stage-only mode, verify changes were actually staged
                if (options?.noCommit) {
                  const stagedResult = spawnSync('git', ['diff', '--staged', '--name-only'], {
                    cwd: project.path,
                    encoding: 'utf-8'
                  });

                  if (stagedResult.status === 0 && stagedResult.stdout?.trim()) {
                    const stagedFiles = stagedResult.stdout.trim().split('\n');
                    debug('Verified staged files:', stagedFiles);
                    staged = true;
                    newStatus = 'human_review';
                    planStatus = 'review';
                    message = `Changes staged successfully (${stagedFiles.length} files). Review with git diff --staged.`;
                  } else {
                    // Merge reported success but nothing staged - might be already committed or no changes
                    const commitCheckResult = spawnSync('git', ['log', '-1', '--oneline'], {
                      cwd: project.path,
                      encoding: 'utf-8'
                    });

                    if (commitCheckResult.stdout?.includes(task.specId) ||
                      commitCheckResult.stdout?.toLowerCase().includes('merge')) {
                      // Looks like merge was already committed
                      debug('Merge appears to be already committed');
                      newStatus = 'done';
                      planStatus = 'completed';
                      message = 'Merge already committed';
                    } else {
                      debug('Warning: Merge succeeded but no changes staged');
                      message = 'Merge completed but no changes detected';
                    }
                  }
                } else {
                  // Regular merge with commit
                  newStatus = 'done';
                  planStatus = 'completed';
                  message = 'Merge completed successfully';
                }
              } catch (statusError) {
                debug('Failed to get git status after merge:', statusError);
              }

              // Try to parse JSON output for additional info
              try {
                const output = stdout.trim();
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const result = JSON.parse(jsonMatch[0]);
                  debug('Parsed merge result:', result);

                  // Override message if provided in result
                  if (result.message) {
                    message = result.message;
                  }

                  // Read suggested commit message if available
                  let suggestedCommitMessage: string | undefined;
                  const commitMsgPath = path.join(specDir, 'suggested_commit_message.txt');
                  if (existsSync(commitMsgPath)) {
                    try {
                      suggestedCommitMessage = readFileSync(commitMsgPath, 'utf-8');
                      debug('Read suggested commit message:', suggestedCommitMessage);
                    } catch (e) {
                      debug('Failed to read suggested commit message:', e);
                    }
                  }

                  // Update implementation_plan.json with status
                  if (newStatus && planStatus) {
                    const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
                    try {
                      if (existsSync(planPath)) {
                        const planContent = readFileSync(planPath, 'utf-8');
                        const plan = JSON.parse(planContent);

                        plan.status = newStatus;
                        plan.planStatus = planStatus;
                        plan.updated_at = new Date().toISOString();

                        const { writeFileSync } = require('fs');
                        writeFileSync(planPath, JSON.stringify(plan, null, 2));
                        debug('Updated implementation_plan.json with status:', newStatus);

                        // Notify UI of status change
                        const mainWindow = getMainWindow();
                        if (mainWindow) {
                          mainWindow.webContents.send(
                            IPC_CHANNELS.TASK_STATUS_CHANGE,
                            taskId,
                            newStatus
                          );
                          debug('Sent status change event to UI:', newStatus);
                        }
                      }
                    } catch (planError) {
                      debug('Failed to update implementation plan:', planError);
                    }
                  }

                  return resolve({
                    success: true,
                    data: {
                      success: true,
                      merged: true,
                      message,
                      staged,
                      projectPath: project.path,
                      suggestedCommitMessage,
                      ...result
                    }
                  });
                }
              } catch (parseError) {
                debug('Error parsing merge output:', parseError);
              }

              // Fallback response if no JSON
              resolve({
                success: true,
                data: {
                  success: true,
                  merged: !options?.noCommit,
                  message: message || 'Merge completed successfully',
                  staged,
                  projectPath: project.path
                }
              });
            } else {
              // Merge failed - check for conflicts vs general failure
              const errorMessage = stderr || stdout || `Merge failed with exit code ${code}`;
              const hasConflicts = errorMessage.toLowerCase().includes('conflict');

              debug('Merge error:', errorMessage);
              debug('Has conflicts:', hasConflicts);

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
          };

          mergeProcess.on('close', handleProcessExit);

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

        // Add --force to skip confirmation prompt (IPC calls are non-interactive)
        args.push('--force');

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
                  message: 'Changes discarded successfully'
                }
              });
            } else {
              const errorMessage = stderr || stdout || `Discard failed with exit code ${code}`;
              resolve({
                success: false,
                error: errorMessage,
                data: {
                  success: false,
                  message: `Discard failed: ${errorMessage}`
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
                message: `Failed to execute discard: ${error.message}`
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
    async (_, taskId: string, filePath: string): Promise<IPCResult<WorktreeDiscardFileResult>> => {
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
              message: `File ${filePath} discarded successfully`,
              filePath
            }
          };
        } catch (gitError) {
          console.error('Failed to discard file:', gitError);
          return {
            success: false,
            error: `Failed to discard file: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`,
            data: {
              success: false,
              message: `Failed to discard file ${filePath}`,
              error: gitError instanceof Error ? gitError.message : 'Unknown error',
              filePath
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
            message: 'Failed to discard file from worktree',
            error: error instanceof Error ? error.message : 'Failed to discard file from worktree',
            filePath
          }
        };
      }
    }
  );

  /**
   * Get the diff content for a specific conflict file
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_CONFLICT_DIFF,
    async (_, taskId: string, filePath: string): Promise<IPCResult<string>> => {
      try {
        const { project, task } = findTaskAndProject(taskId);
        if (!project || !task) {
          return { success: false, error: 'Task not found' };
        }

        // Spec directory is stored under the project's autoBuildPath (.turret by default)
        const specDir = path.join(project.path, project.autoBuildPath || '.turret', 'specs', task.specId);

        // Determine base branch:
        // 1) task_metadata.json (most accurate)
        // 2) project.settings.mainBranch (project-configured)
        // 3) origin/HEAD (git-configured default)
        // 4) 'main' (last resort)
        let baseBranch =
          getTaskBaseBranch(specDir) ||
          project.settings?.mainBranch ||
          project.settings?.mainBranch; // (kept explicit for safety; settings is always present on Project)

        if (!baseBranch) {
          try {
            const originHead = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', {
              cwd: project.path,
              encoding: 'utf8',
            }).trim(); // e.g. "origin/development_acc_3"
            baseBranch = originHead.startsWith('origin/') ? originHead.slice('origin/'.length) : originHead;
          } catch {
            baseBranch = 'main';
          }
        }
        const worktreePath = path.join(project.path, '.worktrees', taskId);

        if (!existsSync(worktreePath)) {
          return { success: false, error: 'Worktree not found' };
        }

        // Get file contents from base branch and worktree for side-by-side diff
        let oldContent = '';
        let newContent = '';

        // Get base branch version
        try {
          oldContent = execSync(
            `git show "${baseBranch}:${filePath}"`,
            {
              cwd: worktreePath,
              encoding: 'utf8',
              maxBuffer: 10 * 1024 * 1024
            }
          );
        } catch {
          // File doesn't exist in base branch (new file)
          oldContent = '';
        }

        // Get worktree version
        const worktreeFilePath = path.join(worktreePath, filePath);
        try {
          if (existsSync(worktreeFilePath)) {
            newContent = readFileSync(worktreeFilePath, 'utf8');
          }
        } catch {
          // File doesn't exist in worktree (deleted file)
          newContent = '';
        }

        return {
          success: true,
          data: JSON.stringify({ oldContent, newContent })
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get conflict diff'
        };
      }
    }
  );

  /**
   * List all worktrees for a project
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST_WORKTREES,
    async (_, projectId: string): Promise<IPCResult<WorktreeListResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const worktreesDir = path.join(project.path, '.worktrees');
        const worktrees: WorktreeListItem[] = [];

        if (!existsSync(worktreesDir)) {
          return { success: true, data: { worktrees } };
        }

        // Get all directories in .worktrees
        const entries = readdirSync(worktreesDir);
        for (const entry of entries) {
          const entryPath = path.join(worktreesDir, entry);
          const stat = statSync(entryPath);

          // Skip worker directories and non-directories
          if (!stat.isDirectory() || entry.startsWith('worker-')) {
            continue;
          }

          try {
            // Get branch info
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd: entryPath,
              encoding: 'utf-8'
            }).trim();

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

            // Get commit count (cross-platform - no shell syntax)
            let commitCount = 0;
            try {
              const countOutput = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
                cwd: entryPath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
              }).trim();
              commitCount = parseInt(countOutput, 10) || 0;
            } catch {
              commitCount = 0;
            }

            // Get diff stats (cross-platform - no shell syntax)
            let filesChanged = 0;
            let additions = 0;
            let deletions = 0;
            let diffStat = '';

            try {
              diffStat = execSync(`git diff --shortstat ${baseBranch}...HEAD`, {
                cwd: entryPath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
              }).trim();

              const filesMatch = diffStat.match(/(\d+) files? changed/);
              const addMatch = diffStat.match(/(\d+) insertions?/);
              const delMatch = diffStat.match(/(\d+) deletions?/);

              if (filesMatch) filesChanged = parseInt(filesMatch[1], 10) || 0;
              if (addMatch) additions = parseInt(addMatch[1], 10) || 0;
              if (delMatch) deletions = parseInt(delMatch[1], 10) || 0;
            } catch {
              // Ignore diff errors
            }

            worktrees.push({
              specName: entry,
              path: entryPath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            });
          } catch (gitError) {
            console.error(`Error getting info for worktree ${entry}:`, gitError);
            // Skip this worktree if we can't get git info
          }
        }

        return { success: true, data: { worktrees } };
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