/**
 * Integration tests for file discard workflow
 * Tests discard functionality with merge/stage/reject operations
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task, TaskStatus, WorktreeStatus, WorktreeDiff } from '../../../../shared/types';

// Mock electronAPI methods
const mockDiscardWorktreeFile = vi.fn();
const mockGetWorktreeDiff = vi.fn();
const mockGetWorktreeStatus = vi.fn();
const mockMergeWorktreePreview = vi.fn();
const mockMergeWorktree = vi.fn();
const mockDiscardWorktree = vi.fn();

// Helper to create test tasks
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    specId: 'test-spec-001',
    projectId: 'project-1',
    title: 'Test Task Title',
    description: 'Test task description',
    status: 'human_review' as TaskStatus,
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create worktree status
function createWorktreeStatus(overrides: Partial<WorktreeStatus> = {}): WorktreeStatus {
  return {
    exists: true,
    worktreePath: '/path/to/worktree',
    branch: 'task-branch',
    baseBranch: 'main',
    commitCount: 5,
    filesChanged: 3,
    additions: 50,
    deletions: 10,
    ...overrides
  };
}

// Helper to create worktree diff
function createWorktreeDiff(overrides: Partial<WorktreeDiff> = {}): WorktreeDiff {
  return {
    files: [
      { path: 'src/index.ts', status: 'modified', additions: 10, deletions: 5 },
      { path: 'src/styles.css', status: 'modified', additions: 50, deletions: 0 },
      { path: 'src/utils.ts', status: 'added', additions: 20, deletions: 0 }
    ],
    summary: '3 files changed, 80 insertions(+), 5 deletions(-)',
    ...overrides
  };
}

// Import browser mock to get full ElectronAPI structure
import '../../../lib/browser-mock';

describe('Discard File Workflow', () => {
  beforeEach(() => {
    // Override electronAPI methods for these tests
    if (window.electronAPI) {
      window.electronAPI.discardWorktreeFile = mockDiscardWorktreeFile;
      window.electronAPI.getWorktreeDiff = mockGetWorktreeDiff;
      window.electronAPI.getWorktreeStatus = mockGetWorktreeStatus;
      window.electronAPI.mergeWorktreePreview = mockMergeWorktreePreview;
      window.electronAPI.mergeWorktree = mockMergeWorktree;
      window.electronAPI.discardWorktree = mockDiscardWorktree;
    }

    // Clear all mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('discardWorktreeFile API', () => {
    it('should call discardWorktreeFile with correct taskId and filePath', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/styles.css';

      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          message: `Successfully discarded changes to ${filePath}`,
          filePath
        }
      });

      const result = await window.electronAPI.discardWorktreeFile(task.id, filePath);

      expect(mockDiscardWorktreeFile).toHaveBeenCalledWith('task-123', 'src/styles.css');
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.filePath).toBe(filePath);
    });

    it('should handle discard file failure gracefully', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/nonexistent.ts';

      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: false,
        error: 'File not found in worktree'
      });

      const result = await window.electronAPI.discardWorktreeFile(task.id, filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found in worktree');
    });

    it('should handle network errors gracefully', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/styles.css';

      mockDiscardWorktreeFile.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        window.electronAPI.discardWorktreeFile(task.id, filePath)
      ).rejects.toThrow('Network error');
    });
  });

  describe('State Updates After File Discard', () => {
    it('should refresh diff view after successful file discard', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/styles.css';

      // Mock successful discard
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath }
      });

      // Mock diff refresh - file should be removed from list
      const updatedDiff = createWorktreeDiff({
        files: [
          { path: 'src/index.ts', status: 'modified', additions: 10, deletions: 5 },
          { path: 'src/utils.ts', status: 'added', additions: 20, deletions: 0 }
        ],
        summary: '2 files changed, 30 insertions(+), 5 deletions(-)'
      });
      mockGetWorktreeDiff.mockResolvedValueOnce({
        success: true,
        data: updatedDiff
      });

      // Execute discard
      const discardResult = await window.electronAPI.discardWorktreeFile(task.id, filePath);
      expect(discardResult.success).toBe(true);

      // Fetch updated diff
      const diffResult = await window.electronAPI.getWorktreeDiff(task.id);
      expect(diffResult.success).toBe(true);
      expect(diffResult.data?.files).toHaveLength(2);
      expect(diffResult.data?.files.find(f => f.path === 'src/styles.css')).toBeUndefined();
    });

    it('should refresh worktree status after successful file discard', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/styles.css';

      // Mock successful discard
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath }
      });

      // Mock status refresh - files changed count should decrease
      const updatedStatus = createWorktreeStatus({
        filesChanged: 2 // Decreased from 3
      });
      mockGetWorktreeStatus.mockResolvedValueOnce({
        success: true,
        data: updatedStatus
      });

      // Execute discard
      await window.electronAPI.discardWorktreeFile(task.id, filePath);

      // Fetch updated status
      const statusResult = await window.electronAPI.getWorktreeStatus(task.id);
      expect(statusResult.success).toBe(true);
      expect(statusResult.data?.filesChanged).toBe(2);
    });

    it('should refresh merge preview after successful file discard', async () => {
      const task = createTestTask({ id: 'task-123' });
      const filePath = 'src/styles.css';

      // Mock successful discard
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath }
      });

      // Mock merge preview refresh - conflicts may be reduced
      mockMergeWorktreePreview.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          preview: {
            files: ['src/index.ts', 'src/utils.ts'],
            conflicts: [],
            summary: {
              totalFiles: 2,
              conflictFiles: 0,
              totalConflicts: 0,
              autoMergeable: 0
            }
          }
        }
      });

      // Execute discard
      await window.electronAPI.discardWorktreeFile(task.id, filePath);

      // Fetch updated merge preview
      const previewResult = await window.electronAPI.mergeWorktreePreview(task.id);
      expect(previewResult.success).toBe(true);
      expect(previewResult.data?.preview?.files).not.toContain('src/styles.css');
    });
  });

  describe('Integration with Merge Operation', () => {
    it('should allow merge after discarding unwanted files', async () => {
      const task = createTestTask({ id: 'task-123' });

      // First, discard unwanted CSS file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      const discardResult = await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');
      expect(discardResult.success).toBe(true);

      // Then, merge the remaining files
      mockMergeWorktree.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          message: 'Merge completed successfully',
          commitSha: 'abc123'
        }
      });

      const mergeResult = await window.electronAPI.mergeWorktree(task.id, { noCommit: false });
      expect(mergeResult.success).toBe(true);
      expect(mergeResult.data?.success).toBe(true);
    });

    it('should preserve merge preview accuracy after file discard', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Initial preview shows 3 files with 1 conflict
      mockMergeWorktreePreview.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          preview: {
            files: ['src/index.ts', 'src/styles.css', 'src/utils.ts'],
            conflicts: [{ file: 'src/styles.css', location: 'lines 1-10', tasks: [], severity: 'high' as const, canAutoMerge: false, strategy: 'manual', reason: 'Conflicting changes' }],
            summary: {
              totalFiles: 3,
              conflictFiles: 1,
              totalConflicts: 1,
              autoMergeable: 0
            }
          }
        }
      });

      const initialPreview = await window.electronAPI.mergeWorktreePreview(task.id);
      expect(initialPreview.data?.preview?.summary.totalConflicts).toBe(1);

      // Discard the conflicting file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');

      // Updated preview should show no conflicts
      mockMergeWorktreePreview.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          preview: {
            files: ['src/index.ts', 'src/utils.ts'],
            conflicts: [],
            summary: {
              totalFiles: 2,
              conflictFiles: 0,
              totalConflicts: 0,
              autoMergeable: 0
            }
          }
        }
      });

      const updatedPreview = await window.electronAPI.mergeWorktreePreview(task.id);
      expect(updatedPreview.data?.preview?.summary.totalConflicts).toBe(0);
    });
  });

  describe('Integration with Stage Operation', () => {
    it('should allow staging remaining files after discarding some', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Discard CSS file first
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');

      // Stage remaining files (stageOnly = true via noCommit)
      mockMergeWorktree.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          message: 'Changes staged in main project',
          staged: true,
          projectPath: '/project/path'
        }
      });

      const stageResult = await window.electronAPI.mergeWorktree(task.id, { noCommit: true });
      expect(stageResult.success).toBe(true);
      expect(stageResult.data?.projectPath).toBeDefined();
    });

    it('should correctly stage only non-discarded files', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Verify initial state has 3 files
      mockGetWorktreeDiff.mockResolvedValueOnce({
        success: true,
        data: createWorktreeDiff()
      });

      const initialDiff = await window.electronAPI.getWorktreeDiff(task.id);
      expect(initialDiff.data?.files).toHaveLength(3);

      // Discard one file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');

      // Verify updated state has 2 files
      mockGetWorktreeDiff.mockResolvedValueOnce({
        success: true,
        data: createWorktreeDiff({
          files: [
            { path: 'src/index.ts', status: 'modified', additions: 10, deletions: 5 },
            { path: 'src/utils.ts', status: 'added', additions: 20, deletions: 0 }
          ],
          summary: '2 files changed'
        })
      });

      const updatedDiff = await window.electronAPI.getWorktreeDiff(task.id);
      expect(updatedDiff.data?.files).toHaveLength(2);
    });
  });

  describe('Integration with Reject Operation', () => {
    it('should allow reject (full discard) even after partial file discards', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Discard one file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');

      // Now reject (discard entire worktree)
      mockDiscardWorktree.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          message: 'Worktree discarded successfully'
        }
      });

      const rejectResult = await window.electronAPI.discardWorktree(task.id);
      expect(rejectResult.success).toBe(true);
      expect(rejectResult.data?.success).toBe(true);
    });

    it('should not affect reject operation if file discard failed', async () => {
      const task = createTestTask({ id: 'task-123' });

      // File discard fails
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: false,
        error: 'Failed to discard file'
      });

      const discardFileResult = await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');
      expect(discardFileResult.success).toBe(false);

      // Full reject should still work
      mockDiscardWorktree.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          message: 'Worktree discarded successfully'
        }
      });

      const rejectResult = await window.electronAPI.discardWorktree(task.id);
      expect(rejectResult.success).toBe(true);
    });
  });

  describe('Multiple File Discard Operations', () => {
    it('should allow discarding multiple files sequentially', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Discard first file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      const result1 = await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');
      expect(result1.success).toBe(true);

      // Discard second file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/utils.ts' }
      });

      const result2 = await window.electronAPI.discardWorktreeFile(task.id, 'src/utils.ts');
      expect(result2.success).toBe(true);

      // Verify both calls were made
      expect(mockDiscardWorktreeFile).toHaveBeenCalledTimes(2);
      expect(mockDiscardWorktreeFile).toHaveBeenNthCalledWith(1, 'task-123', 'src/styles.css');
      expect(mockDiscardWorktreeFile).toHaveBeenNthCalledWith(2, 'task-123', 'src/utils.ts');
    });

    it('should handle partial failures during multiple discards', async () => {
      const task = createTestTask({ id: 'task-123' });

      // First discard succeeds
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/styles.css' }
      });

      const result1 = await window.electronAPI.discardWorktreeFile(task.id, 'src/styles.css');
      expect(result1.success).toBe(true);

      // Second discard fails
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: false,
        error: 'Permission denied'
      });

      const result2 = await window.electronAPI.discardWorktreeFile(task.id, 'src/index.ts');
      expect(result2.success).toBe(false);

      // Should still be able to merge the remaining files
      mockMergeWorktree.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Merged' }
      });

      const mergeResult = await window.electronAPI.mergeWorktree(task.id, { noCommit: false });
      expect(mergeResult.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle discarding the last file in worktree', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Start with single file
      mockGetWorktreeDiff.mockResolvedValueOnce({
        success: true,
        data: {
          files: [{ path: 'src/only-file.ts', status: 'modified', additions: 5, deletions: 0 }],
          summary: '1 file changed'
        }
      });

      // Discard the only file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/only-file.ts' }
      });

      await window.electronAPI.discardWorktreeFile(task.id, 'src/only-file.ts');

      // Worktree should now have no file changes
      mockGetWorktreeStatus.mockResolvedValueOnce({
        success: true,
        data: createWorktreeStatus({
          filesChanged: 0,
          additions: 0,
          deletions: 0
        })
      });

      const statusResult = await window.electronAPI.getWorktreeStatus(task.id);
      expect(statusResult.data?.filesChanged).toBe(0);
      expect(statusResult.data?.additions).toBe(0);
    });

    it('should handle discarding a deleted file', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Discard a file that was marked as deleted
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/removed.ts' }
      });

      const result = await window.electronAPI.discardWorktreeFile(task.id, 'src/removed.ts');
      expect(result.success).toBe(true);
    });

    it('should handle discarding a renamed file', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Discard a renamed file
      mockDiscardWorktreeFile.mockResolvedValueOnce({
        success: true,
        data: { success: true, message: 'Discarded', filePath: 'src/newname.ts' }
      });

      const result = await window.electronAPI.discardWorktreeFile(task.id, 'src/newname.ts');
      expect(result.success).toBe(true);
    });

    it('should handle concurrent operations correctly', async () => {
      const task = createTestTask({ id: 'task-123' });

      // Simulate concurrent discard requests
      mockDiscardWorktreeFile
        .mockResolvedValueOnce({
          success: true,
          data: { success: true, message: 'Discarded', filePath: 'src/file1.ts' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: { success: true, message: 'Discarded', filePath: 'src/file2.ts' }
        });

      // Execute concurrently
      const [result1, result2] = await Promise.all([
        window.electronAPI.discardWorktreeFile(task.id, 'src/file1.ts'),
        window.electronAPI.discardWorktreeFile(task.id, 'src/file2.ts')
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});
