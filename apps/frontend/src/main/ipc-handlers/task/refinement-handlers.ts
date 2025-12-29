import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import type { IPCResult } from '../../../shared/types';
import { parsePythonCommand } from '../../python-detector';
import { getProfileEnv } from '../../rate-limit-detector';
import { pythonEnvManager } from '../../python-env-manager';

/**
 * Task refinement result returned by the AI service
 */
export interface TaskRefinementResult {
  title: string;
  description: string;
  category: string;
  priority: string;
  complexity: string;
  impact: string;
}

/**
 * IPC channel for task refinement
 * Note: This should match IPC_CHANNELS.TASK_REFINE once subtask-1-3 adds it
 */
const TASK_REFINE_CHANNEL = 'task:refine';

/**
 * Debug logging - only logs when DEBUG=true or in development mode
 */
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.warn('[TaskRefinement]', ...args);
  }
}

/**
 * Get the turret source path (detects automatically)
 */
function getAutoBuildSourcePath(): string | null {
  const possiblePaths = [
    // Apps structure: from out/main -> apps/backend
    path.resolve(__dirname, '..', '..', '..', 'backend'),
    path.resolve(app.getAppPath(), '..', 'backend'),
    path.resolve(process.cwd(), 'apps', 'backend')
  ];

  for (const p of possiblePaths) {
    if (existsSync(p) && existsSync(path.join(p, 'ideation', 'task_refinement.py'))) {
      return p;
    }
  }
  return null;
}

/**
 * Load environment variables from turret .env file
 */
function loadAutoBuildEnv(): Record<string, string> {
  const autoBuildSource = getAutoBuildSourcePath();
  if (!autoBuildSource) return {};

  const envPath = path.join(autoBuildSource, '.env');
  if (!existsSync(envPath)) return {};

  try {
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};

    // Handle both Unix (\n) and Windows (\r\n) line endings
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        envVars[key] = value;
      }
    }

    return envVars;
  } catch {
    return {};
  }
}

/**
 * Create the Python script to call task_refinement.refine_task_with_ai
 */
function createRefinementScript(briefDescription: string): string {
  // Escape the description for Python string - use JSON.stringify for safe escaping
  const escapedDescription = JSON.stringify(briefDescription);

  return `
import sys
import json

try:
    from ideation.task_refinement import refine_task_with_ai

    brief_description = ${escapedDescription}
    result = refine_task_with_ai(brief_description)

    # Output as JSON
    print(json.dumps(result))
    sys.exit(0)

except ValueError as e:
    # Validation errors (empty input, missing fields)
    print(json.dumps({"error": str(e), "type": "validation"}), file=sys.stderr)
    sys.exit(1)

except RuntimeError as e:
    # Runtime errors (SDK unavailable, auth failure, API error)
    print(json.dumps({"error": str(e), "type": "runtime"}), file=sys.stderr)
    sys.exit(1)

except Exception as e:
    # Unexpected errors
    print(json.dumps({"error": str(e), "type": "unknown"}), file=sys.stderr)
    sys.exit(1)
`;
}

/**
 * Register task refinement IPC handlers
 */
export function registerTaskRefinementHandlers(): void {
  /**
   * Refine a brief task description into a complete task using AI
   */
  ipcMain.handle(
    TASK_REFINE_CHANNEL,
    async (_, briefDescription: string): Promise<IPCResult<TaskRefinementResult>> => {
      debug('Task refinement requested for:', briefDescription.substring(0, 50) + '...');

      // Validate input
      if (!briefDescription || !briefDescription.trim()) {
        return {
          success: false,
          error: 'Brief description cannot be empty'
        };
      }

      const autoBuildSource = getAutoBuildSourcePath();
      if (!autoBuildSource) {
        console.error('[TaskRefinement] Turret source path not found');
        return {
          success: false,
          error: 'AI refinement service not available'
        };
      }

      // Check if Python environment is ready (has claude_agent_sdk installed)
      if (!pythonEnvManager.isEnvReady()) {
        debug('Python environment not ready, initializing...');
        const status = await pythonEnvManager.initialize(autoBuildSource);
        if (!status.ready) {
          console.error('[TaskRefinement] Python environment initialization failed:', status.error);
          return {
            success: false,
            error: `Python environment initialization failed: ${status.error}`
          };
        }
      }

      // Get the venv Python path (where claude_agent_sdk is installed)
      const venvPythonPath = pythonEnvManager.getPythonPath();
      if (!venvPythonPath) {
        console.error('[TaskRefinement] Venv Python path not available');
        return {
          success: false,
          error: 'Python environment not ready'
        };
      }

      const script = createRefinementScript(briefDescription.trim());
      const autoBuildEnv = loadAutoBuildEnv();
      const profileEnv = getProfileEnv();

      debug('Environment loaded', {
        hasOAuthToken: !!autoBuildEnv.CLAUDE_CODE_OAUTH_TOKEN || !!profileEnv.CLAUDE_CODE_OAUTH_TOKEN,
        autoBuildSource
      });

      return new Promise((resolve) => {
        // Use the venv Python where claude_agent_sdk is installed
        const [pythonCommand, pythonBaseArgs] = parsePythonCommand(venvPythonPath);
        const childProcess = spawn(pythonCommand, [...pythonBaseArgs, '-c', script], {
          cwd: autoBuildSource,
          env: {
            ...process.env,
            ...autoBuildEnv,
            ...profileEnv, // Include active Claude profile config
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
          }
        });

        let stdout = '';
        let stderr = '';

        // 60 second timeout for SDK initialization + API call
        const timeout = setTimeout(() => {
          console.warn('[TaskRefinement] Task refinement timed out after 60s');
          childProcess.kill();
          resolve({
            success: false,
            error: 'Task refinement timed out. Please try again.'
          });
        }, 60000);

        childProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        childProcess.on('exit', (code: number | null) => {
          clearTimeout(timeout);

          if (code === 0 && stdout.trim()) {
            try {
              const result = JSON.parse(stdout.trim()) as TaskRefinementResult;
              debug('Task refinement succeeded:', result.title);
              resolve({
                success: true,
                data: result
              });
            } catch (parseError) {
              console.error('[TaskRefinement] Failed to parse result:', parseError);
              console.error('[TaskRefinement] stdout:', stdout);
              resolve({
                success: false,
                error: 'Failed to parse AI response'
              });
            }
          } else {
            // Try to parse error from stderr
            let errorMessage = 'Task refinement failed';
            try {
              if (stderr.trim()) {
                const errorData = JSON.parse(stderr.trim());
                errorMessage = errorData.error || errorMessage;
              }
            } catch {
              // If we can't parse, use the raw stderr or a generic message
              if (stderr.trim()) {
                errorMessage = stderr.trim().substring(0, 200);
              }
            }

            console.warn('[TaskRefinement] Task refinement failed', {
              code,
              stderr: stderr.substring(0, 500),
              stdout: stdout.substring(0, 200)
            });

            resolve({
              success: false,
              error: errorMessage
            });
          }
        });

        childProcess.on('error', (err) => {
          clearTimeout(timeout);
          console.error('[TaskRefinement] Process error:', err.message);
          resolve({
            success: false,
            error: `Failed to run refinement: ${err.message}`
          });
        });
      });
    }
  );
}
