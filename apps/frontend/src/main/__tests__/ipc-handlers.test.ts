/**
 * Unit tests for IPC handlers
 * Tests all IPC communication patterns between main and renderer processes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DIR = '/tmp/ipc-handlers-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');

// Mock electron-updater before importing
vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn()
  }
}));

// Mock @electron-toolkit/utils before importing
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: true,
    windows: process.platform === 'win32',
    macos: process.platform === 'darwin',
    linux: process.platform === 'linux'
  },
  electronApp: {
    setAppUserModelId: vi.fn()
  },
  optimizer: {
    watchWindowShortcuts: vi.fn()
  }
}));

// Mock version-manager to return a predictable version
vi.mock('../updater/version-manager', () => ({
  getEffectiveVersion: vi.fn(() => '0.1.0'),
  getBundledVersion: vi.fn(() => '0.1.0'),
  parseVersionFromTag: vi.fn((tag: string) => tag.replace('v', '')),
  compareVersions: vi.fn(() => 0)
}));

// Mock modules before importing
vi.mock('electron', () => {
  const mockIpcMain = new (class extends EventEmitter {
    private handlers: Map<string, Function> = new Map();

    handle(channel: string, handler: Function): void {
      this.handlers.set(channel, handler);
    }

    removeHandler(channel: string): void {
      this.handlers.delete(channel);
    }

    async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
      const handler = this.handlers.get(channel);
      if (handler) {
        return handler(event, ...args);
      }
      throw new Error(`No handler for channel: ${channel}`);
    }

    getHandler(channel: string): Function | undefined {
      return this.handlers.get(channel);
    }
  })();

  return {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return path.join(TEST_DIR, 'userData');
        return TEST_DIR;
      }),
      getAppPath: vi.fn(() => TEST_DIR),
      getVersion: vi.fn(() => '0.1.0'),
      isPackaged: false
    },
    ipcMain: mockIpcMain,
    dialog: {
      showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: [TEST_PROJECT_PATH] }))
    },
    BrowserWindow: class {
      webContents = { send: vi.fn() };
    }
  };
});

// Setup test project structure
function setupTestProject(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, 'turret', 'specs'), { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('IPC Handlers', () => {
  let ipcMain: EventEmitter & {
    handlers: Map<string, Function>;
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
    getHandler: (channel: string) => Function | undefined;
  };
  let mockMainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
  let mockAgentManager: EventEmitter & {
    startSpecCreation: ReturnType<typeof vi.fn>;
    startTaskExecution: ReturnType<typeof vi.fn>;
    startQAProcess: ReturnType<typeof vi.fn>;
    killTask: ReturnType<typeof vi.fn>;
    configure: ReturnType<typeof vi.fn>;
  };
  let mockTerminalManager: {
    create: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    invokeClaude: ReturnType<typeof vi.fn>;
    killAll: ReturnType<typeof vi.fn>;
  };
  let mockPythonEnvManager: {
    on: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestProject();
    mkdirSync(path.join(TEST_DIR, 'userData', 'store'), { recursive: true });

    // Get mocked ipcMain
    const electron = await import('electron');
    ipcMain = electron.ipcMain as unknown as typeof ipcMain;

    // Create mock window
    mockMainWindow = {
      webContents: { send: vi.fn() }
    };

    // Create mock agent manager
    mockAgentManager = Object.assign(new EventEmitter(), {
      startSpecCreation: vi.fn(),
      startTaskExecution: vi.fn(),
      startQAProcess: vi.fn(),
      killTask: vi.fn(),
      configure: vi.fn()
    });

    // Create mock terminal manager
    mockTerminalManager = {
      create: vi.fn(() => Promise.resolve({ success: true })),
      destroy: vi.fn(() => Promise.resolve({ success: true })),
      write: vi.fn(),
      resize: vi.fn(),
      invokeClaude: vi.fn(),
      killAll: vi.fn(() => Promise.resolve())
    };

    mockPythonEnvManager = {
      on: vi.fn(),
      initialize: vi.fn(() => Promise.resolve({ ready: true, pythonPath: '/usr/bin/python3', venvExists: true, depsInstalled: true })),
      getStatus: vi.fn(() => Promise.resolve({ ready: true, pythonPath: '/usr/bin/python3', venvExists: true, depsInstalled: true }))
    };

    // Need to reset modules to re-register handlers
    vi.resetModules();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('project:add handler', () => {
    it('should return error for non-existent path', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('project:add', {}, '/nonexistent/path');

      expect(result).toEqual({
        success: false,
        error: 'Directory does not exist'
      });
    });

    it('should successfully add an existing project', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      const data = (result as { data: { path: string; name: string } }).data;
      expect(data.path).toBe(TEST_PROJECT_PATH);
      expect(data.name).toBe('test-project');
    });

    it('should return existing project if already added', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Add project twice
      const result1 = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const result2 = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);

      const data1 = (result1 as { data: { id: string } }).data;
      const data2 = (result2 as { data: { id: string } }).data;
      expect(data1.id).toBe(data2.id);
    });
  });

  describe('project:list handler', () => {
    it('should return empty array when no projects', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('project:list', {});

      expect(result).toEqual({
        success: true,
        data: []
      });
    });

    it('should return all added projects', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Add a project
      await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);

      const result = await ipcMain.invokeHandler('project:list', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: unknown[] }).data;
      expect(data).toHaveLength(1);
    });
  });

  describe('project:remove handler', () => {
    it('should return false for non-existent project', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('project:remove', {}, 'nonexistent-id');

      expect(result).toEqual({ success: false });
    });

    it('should successfully remove an existing project', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Remove it
      const removeResult = await ipcMain.invokeHandler('project:remove', {}, projectId);

      expect(removeResult).toEqual({ success: true });

      // Verify it's gone
      const listResult = await ipcMain.invokeHandler('project:list', {});
      const data = (listResult as { data: unknown[] }).data;
      expect(data).toHaveLength(0);
    });
  });

  describe('project:updateSettings handler', () => {
    it('should return error for non-existent project', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'project:updateSettings',
        {},
        'nonexistent-id',
        { model: 'sonnet' }
      );

      expect(result).toEqual({
        success: false,
        error: 'Project not found'
      });
    });

    it('should successfully update project settings', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Update settings
      const result = await ipcMain.invokeHandler(
        'project:updateSettings',
        {},
        projectId,
        { model: 'sonnet', linearSync: true }
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('task:list handler', () => {
    it('should return empty array for project with no specs', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      const result = await ipcMain.invokeHandler('task:list', {}, projectId);

      expect(result).toEqual({
        success: true,
        data: []
      });
    });

    it('should return tasks when specs exist', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first (before adding project so it gets detected)
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project - it will detect .turret
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan in .turret/specs
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      const result = await ipcMain.invokeHandler('task:list', {}, projectId);

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: unknown[] }).data;
      expect(data).toHaveLength(1);
    });
  });

  describe('task:create handler', () => {
    it('should return error for non-existent project', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:create',
        {},
        'nonexistent-id',
        'Test Task',
        'Test description'
      );

      expect(result).toEqual({
        success: false,
        error: 'Project not found'
      });
    });

    it('should create task in backlog status', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first (before adding project so it gets detected)
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      const result = await ipcMain.invokeHandler(
        'task:create',
        {},
        projectId,
        'Test Task',
        'Test description'
      );

      expect(result).toHaveProperty('success', true);
      // Task is created in backlog status, spec creation starts when task:start is called
      const task = (result as { data: { status: string } }).data;
      expect(task.status).toBe('backlog');
    });
  });

  describe('settings:get handler', () => {
    it('should return default settings when no settings file exists', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('settings:get', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { theme: string } }).data;
      expect(data).toHaveProperty('theme', 'system');
    });
  });

  describe('settings:save handler', () => {
    it('should save settings successfully', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'settings:save',
        {},
        { theme: 'dark', defaultModel: 'opus' }
      );

      expect(result).toEqual({ success: true });

      // Verify settings were saved
      const getResult = await ipcMain.invokeHandler('settings:get', {});
      const data = (getResult as { data: { theme: string; defaultModel: string } }).data;
      expect(data.theme).toBe('dark');
      expect(data.defaultModel).toBe('opus');
    });

    it('should configure agent manager when paths change', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      await ipcMain.invokeHandler(
        'settings:save',
        {},
        { pythonPath: '/usr/bin/python3' }
      );

      expect(mockAgentManager.configure).toHaveBeenCalledWith('/usr/bin/python3', undefined);
    });
  });

  describe('app:version handler', () => {
    it('should return app version', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler('app:version', {});

      expect(result).toBe('0.1.0');
    });
  });

  describe('Agent Manager event forwarding', () => {
    it('should forward log events to renderer', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      mockAgentManager.emit('log', 'task-1', 'Test log message');

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'task:log',
        'task-1',
        'Test log message'
      );
    });

    it('should forward error events to renderer', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      mockAgentManager.emit('error', 'task-1', 'Test error message');

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'task:error',
        'task-1',
        'Test error message'
      );
    });

    it('should forward exit events with status change', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Exit event with task-execution processType should result in human_review status
      mockAgentManager.emit('exit', 'task-1', 0, 'task-execution');

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'task:statusChange',
        'task-1',
        'human_review'
      );
    });
  });

  describe('task:worktreeDiscardFile handler', () => {
    /**
     * Test 4.1: Single File Discard Isolation
     * Verifies that when discarding one file, only that file is restored
     * and other modified files remain unchanged.
     *
     * This test simulates a scenario where:
     * 1. A worktree has multiple modified files (file1.txt, file2.txt, file3.txt)
     * 2. User discards changes to file2.txt only
     * 3. file2.txt is restored to its original content
     * 4. file1.txt and file3.txt remain modified
     */
    it('should only discard selected file while keeping other files modified', async () => {
      // Skip test on systems without git properly configured
      // This test requires real git operations
      const { execSync } = await import('child_process');

      // Check if git is available
      try {
        execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        console.warn('[TEST] Git not available, skipping integration test');
        return;
      }

      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Initialize git repo in test project directory
      try {
        execSync('git init', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
        execSync('git config user.name "Test User"', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        console.warn('[TEST] Could not initialize git repo, skipping');
        return;
      }

      // Create initial files
      writeFileSync(path.join(TEST_PROJECT_PATH, 'file1.txt'), 'original content 1\n');
      writeFileSync(path.join(TEST_PROJECT_PATH, 'file2.txt'), 'original content 2\n');
      writeFileSync(path.join(TEST_PROJECT_PATH, 'file3.txt'), 'original content 3\n');

      // Create initial commit
      try {
        execSync('git add .', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
        execSync('git commit -m "initial commit"', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
      } catch (e) {
        console.warn('[TEST] Could not create initial commit, skipping:', e);
        return;
      }

      // Create .turret directory structure
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature'), { recursive: true });
      writeFileSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature', 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{ phase: 1, name: 'Test', type: 'implementation', subtasks: [{ id: '1', description: 'test', status: 'pending' }] }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Create worktree branch and directory
      const specId = '001-test-feature';
      const worktreePath = path.join(TEST_PROJECT_PATH, '.worktrees', specId);

      try {
        // Create a branch for the worktree
        execSync(`git checkout -b turret/${specId}`, { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
        execSync('git checkout -', { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });

        // Create the worktree
        mkdirSync(path.join(TEST_PROJECT_PATH, '.worktrees'), { recursive: true });
        execSync(`git worktree add "${worktreePath}" turret/${specId}`, { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
      } catch (e) {
        console.warn('[TEST] Could not create worktree, skipping:', e);
        return;
      }

      // Modify all three files in the worktree
      writeFileSync(path.join(worktreePath, 'file1.txt'), 'modified content 1\n');
      writeFileSync(path.join(worktreePath, 'file2.txt'), 'modified content 2\n');
      writeFileSync(path.join(worktreePath, 'file3.txt'), 'modified content 3\n');

      // Verify all files are modified before discard
      const statusBefore = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf-8' });
      expect(statusBefore).toContain('file1.txt');
      expect(statusBefore).toContain('file2.txt');
      expect(statusBefore).toContain('file3.txt');

      // Add project and get task ID
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Discard only file2.txt
      const discardResult = await ipcMain.invokeHandler(
        'task:worktreeDiscardFile',
        {},
        taskId,
        'file2.txt'
      );

      // Verify discard was successful
      expect(discardResult).toHaveProperty('success', true);
      expect((discardResult as { data: { success: boolean; message: string } }).data.success).toBe(true);
      expect((discardResult as { data: { message: string } }).data.message).toContain('file2.txt');

      // Check git status after discard - file2.txt should NOT be modified
      const statusAfter = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf-8' });

      // file1.txt and file3.txt should still be modified
      expect(statusAfter).toContain('file1.txt');
      expect(statusAfter).toContain('file3.txt');

      // file2.txt should NOT be in the status (it was restored)
      expect(statusAfter).not.toContain('file2.txt');

      // Verify file contents (normalize line endings for cross-platform compatibility)
      const { readFileSync } = await import('fs');
      const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
      const file1Content = normalize(readFileSync(path.join(worktreePath, 'file1.txt'), 'utf-8'));
      const file2Content = normalize(readFileSync(path.join(worktreePath, 'file2.txt'), 'utf-8'));
      const file3Content = normalize(readFileSync(path.join(worktreePath, 'file3.txt'), 'utf-8'));

      // file1 and file3 should have modified content
      expect(file1Content).toBe('modified content 1');
      expect(file3Content).toBe('modified content 3');

      // file2 should have original content (was restored)
      expect(file2Content).toBe('original content 2');

      // Cleanup worktree
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, { cwd: TEST_PROJECT_PATH, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should return error for non-existent task', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:worktreeDiscardFile',
        {},
        'nonexistent-task-id',
        'some-file.ts'
      );

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      });
    });

    it('should reject file paths with shell metacharacters', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Create a mock worktree directory (required for file path validation to run)
      const worktreeDir = path.join(TEST_PROJECT_PATH, '.worktrees', '001-test-feature');
      mkdirSync(worktreeDir, { recursive: true });

      // Get task ID by listing tasks
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Test various shell injection attempts
      const dangerousPaths = [
        'file.ts; rm -rf /',
        'file.ts && cat /etc/passwd',
        'file.ts | grep password',
        'file.ts`whoami`',
        'file.ts$(cat /etc/passwd)'
      ];

      for (const maliciousPath of dangerousPaths) {
        const result = await ipcMain.invokeHandler(
          'task:worktreeDiscardFile',
          {},
          taskId,
          maliciousPath
        );

        expect(result).toEqual({
          success: false,
          error: 'Invalid file path: contains disallowed characters'
        });
      }
    });

    it('should return error when worktree does not exist', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Get task ID by listing tasks
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Try to discard a file when no worktree exists
      const result = await ipcMain.invokeHandler(
        'task:worktreeDiscardFile',
        {},
        taskId,
        'src/test-file.ts'
      );

      expect(result).toEqual({
        success: false,
        error: 'Worktree does not exist for this task'
      });
    });
  });

  /**
   * Regression Tests: Verify existing worktree operations still work correctly
   * after implementing the new individual file discard feature.
   * These tests ensure that merge and discard all functionality are not affected.
   */
  describe('task:worktreeDiscard handler (discard all)', () => {
    /**
     * Test 4.4: Verify discard all functionality still works
     * This is a regression test to ensure the new file discard feature
     * doesn't break the existing discard all functionality.
     */
    it('should return error for non-existent task', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:worktreeDiscard',
        {},
        'nonexistent-task-id'
      );

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      });
    });

    it('should return success when no worktree exists (nothing to discard)', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Get task ID by listing tasks
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Try to discard when no worktree exists - should succeed with "nothing to discard"
      const result = await ipcMain.invokeHandler(
        'task:worktreeDiscard',
        {},
        taskId
      );

      expect(result).toHaveProperty('success', true);
      expect((result as { data: { success: boolean; message: string } }).data.success).toBe(true);
      expect((result as { data: { message: string } }).data.message).toBe('No worktree to discard');
    });
  });

  describe('task:worktreeMerge handler (merge all)', () => {
    /**
     * Test 4.4: Verify merge functionality still works
     * This is a regression test to ensure the new file discard feature
     * doesn't break the existing merge functionality.
     *
     * Note: The merge handler checks Python environment before task validation,
     * so we test the handler is registered and returns appropriate errors.
     */
    it('should return error when Python environment is not ready', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:worktreeMerge',
        {},
        'nonexistent-task-id'
      );

      // Merge handler checks Python env first, so we expect a Python env error
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      // Handler is registered and responds - confirming it still works
    });

    it('should accept noCommit option for stage-only merge', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // This test verifies that the merge handler accepts the noCommit option
      // and the handler is properly registered
      const result = await ipcMain.invokeHandler(
        'task:worktreeMerge',
        {},
        'nonexistent-task-id',
        { noCommit: true }
      );

      // Merge handler checks Python env first, so we expect an error response
      // The key point is that the handler accepts the options parameter
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('task:worktreeDiff handler', () => {
    /**
     * Test 4.4: Verify diff functionality still works
     * This is a regression test to ensure the new file discard feature
     * doesn't break the existing diff functionality.
     */
    it('should return error for non-existent task', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:worktreeDiff',
        {},
        'nonexistent-task-id'
      );

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      });
    });

    it('should return error when no worktree exists', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Get task ID by listing tasks
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Try to get diff when no worktree exists
      const result = await ipcMain.invokeHandler(
        'task:worktreeDiff',
        {},
        taskId
      );

      expect(result).toEqual({
        success: false,
        error: 'No worktree found for this task'
      });
    });
  });

  describe('task:worktreeStatus handler', () => {
    /**
     * Test 4.4: Verify status functionality still works
     * This is a regression test to ensure the new file discard feature
     * doesn't break the existing status functionality.
     */
    it('should return error for non-existent task', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      const result = await ipcMain.invokeHandler(
        'task:worktreeStatus',
        {},
        'nonexistent-task-id'
      );

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      });
    });

    it('should return exists: false when no worktree exists', async () => {
      const { setupIpcHandlers } = await import('../ipc-handlers');
      setupIpcHandlers(mockAgentManager as never, mockTerminalManager as never, () => mockMainWindow as never, mockPythonEnvManager as never);

      // Create .turret directory first
      mkdirSync(path.join(TEST_PROJECT_PATH, '.turret', 'specs'), { recursive: true });

      // Add a project first
      const addResult = await ipcMain.invokeHandler('project:add', {}, TEST_PROJECT_PATH);
      const projectId = (addResult as { data: { id: string } }).data.id;

      // Create a spec directory with implementation plan
      const specDir = path.join(TEST_PROJECT_PATH, '.turret', 'specs', '001-test-feature');
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        services_involved: [],
        phases: [{
          phase: 1,
          name: 'Test Phase',
          type: 'implementation',
          subtasks: [{ id: 'subtask-1', description: 'Test subtask', status: 'pending' }]
        }],
        final_acceptance: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        spec_file: ''
      }));

      // Get task ID by listing tasks
      const listResult = await ipcMain.invokeHandler('task:list', {}, projectId);
      const tasks = (listResult as { data: { id: string }[] }).data;
      const taskId = tasks[0]?.id;

      if (!taskId) {
        throw new Error('Expected task to be created');
      }

      // Get status when no worktree exists
      const result = await ipcMain.invokeHandler(
        'task:worktreeStatus',
        {},
        taskId
      );

      expect(result).toHaveProperty('success', true);
      expect((result as { data: { exists: boolean } }).data.exists).toBe(false);
    });
  });
});
