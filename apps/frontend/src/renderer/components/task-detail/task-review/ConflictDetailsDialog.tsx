import { useMemo, useState } from 'react';
import { diffLines, diffWords, Change } from 'diff';
import './conflict-diff-view.css';
import { AlertTriangle, GitMerge, Eye, FileCode } from '@/lib/icons';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import { getSeverityIcon, getSeverityVariant } from './utils';
import type { MergeConflict, MergeStats, GitConflictInfo } from '../../../../shared/types';

interface ConflictDetailsDialogProps {
  open: boolean;
  mergePreview: { files: string[]; conflicts: MergeConflict[]; summary: MergeStats; gitConflicts?: GitConflictInfo } | null;
  stageOnly: boolean;
  taskId?: string;
  onOpenChange: (open: boolean) => void;
  onMerge: () => void;
}

/**
 * Dialog displaying detailed information about merge conflicts
 *
 * Features:
 * - Clickable conflict entries that open detailed diff views
 * - GitHub-style diff visualization with syntax highlighting
 * - Split-view showing before/after changes
 * - Word-level diff highlighting for precise change tracking
 */
export function ConflictDetailsDialog({
  open,
  mergePreview,
  stageOnly,
  taskId,
  onOpenChange,
  onMerge
}: ConflictDetailsDialogProps) {
  const [selectedConflict, setSelectedConflict] = useState<MergeConflict | null>(null);
  const [oldContent, setOldContent] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const handleConflictClick = async (conflict: MergeConflict) => {
    setSelectedConflict(conflict);
    setIsLoadingDiff(true);
    setOldContent('');
    setNewContent('');
    setDiffError(null);

    try {
      if (taskId) {
        const result = await window.electronAPI.getWorktreeConflictDiff(taskId, conflict.file);
        if (result.success && result.data) {
          // Backend returns { oldContent, newContent }
          const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          setOldContent(data.oldContent || '');
          setNewContent(data.newContent || '');
        } else {
          setDiffError(result.error || 'Failed to get diff');
        }
      } else {
        setDiffError('Task ID not available');
      }
    } catch (error) {
      setDiffError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleCloseDiffDialog = () => {
    setSelectedConflict(null);
    setOldContent('');
    setNewContent('');
    setDiffError(null);
  };

  // Compute line-level diff
  const lineDiff = useMemo(() => {
    if (!oldContent && !newContent) return [];
    const result = diffLines(oldContent, newContent);
    console.log('[ConflictDiff] oldContent length:', oldContent.length);
    console.log('[ConflictDiff] newContent length:', newContent.length);
    console.log('[ConflictDiff] diffLines result:', result.map(c => ({
      added: c.added,
      removed: c.removed,
      count: c.count,
      valuePreview: c.value.slice(0, 50) + (c.value.length > 50 ? '...' : '')
    })));
    return result;
  }, [oldContent, newContent]);

  // Build split view rows from line diff
  const splitRows = useMemo(() => {
    const rows: Array<{
      oldLine: number | null;
      newLine: number | null;
      oldContent: string | null;
      newContent: string | null;
      oldType: 'normal' | 'delete' | 'empty';
      newType: 'normal' | 'insert' | 'empty';
      wordDiff?: Change[];
    }> = [];

    let oldLineNum = 1;
    let newLineNum = 1;

    // Process changes and pair them for split view
    let i = 0;
    while (i < lineDiff.length) {
      const change = lineDiff[i];
      const lines = change.value.split('\n');
      // Remove trailing empty string from split
      if (lines[lines.length - 1] === '') lines.pop();

      if (!change.added && !change.removed) {
        // Context lines - show on both sides
        for (const line of lines) {
          rows.push({
            oldLine: oldLineNum++,
            newLine: newLineNum++,
            oldContent: line,
            newContent: line,
            oldType: 'normal',
            newType: 'normal',
          });
        }
      } else if (change.removed && lineDiff[i + 1]?.added) {
        // Paired delete + insert - show side by side with word diff
        const nextChange = lineDiff[i + 1];
        const oldLines = lines;
        const newLines = nextChange.value.split('\n');
        if (newLines[newLines.length - 1] === '') newLines.pop();

        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let j = 0; j < maxLen; j++) {
          const oldLine = oldLines[j];
          const newLine = newLines[j];
          
          // Compute word-level diff for this line pair
          let wordDiff: Change[] | undefined;
          if (oldLine !== undefined && newLine !== undefined) {
            wordDiff = diffWords(oldLine, newLine);
          }

          rows.push({
            oldLine: oldLine !== undefined ? oldLineNum++ : null,
            newLine: newLine !== undefined ? newLineNum++ : null,
            oldContent: oldLine ?? null,
            newContent: newLine ?? null,
            oldType: oldLine !== undefined ? 'delete' : 'empty',
            newType: newLine !== undefined ? 'insert' : 'empty',
            wordDiff,
          });
        }
        i++; // Skip the next change since we processed it
      } else if (change.removed) {
        // Only deletions
        for (const line of lines) {
          rows.push({
            oldLine: oldLineNum++,
            newLine: null,
            oldContent: line,
            newContent: null,
            oldType: 'delete',
            newType: 'empty',
          });
        }
      } else if (change.added) {
        // Only insertions
        for (const line of lines) {
          rows.push({
            oldLine: null,
            newLine: newLineNum++,
            oldContent: null,
            newContent: line,
            oldType: 'empty',
            newType: 'insert',
          });
        }
      }
      i++;
    }

    return rows;
  }, [lineDiff]);

  // Render text with word-level highlighting
  const renderWithWordDiff = (text: string, wordDiff: Change[] | undefined, side: 'old' | 'new') => {
    if (!wordDiff) return text;

    return wordDiff.map((part, idx) => {
      if (side === 'old') {
        if (part.added) return null; // Skip added parts on old side
        if (part.removed) {
          return <span key={idx} className="diff-word-delete">{part.value}</span>;
        }
        return <span key={idx}>{part.value}</span>;
      } else {
        if (part.removed) return null; // Skip removed parts on new side
        if (part.added) {
          return <span key={idx} className="diff-word-insert">{part.value}</span>;
        }
        return <span key={idx}>{part.value}</span>;
      }
    });
  };
  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Merge Conflicts Preview
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mergePreview?.conflicts.length || 0} potential conflict{(mergePreview?.conflicts.length || 0) !== 1 ? 's' : ''} detected.
            {mergePreview && mergePreview.summary.autoMergeable > 0 && (
              <span className="text-success ml-1">
                {mergePreview.summary.autoMergeable} can be auto-merged.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
          {mergePreview?.conflicts && mergePreview.conflicts.length > 0 ? (
            <div className="space-y-3">
              {mergePreview.conflicts.map((conflict, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-secondary/50",
                    conflict.canAutoMerge
                      ? "bg-secondary/30 border-border"
                      : conflict.severity === 'high' || conflict.severity === 'critical'
                        ? "bg-destructive/10 border-destructive/30 hover:bg-destructive/20"
                        : "bg-warning/10 border-warning/30 hover:bg-warning/20"
                  )}
                  onClick={() => handleConflictClick(conflict)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getSeverityIcon(conflict.severity)}
                      <span className="text-sm font-mono truncate">{conflict.file}</span>
                      <Eye className="h-3 w-3 text-muted-foreground ml-auto" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn('text-xs', getSeverityVariant(conflict.severity))}
                      >
                        {conflict.severity}
                      </Badge>
                      {conflict.canAutoMerge && (
                        <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                          auto-merge
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {conflict.location && (
                      <div><span className="text-foreground/70">Location:</span> {conflict.location}</div>
                    )}
                    {conflict.reason && (
                      <div><span className="text-foreground/70">Reason:</span> {conflict.reason}</div>
                    )}
                    {conflict.strategy && (
                      <div><span className="text-foreground/70">Strategy:</span> {conflict.strategy}</div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground italic">
                    Click to view conflict details
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No conflicts detected
            </div>
          )}
        </div>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel>Close</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onOpenChange(false);
              onMerge();
            }}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            <GitMerge className="mr-2 h-4 w-4" />
            {stageOnly ? 'Stage with AI Merge' : 'Merge with AI'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Conflict Details Diff Dialog */}
    <Dialog open={!!selectedConflict} onOpenChange={handleCloseDiffDialog}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-info" />
            Conflict Details: {selectedConflict?.file}
          </DialogTitle>
          <DialogDescription>
            {selectedConflict?.location && `Location: ${selectedConflict.location}`}
            {selectedConflict?.reason && ` • Reason: ${selectedConflict.reason}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
          {isLoadingDiff ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading conflict details...</p>
              </div>
            </div>
          ) : diffError ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-destructive opacity-50" />
              <p className="text-destructive">{diffError}</p>
            </div>
          ) : splitRows.length > 0 ? (
            <div className="space-y-4">
              {/* Debug info */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-xs font-mono">
                <div>Old: {oldContent.length} chars, {oldContent.split('\n').length} lines</div>
                <div>New: {newContent.length} chars, {newContent.split('\n').length} lines</div>
                <div>Diff chunks: {lineDiff.length} ({lineDiff.filter(c => c.added).length} added, {lineDiff.filter(c => c.removed).length} removed)</div>
                <div>Split rows: {splitRows.length} ({splitRows.filter(r => r.oldType === 'delete').length} del, {splitRows.filter(r => r.newType === 'insert').length} ins)</div>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">Conflict Changes</h4>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: 'hsl(0 70% 50% / 0.3)' }}></span>
                      Removed
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: 'hsl(120 50% 40% / 0.3)' }}></span>
                      Added
                    </span>
                  </div>
                </div>

                <div className="conflict-diff-view rounded-lg border border-border overflow-auto bg-card">
                  <table className="diff-table">
                    <colgroup>
                      <col className="diff-gutter-col" />
                      <col className="diff-code-col" />
                      <col className="diff-gutter-col" />
                      <col className="diff-code-col" />
                    </colgroup>
                    <thead>
                      <tr className="diff-header">
                        <th colSpan={2} className="diff-header-cell">Base Branch</th>
                        <th colSpan={2} className="diff-header-cell">Current Changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitRows.map((row, idx) => (
                        <tr key={idx} className="diff-row">
                          {/* Old side */}
                          <td className={cn('diff-gutter', `diff-gutter-${row.oldType}`)}>
                            {row.oldLine}
                          </td>
                          <td className={cn('diff-code', `diff-code-${row.oldType}`)}>
                            {row.oldType === 'delete' && <span className="diff-marker">−</span>}
                            {row.oldContent !== null && (
                              <span className="diff-content">
                                {row.wordDiff ? renderWithWordDiff(row.oldContent, row.wordDiff, 'old') : row.oldContent}
                              </span>
                            )}
                          </td>
                          {/* New side */}
                          <td className={cn('diff-gutter', `diff-gutter-${row.newType}`)}>
                            {row.newLine}
                          </td>
                          <td className={cn('diff-code', `diff-code-${row.newType}`)}>
                            {row.newType === 'insert' && <span className="diff-marker">+</span>}
                            {row.newContent !== null && (
                              <span className="diff-content">
                                {row.wordDiff ? renderWithWordDiff(row.newContent, row.wordDiff, 'new') : row.newContent}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedConflict && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h5 className="font-medium mb-2">Conflict Info</h5>
                    <div className="space-y-1 text-muted-foreground">
                      <div>File: <code className="bg-muted px-1 rounded text-xs">{selectedConflict.file}</code></div>
                      <div>Severity: <Badge className={cn('text-xs', getSeverityVariant(selectedConflict.severity))}>{selectedConflict.severity}</Badge></div>
                      <div>Auto-merge: {selectedConflict.canAutoMerge ? 'Yes' : 'No'}</div>
                      {selectedConflict.strategy && <div>Strategy: {selectedConflict.strategy}</div>}
                    </div>
                  </div>

                  <div>
                    <h5 className="font-medium mb-2">Resolution</h5>
                    <div className="space-y-1 text-muted-foreground">
                      {selectedConflict.canAutoMerge ? (
                        <div className="text-success">Will be automatically resolved during merge</div>
                      ) : (
                        <div className="text-warning">
                          Manual review may be required
                          {selectedConflict.severity === 'high' || selectedConflict.severity === 'critical' ? (
                            <div className="text-destructive text-xs mt-1">High priority - review recommended</div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (oldContent || newContent) ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No differences detected</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Select a conflict to view details</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
