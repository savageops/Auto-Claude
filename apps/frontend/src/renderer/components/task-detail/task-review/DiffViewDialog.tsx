import { useState, useCallback } from 'react';
import { Eye, FileCode, Trash2, CheckCircle2, AlertCircle } from '@/lib/icons';
import { Button } from '../../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { WorktreeDiff } from '../../../../shared/types';

interface DiffViewDialogProps {
  open: boolean;
  worktreeDiff: WorktreeDiff | null;
  taskId: string;
  onOpenChange: (open: boolean) => void;
  onRefreshDiff: () => Promise<void>;
}

/**
 * Dialog displaying the list of changed files with their status and line changes
 */
export function DiffViewDialog({
  open,
  worktreeDiff,
  taskId,
  onOpenChange,
  onRefreshDiff
}: DiffViewDialogProps) {
  // State for tracking which file is being considered for discard
  const [fileToDiscard, setFileToDiscard] = useState<string | null>(null);
  // State for showing success feedback after file discard
  const [discardSuccess, setDiscardSuccess] = useState<string | null>(null);
  // State for tracking discard operation in progress (prevents race conditions)
  const [isDiscarding, setIsDiscarding] = useState(false);
  // State for showing error message after failed discard operation
  const [discardError, setDiscardError] = useState<{ file: string; message: string } | null>(null);

  /**
   * Handles discarding changes to a single file via git restore.
   * Calls IPC, shows success feedback, and refreshes the diff view.
   */
  const handleDiscardFile = useCallback(async () => {
    if (!fileToDiscard || isDiscarding) return;

    const filePath = fileToDiscard;
    // Clear the confirmation dialog immediately
    setFileToDiscard(null);
    // Clear any previous error
    setDiscardError(null);
    // Set loading state to prevent race conditions
    setIsDiscarding(true);

    try {
      const result = await window.electronAPI.discardWorktreeFile(taskId, filePath);

      if (result.success && result.data?.success) {
        // Show success feedback
        setDiscardSuccess(filePath);
        // Clear success message after 3 seconds
        setTimeout(() => setDiscardSuccess(null), 3000);
        // Refresh the diff view to show updated file list
        await onRefreshDiff();
      } else {
        // IPC call succeeded but git restore failed - show error
        const errorMessage = result.error || result.data?.error || 'Failed to discard file changes';
        setDiscardError({ file: filePath, message: errorMessage });
      }
    } catch (error) {
      // Unexpected error (IPC failure, network error, etc.)
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setDiscardError({ file: filePath, message: errorMessage });
    } finally {
      // Always clear loading state
      setIsDiscarding(false);
    }
  }, [fileToDiscard, isDiscarding, taskId, onRefreshDiff]);

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-400" />
              Changed Files
            </AlertDialogTitle>
            <AlertDialogDescription>
              {worktreeDiff?.summary || 'No changes found'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Success feedback after discarding a file */}
          {discardSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Discarded changes to <span className="font-mono">{discardSuccess}</span>
              </span>
            </div>
          )}
          <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
            {worktreeDiff?.files && worktreeDiff.files.length > 0 ? (
              <div className="space-y-2">
                {worktreeDiff.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileCode className={cn(
                        'h-4 w-4 shrink-0',
                        file.status === 'added' && 'text-success',
                        file.status === 'deleted' && 'text-destructive',
                        file.status === 'modified' && 'text-info',
                        file.status === 'renamed' && 'text-warning'
                      )} />
                      <span className="text-sm font-mono truncate">{file.path}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          file.status === 'added' && 'bg-success/10 text-success',
                          file.status === 'deleted' && 'bg-destructive/10 text-destructive',
                          file.status === 'modified' && 'bg-info/10 text-info',
                          file.status === 'renamed' && 'bg-warning/10 text-warning'
                        )}
                      >
                        {file.status}
                      </Badge>
                      <span className="text-xs text-success">+{file.additions}</span>
                      <span className="text-xs text-destructive">-{file.deletions}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:pointer-events-none"
                        title={`Discard changes to ${file.path}`}
                        onClick={() => setFileToDiscard(file.path)}
                        disabled={isDiscarding}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No changed files found
              </div>
            )}
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for discarding individual file */}
      <AlertDialog
        open={!!fileToDiscard}
        onOpenChange={(isOpen) => !isOpen && setFileToDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard file changes?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This will permanently discard all changes to:
              </span>
              <span className="block font-mono text-sm bg-secondary/50 px-2 py-1 rounded">
                {fileToDiscard}
              </span>
              <span className="block text-destructive font-medium">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error dialog when git restore fails */}
      <AlertDialog
        open={!!discardError}
        onOpenChange={(isOpen) => !isOpen && setDiscardError(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Failed to Discard Changes
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Could not discard changes to:
              </span>
              <span className="block font-mono text-sm bg-secondary/50 px-2 py-1 rounded">
                {discardError?.file}
              </span>
              <span className="block mt-2 text-destructive">
                {discardError?.message}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}