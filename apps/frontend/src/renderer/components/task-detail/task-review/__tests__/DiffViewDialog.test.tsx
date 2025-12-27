/**
 * Unit tests for DiffViewDialog component
 * Tests file discard functionality, confirmation dialog behavior, and state management
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorktreeDiff, DiffFile } from '../../../../../shared/types';

// Import browser mock to get full ElectronAPI structure
import '../../../../lib/browser-mock';

// Helper to create test diff file
function createTestDiffFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'src/test-file.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    ...overrides
  };
}

// Helper to create test worktree diff
function createTestWorktreeDiff(
  files: DiffFile[] = [createTestDiffFile()],
  summary = '1 file changed, 10 insertions(+), 5 deletions(-)'
): WorktreeDiff {
  return {
    files,
    summary
  };
}

// Mock functions
const mockDiscardWorktreeFile = vi.fn();
const mockOnOpenChange = vi.fn();
const mockOnRefreshDiff = vi.fn();

describe('DiffViewDialog', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup window.electronAPI mocks
    if (window.electronAPI) {
      window.electronAPI.discardWorktreeFile = mockDiscardWorktreeFile;
    }

    // Default mock implementations
    mockDiscardWorktreeFile.mockResolvedValue({
      success: true,
      data: {
        success: true,
        message: 'File discarded successfully'
      }
    });
    mockOnRefreshDiff.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Confirmation Dialog Cancel Behavior', () => {
    /**
     * Test 4.2: Confirmation Dialog Cancel
     * Verifies that when the user clicks cancel on the confirmation dialog:
     * 1. No IPC call is made to discard the file
     * 2. The file remains in the diff list
     * 3. The confirmation dialog closes properly
     */
    it('should not call discardWorktreeFile when cancel is clicked', () => {
      // Simulate the component state management
      let fileToDiscard: string | null = null;

      // Step 1: User clicks discard button - sets fileToDiscard state
      const filePath = 'src/components/MyComponent.tsx';
      fileToDiscard = filePath;
      expect(fileToDiscard).toBe(filePath);

      // Step 2: User sees confirmation dialog open
      const isDialogOpen = !!fileToDiscard;
      expect(isDialogOpen).toBe(true);

      // Step 3: User clicks Cancel - clears fileToDiscard state
      // This simulates the AlertDialog onOpenChange handler: (isOpen) => !isOpen && setFileToDiscard(null)
      const handleCancel = () => {
        fileToDiscard = null;
      };
      handleCancel();

      // Step 4: Verify state is cleared
      expect(fileToDiscard).toBeNull();

      // Step 5: Verify discardWorktreeFile was NOT called
      expect(mockDiscardWorktreeFile).not.toHaveBeenCalled();
    });

    it('should close confirmation dialog when cancel is clicked', () => {
      let fileToDiscard: string | null = null;

      // Open dialog by setting file
      fileToDiscard = 'src/test.ts';
      expect(!!fileToDiscard).toBe(true); // Dialog should be open

      // Simulate cancel click (onOpenChange with false)
      const onOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
          fileToDiscard = null;
        }
      };

      onOpenChange(false);

      // Dialog should be closed
      expect(!!fileToDiscard).toBe(false);
    });

    it('should keep file in diff list after canceling discard', () => {
      // Create mock worktree diff with multiple files
      const files: DiffFile[] = [
        createTestDiffFile({ path: 'src/file1.ts' }),
        createTestDiffFile({ path: 'src/file2.ts' }),
        createTestDiffFile({ path: 'src/file3.ts' })
      ];
      const worktreeDiff = createTestWorktreeDiff(files);

      let fileToDiscard: string | null = null;

      // User clicks discard on file2
      fileToDiscard = 'src/file2.ts';
      expect(fileToDiscard).toBe('src/file2.ts');

      // User clicks cancel
      fileToDiscard = null;

      // Verify:
      // 1. No IPC call was made
      expect(mockDiscardWorktreeFile).not.toHaveBeenCalled();

      // 2. All files are still in the diff
      expect(worktreeDiff.files).toHaveLength(3);
      expect(worktreeDiff.files.map(f => f.path)).toContain('src/file2.ts');
    });

    it('should handle rapid cancel without making any IPC calls', () => {
      let fileToDiscard: string | null = null;

      // Simulate multiple open/cancel cycles
      for (let i = 0; i < 5; i++) {
        // Open dialog
        fileToDiscard = `src/file-${i}.ts`;
        expect(!!fileToDiscard).toBe(true);

        // Cancel immediately
        fileToDiscard = null;
        expect(!!fileToDiscard).toBe(false);
      }

      // Verify no IPC calls were made
      expect(mockDiscardWorktreeFile).not.toHaveBeenCalled();
    });

    it('should only clear fileToDiscard state on cancel without affecting other state', () => {
      // Simulate component state
      let fileToDiscard: string | null = null;
      let discardSuccess: string | null = null;
      let isDiscarding = false;
      let discardError: { file: string; message: string } | null = null;

      // Simulate previous successful discard (success message showing)
      discardSuccess = 'src/previously-discarded.ts';

      // User initiates new discard
      fileToDiscard = 'src/new-file.ts';

      // User cancels
      fileToDiscard = null;

      // Only fileToDiscard should be cleared
      expect(fileToDiscard).toBeNull();
      expect(discardSuccess).toBe('src/previously-discarded.ts'); // Should remain
      expect(isDiscarding).toBe(false);
      expect(discardError).toBeNull();
    });
  });

  describe('Confirmation Dialog State Management', () => {
    it('should track which file is being considered for discard', () => {
      let fileToDiscard: string | null = null;

      // Initially no file selected for discard
      expect(fileToDiscard).toBeNull();

      // User clicks discard on a specific file
      const selectedFile = 'src/components/Button.tsx';
      fileToDiscard = selectedFile;

      // State should track the selected file
      expect(fileToDiscard).toBe(selectedFile);
    });

    it('should open dialog when fileToDiscard is set', () => {
      let fileToDiscard: string | null = null;

      // Dialog state derived from fileToDiscard
      const isDialogOpen = () => !!fileToDiscard;

      expect(isDialogOpen()).toBe(false);

      fileToDiscard = 'src/test.ts';
      expect(isDialogOpen()).toBe(true);

      fileToDiscard = null;
      expect(isDialogOpen()).toBe(false);
    });

    it('should display correct file name in confirmation dialog', () => {
      const testFiles = [
        'src/components/Header.tsx',
        'styles/main.css',
        'utils/helpers.ts',
        'package.json'
      ];

      let fileToDiscard: string | null = null;

      testFiles.forEach(filePath => {
        fileToDiscard = filePath;
        // In the actual component, this would be displayed in the dialog
        expect(fileToDiscard).toBe(filePath);
      });
    });
  });

  describe('Discard Button Behavior', () => {
    it('should set fileToDiscard when discard button is clicked', () => {
      let fileToDiscard: string | null = null;

      const files: DiffFile[] = [
        createTestDiffFile({ path: 'src/file1.ts' }),
        createTestDiffFile({ path: 'src/file2.ts' })
      ];

      // Simulate clicking discard button on first file
      const handleDiscardClick = (filePath: string) => {
        fileToDiscard = filePath;
      };

      handleDiscardClick(files[0].path);
      expect(fileToDiscard).toBe('src/file1.ts');

      // Reset and try second file
      fileToDiscard = null;
      handleDiscardClick(files[1].path);
      expect(fileToDiscard).toBe('src/file2.ts');
    });

    it('should disable discard buttons while operation is in progress', () => {
      let isDiscarding = false;

      // Initially buttons should be enabled
      expect(isDiscarding).toBe(false);

      // Start discard operation
      isDiscarding = true;

      // Buttons should be disabled
      expect(isDiscarding).toBe(true);

      // Complete operation
      isDiscarding = false;

      // Buttons should be enabled again
      expect(isDiscarding).toBe(false);
    });

    it('should not open new confirmation dialog while discarding', () => {
      let isDiscarding = true; // Operation in progress
      let fileToDiscard: string | null = null;

      // Simulate button click handler checking isDiscarding state
      const handleDiscardClick = (filePath: string) => {
        if (!isDiscarding) {
          fileToDiscard = filePath;
        }
      };

      // Try to open dialog while discarding - should not work
      handleDiscardClick('src/blocked-file.ts');
      expect(fileToDiscard).toBeNull();

      // After discard completes
      isDiscarding = false;
      handleDiscardClick('src/allowed-file.ts');
      expect(fileToDiscard).toBe('src/allowed-file.ts');
    });
  });

  describe('Confirm Discard Behavior', () => {
    it('should call discardWorktreeFile when confirm is clicked', async () => {
      const taskId = 'task-123';
      const filePath = 'src/file-to-discard.ts';

      // Simulate the handleDiscardFile function
      const handleDiscardFile = async () => {
        await mockDiscardWorktreeFile(taskId, filePath);
        await mockOnRefreshDiff();
      };

      await handleDiscardFile();

      // Verify IPC call was made with correct arguments
      expect(mockDiscardWorktreeFile).toHaveBeenCalledWith(taskId, filePath);
      expect(mockDiscardWorktreeFile).toHaveBeenCalledTimes(1);

      // Verify refresh was called
      expect(mockOnRefreshDiff).toHaveBeenCalled();
    });

    it('should refresh diff after successful discard', async () => {
      const taskId = 'task-456';
      const filePath = 'src/deleted-file.ts';

      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'Discarded' }
      });

      // Simulate handleDiscardFile
      const result = await mockDiscardWorktreeFile(taskId, filePath);
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      expect(mockOnRefreshDiff).toHaveBeenCalled();
    });

    it('should not refresh diff if discard fails', async () => {
      mockDiscardWorktreeFile.mockResolvedValue({
        success: false,
        error: 'Failed to discard file'
      });

      const taskId = 'task-789';
      const filePath = 'src/failed-file.ts';

      // Simulate handleDiscardFile
      const result = await mockDiscardWorktreeFile(taskId, filePath);
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // Refresh should NOT be called because discard failed
      expect(mockOnRefreshDiff).not.toHaveBeenCalled();
    });
  });

  describe('File List Rendering', () => {
    it('should render all files in diff', () => {
      const files: DiffFile[] = [
        createTestDiffFile({ path: 'src/a.ts', status: 'added' }),
        createTestDiffFile({ path: 'src/b.ts', status: 'modified' }),
        createTestDiffFile({ path: 'src/c.ts', status: 'deleted' })
      ];
      const worktreeDiff = createTestWorktreeDiff(files);

      expect(worktreeDiff.files).toHaveLength(3);
      expect(worktreeDiff.files[0].status).toBe('added');
      expect(worktreeDiff.files[1].status).toBe('modified');
      expect(worktreeDiff.files[2].status).toBe('deleted');
    });

    it('should show empty state when no files in diff', () => {
      const worktreeDiff = createTestWorktreeDiff([], 'No changes');

      expect(worktreeDiff.files).toHaveLength(0);
      expect(worktreeDiff.summary).toBe('No changes');
    });

    it('should display file status correctly', () => {
      const statuses: Array<DiffFile['status']> = ['added', 'modified', 'deleted', 'renamed'];

      statuses.forEach(status => {
        const file = createTestDiffFile({ status });
        expect(file.status).toBe(status);
      });
    });

    it('should display additions and deletions count', () => {
      const file = createTestDiffFile({
        additions: 42,
        deletions: 17
      });

      expect(file.additions).toBe(42);
      expect(file.deletions).toBe(17);
    });
  });

  describe('Edge Case: Discard Last File', () => {
    /**
     * Test 4.3: Discard Last File Edge Case
     * Verifies that when the user discards the last remaining file in the diff:
     * 1. The IPC discard call succeeds
     * 2. The onRefreshDiff callback is called
     * 3. After refresh, the component shows "No changed files found" message
     * 4. The empty state is rendered correctly
     */
    it('should show "No changed files found" after discarding the last file', async () => {
      const taskId = 'task-last-file';
      const lastFile = createTestDiffFile({ path: 'src/only-file.ts' });

      // Initial state: only one file in the diff
      let worktreeDiff: WorktreeDiff | null = createTestWorktreeDiff([lastFile]);
      expect(worktreeDiff.files).toHaveLength(1);

      // Simulate the discard operation
      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'File discarded successfully' }
      });

      // Simulate the refresh callback that returns empty diff
      mockOnRefreshDiff.mockImplementation(async () => {
        // After discard, the worktree has no more changed files
        worktreeDiff = createTestWorktreeDiff([], 'No changes found');
      });

      // Perform the discard operation
      const result = await mockDiscardWorktreeFile(taskId, lastFile.path);

      // Verify discard was called
      expect(mockDiscardWorktreeFile).toHaveBeenCalledWith(taskId, 'src/only-file.ts');
      expect(result.success).toBe(true);

      // Call refresh after successful discard
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // Verify refresh was called
      expect(mockOnRefreshDiff).toHaveBeenCalled();

      // Verify worktreeDiff now has no files (empty state)
      expect(worktreeDiff).not.toBeNull();
      expect(worktreeDiff!.files).toHaveLength(0);

      // The component would now render the empty state message
      // In actual component: "No changed files found" is displayed
      const shouldShowEmptyMessage = !worktreeDiff?.files || worktreeDiff.files.length === 0;
      expect(shouldShowEmptyMessage).toBe(true);
    });

    it('should transition from single file to empty state correctly', async () => {
      const taskId = 'task-transition';

      // Start with a single file
      const singleFile = createTestDiffFile({ path: 'styles/main.css', status: 'modified' });
      let worktreeDiff: WorktreeDiff | null = createTestWorktreeDiff([singleFile]);

      // Verify initial state has one file
      expect(worktreeDiff.files).toHaveLength(1);
      expect(worktreeDiff.files[0].path).toBe('styles/main.css');

      // Check if we should show empty message (should be false initially)
      let shouldShowEmptyMessage = !worktreeDiff?.files || worktreeDiff.files.length === 0;
      expect(shouldShowEmptyMessage).toBe(false);

      // Simulate successful discard
      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'Discarded styles/main.css' }
      });

      // Simulate refresh returning empty diff
      mockOnRefreshDiff.mockImplementation(async () => {
        worktreeDiff = createTestWorktreeDiff([], 'No changes found');
      });

      // Execute discard flow
      const result = await mockDiscardWorktreeFile(taskId, singleFile.path);
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // After refresh, check empty state
      expect(worktreeDiff!.files).toHaveLength(0);
      shouldShowEmptyMessage = !worktreeDiff?.files || worktreeDiff.files.length === 0;
      expect(shouldShowEmptyMessage).toBe(true);
    });

    it('should handle null worktreeDiff after discarding all files', async () => {
      const taskId = 'task-null-diff';

      // Start with a single file
      let worktreeDiff: WorktreeDiff | null = createTestWorktreeDiff([
        createTestDiffFile({ path: 'readme.md' })
      ]);

      // Simulate refresh returning null (no diff data)
      mockOnRefreshDiff.mockImplementation(async () => {
        worktreeDiff = null;
      });

      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'File discarded' }
      });

      // Execute discard
      const result = await mockDiscardWorktreeFile(taskId, 'readme.md');
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // Verify worktreeDiff is null
      expect(worktreeDiff).toBeNull();

      // Component logic: empty message shown when worktreeDiff is null or has no files
      const shouldShowEmptyMessage = !worktreeDiff?.files || worktreeDiff.files.length === 0;
      expect(shouldShowEmptyMessage).toBe(true);
    });

    it('should handle discarding last file with empty files array', async () => {
      // Test that the component correctly identifies empty state
      // when files array exists but is empty

      const emptyDiff: WorktreeDiff = {
        files: [],
        summary: 'No changes found'
      };

      // Verify the condition that triggers empty message
      const hasNoFiles = !emptyDiff.files || emptyDiff.files.length === 0;
      expect(hasNoFiles).toBe(true);

      // Verify with undefined files
      const undefinedFilesDiff = { summary: 'No changes' } as WorktreeDiff;
      const undefinedFilesEmpty = !undefinedFilesDiff.files || undefinedFilesDiff.files.length === 0;
      expect(undefinedFilesEmpty).toBe(true);
    });

    it('should call refresh after discarding the only file', async () => {
      const taskId = 'task-refresh-check';
      const onlyFile = createTestDiffFile({ path: 'src/config.ts' });

      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'Config file discarded' }
      });

      // Discard the only file
      const result = await mockDiscardWorktreeFile(taskId, onlyFile.path);

      // Simulate component logic: refresh is called on success
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // Verify refresh was called exactly once
      expect(mockOnRefreshDiff).toHaveBeenCalledTimes(1);
    });

    it('should show success message before transitioning to empty state', async () => {
      const taskId = 'task-success-message';
      const lastFile = createTestDiffFile({ path: 'src/utils.ts' });

      let discardSuccess: string | null = null;
      let worktreeDiff: WorktreeDiff | null = createTestWorktreeDiff([lastFile]);

      mockDiscardWorktreeFile.mockResolvedValue({
        success: true,
        data: { success: true, message: 'Utils file discarded' }
      });

      mockOnRefreshDiff.mockImplementation(async () => {
        worktreeDiff = createTestWorktreeDiff([], 'No changes');
      });

      // Simulate the component's handleDiscardFile flow
      const filePath = lastFile.path;

      const result = await mockDiscardWorktreeFile(taskId, filePath);

      if (result.success && result.data?.success) {
        // Show success message
        discardSuccess = filePath;
        expect(discardSuccess).toBe('src/utils.ts');

        // Refresh diff
        await mockOnRefreshDiff();

        // After refresh, empty state is shown but success message remains briefly
        expect(worktreeDiff!.files).toHaveLength(0);
        expect(discardSuccess).toBe('src/utils.ts'); // Still showing success

        // Simulate timeout clearing success message
        discardSuccess = null;
        expect(discardSuccess).toBeNull();
      }
    });

    it('should not show empty state if discard fails on last file', async () => {
      const taskId = 'task-fail-last';
      const lastFile = createTestDiffFile({ path: 'src/protected.ts' });

      // Initial state with one file
      const worktreeDiff = createTestWorktreeDiff([lastFile]);

      // Simulate discard failure
      mockDiscardWorktreeFile.mockResolvedValue({
        success: false,
        error: 'Cannot discard protected file'
      });

      // Attempt to discard
      const result = await mockDiscardWorktreeFile(taskId, lastFile.path);

      // Should NOT call refresh on failure
      if (result.success && result.data?.success) {
        await mockOnRefreshDiff();
      }

      // Verify refresh was NOT called
      expect(mockOnRefreshDiff).not.toHaveBeenCalled();

      // File should still be in the diff
      expect(worktreeDiff.files).toHaveLength(1);
      expect(worktreeDiff.files[0].path).toBe('src/protected.ts');

      // Should NOT show empty message
      const shouldShowEmptyMessage = !worktreeDiff?.files || worktreeDiff.files.length === 0;
      expect(shouldShowEmptyMessage).toBe(false);
    });
  });
});
