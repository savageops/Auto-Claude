import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, FileCode, Trash2, RefreshCw, AlertTriangle, CheckCircle2, AlertCircle } from '@/lib/icons';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { WorktreeDiff } from '../../../../shared/types';

interface DiffViewDialogProps {
  open: boolean;
  worktreeDiff: WorktreeDiff | null;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  onDiscardFile?: (filePath: string) => void;
  isDiscardingFile?: boolean;
  discardFileError?: string | null;
  discardFileSuccess?: string | null;
  onRefreshDiff?: () => Promise<void>;
}

/**
 * Dialog displaying the list of changed files with their status and line changes
 */
export function DiffViewDialog({
  open,
  worktreeDiff,
  onOpenChange,
  taskId,
  onDiscardFile,
  isDiscardingFile = false,
  discardFileError,
  discardFileSuccess,
  onRefreshDiff
}: DiffViewDialogProps) {
  const [fileToDiscard, setFileToDiscard] = useState<string | null>(null);
  const [localDiscardError, setLocalDiscardError] = useState<{ file: string; message: string } | null>(null);
  const wasDiscardingRef = useRef(false);

  // Track when discard operation completes and close confirmation dialog on success
  useEffect(() => {
    // If we were discarding and now we're not, the operation completed
    if (wasDiscardingRef.current && !isDiscardingFile) {
      // Only close the dialog if the operation was successful (no error)
      if (!discardFileError && !localDiscardError) {
        setFileToDiscard(null);
      }
    }
    wasDiscardingRef.current = isDiscardingFile;
  }, [isDiscardingFile, discardFileError, localDiscardError]);

  /**
   * Handles discarding changes to a single file via git restore.
   * If onDiscardFile is provided, use it as callback. Otherwise, make direct IPC call.
   */
  const handleDiscardConfirm = useCallback(async () => {
    if (!fileToDiscard) return;

    const filePath = fileToDiscard;

    // If callback provided, use it (external state management)
    if (onDiscardFile) {
      onDiscardFile(filePath);
      return;
    }

    // Otherwise, handle internally (for backward compatibility)
    if (!taskId || !onRefreshDiff) return;

    setLocalDiscardError(null);

    try {
      const result = await window.electronAPI.discardWorktreeFile(taskId, filePath);

      if (result.success && result.data?.success) {
        // Close dialog on success
        setFileToDiscard(null);
        // Refresh the diff view to show updated file list
        await onRefreshDiff();
      } else {
        // IPC call succeeded but git restore failed - show error
        const errorMessage = result.error || result.data?.error || 'Failed to discard file changes';
        setLocalDiscardError({ file: filePath, message: errorMessage });
      }
    } catch (error) {
      // Unexpected error (IPC failure, network error, etc.)
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setLocalDiscardError({ file: filePath, message: errorMessage });
    }
  }, [fileToDiscard, onDiscardFile, taskId, onRefreshDiff]);

  const handleDiscardClick = (filePath: string) => {
    setFileToDiscard(filePath);
  };

  const handleDiscardCancel = () => {
    setFileToDiscard(null);
    setLocalDiscardError(null);
  };

  const hasDiscardHandler = !!onDiscardFile;
  const currentDiscardError = discardFileError || (localDiscardError?.message ? `${localDiscardError.file}: ${localDiscardError.message}` : null);

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

          {/* Error feedback for discard operation */}
          {currentDiscardError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{currentDiscardError}</p>
            </div>
          )}

          {/* Success feedback for discard operation */}
          {discardFileSuccess && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20 mb-3">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              <p className="text-sm text-success">
                Successfully discarded changes to <code className="font-mono bg-success/10 px-1 rounded">{discardFileSuccess}</code>
              </p>
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
                      {hasDiscardHandler && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDiscardClick(file.path);
                                }}
                                disabled={isDiscardingFile}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              >
                                {isDiscardingFile ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{isDiscardingFile ? 'Discarding...' : "Discard this file's changes"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
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

      {/* Confirmation dialog for file discard */}
      <AlertDialog open={fileToDiscard !== null} onOpenChange={(open) => !open && handleDiscardCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Discard File Changes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  Are you sure you want to discard changes to this file?
                </p>
                <div className="bg-muted/50 rounded-lg p-3">
                  <code className="text-sm font-mono text-foreground break-all">
                    {fileToDiscard}
                  </code>
                </div>
                <p className="text-destructive">
                  This action cannot be undone. All changes to this file will be permanently lost.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardCancel} disabled={isDiscardingFile}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDiscardConfirm();
              }}
              disabled={isDiscardingFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {isDiscardingFile ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Discarding...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Discard Changes
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}