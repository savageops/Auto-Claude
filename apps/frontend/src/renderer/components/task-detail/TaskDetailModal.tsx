import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { TooltipProvider } from '../ui/tooltip';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Play,
  Square,
  CheckCircle2,
  RotateCcw,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Pencil,
  X
} from '@/lib/icons';
import { cn } from '../../lib/utils';
import { calculateProgress } from '../../lib/utils';
import { startTask, stopTask, submitReview, recoverStuckTask, deleteTask } from '../../stores/task-store';
import { TASK_STATUS_LABELS } from '../../../shared/constants';
import { TaskEditDialog } from '../TaskEditDialog';
import { useTaskDetail } from './hooks/useTaskDetail';
import { TaskMetadata } from './TaskMetadata';
import { TaskWarnings } from './TaskWarnings';
import { TaskSubtasks } from './TaskSubtasks';
import { TaskLogs } from './TaskLogs';
import { TaskReview } from './TaskReview';
import type { Task } from '../../../shared/types';

interface TaskDetailModalProps {
  open: boolean;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailModal({ open, task, onOpenChange }: TaskDetailModalProps) {
  // Don't render anything if no task
  if (!task) {
    return null;
  }

  return (
    <TaskDetailModalContent
      open={open}
      task={task}
      onOpenChange={onOpenChange}
    />
  );
}

// Separate component to use hooks only when task exists
function TaskDetailModalContent({ open, task, onOpenChange }: { open: boolean; task: Task; onOpenChange: (open: boolean) => void }) {
  const state = useTaskDetail({ task });
  const progressPercent = calculateProgress(task.subtasks);
  const completedSubtasks = task.subtasks.filter(s => s.status === 'completed').length;
  const totalSubtasks = task.subtasks.length;

  // Event Handlers
  const handleStartStop = () => {
    if (state.isRunning && !state.isStuck) {
      stopTask(task.id);
    } else {
      startTask(task.id);
    }
  };

  const handleRecover = async () => {
    state.setIsRecovering(true);
    const result = await recoverStuckTask(task.id, { autoRestart: true });
    if (result.success) {
      state.setIsStuck(false);
      state.setHasCheckedRunning(false);
    }
    state.setIsRecovering(false);
  };

  const handleReject = async () => {
    if (!state.feedback.trim()) {
      return;
    }
    state.setIsSubmitting(true);
    await submitReview(task.id, false, state.feedback);
    state.setIsSubmitting(false);
    state.setFeedback('');
  };

  const handleDelete = async () => {
    state.setIsDeleting(true);
    state.setDeleteError(null);
    const result = await deleteTask(task.id);
    if (result.success) {
      state.setShowDeleteDialog(false);
      onOpenChange(false);
    } else {
      state.setDeleteError(result.error || 'Failed to delete task');
    }
    state.setIsDeleting(false);
  };

  const handleMerge = async () => {
    state.setIsMerging(true);
    state.setWorkspaceError(null);
    try {
      const result = await window.electronAPI.mergeWorktree(task.id, { noCommit: state.stageOnly });
      if (result.success && result.data?.success) {
        if (state.stageOnly && result.data.staged) {
          state.setWorkspaceError(null);
          state.setStagedSuccess(result.data.message || 'Changes staged in main project');
          state.setStagedProjectPath(result.data.projectPath);
          state.setSuggestedCommitMessage(result.data.suggestedCommitMessage);
        } else {
          onOpenChange(false);
        }
      } else {
        state.setWorkspaceError(result.data?.message || result.error || 'Failed to merge changes');
      }
    } catch (error) {
      state.setWorkspaceError(error instanceof Error ? error.message : 'Unknown error during merge');
    } finally {
      state.setIsMerging(false);
    }
  };

  const handleDiscard = async () => {
    state.setIsDiscarding(true);
    state.setWorkspaceError(null);
    const result = await window.electronAPI.discardWorktree(task.id);
    if (result.success && result.data?.success) {
      state.setShowDiscardDialog(false);
      onOpenChange(false);
    } else {
      state.setWorkspaceError(result.data?.message || result.error || 'Failed to discard changes');
    }
    state.setIsDiscarding(false);
  };

  const handleDiscardFile = async (filePath: string) => {
    state.setWorkspaceError(null);
    state.setDiscardFileSuccess(null);
    state.setIsDiscardingFile(true);

    try {
      const result = await window.electronAPI.discardWorktreeFile(task.id, filePath);
      if (result.success && result.data?.success) {
        // Show success feedback with the file path
        state.setDiscardFileSuccess(filePath);

        // Refresh the diff view to reflect the discarded file
        const diffResult = await window.electronAPI.getWorktreeDiff(task.id);
        if (diffResult.success && diffResult.data) {
          state.setWorktreeDiff(diffResult.data);
        }
        // Also refresh the worktree status since file count may have changed
        const statusResult = await window.electronAPI.getWorktreeStatus(task.id);
        if (statusResult.success && statusResult.data) {
          state.setWorktreeStatus(statusResult.data);
        }
        // Refresh merge preview if it was loaded
        if (state.mergePreview) {
          state.loadMergePreview();
        }

        // Clear success message after 3 seconds
        setTimeout(() => {
          state.setDiscardFileSuccess(null);
        }, 3000);
      } else {
        state.setWorkspaceError(result.data?.message || result.error || 'Failed to discard file changes');
      }
    } catch (error) {
      state.setWorkspaceError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      state.setIsDiscardingFile(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Render primary action button based on state
  const renderPrimaryAction = () => {
    if (state.isStuck) {
      return (
        <Button
          variant="ghost"
          onClick={handleRecover}
          disabled={state.isRecovering}
          className="bg-primary/20 hover:bg-primary/30 text-primary"
        >
          {state.isRecovering ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Recovering...
            </>
          ) : (
            <>
              <RotateCcw className="mr-2 h-4 w-4" />
              Recover Task
            </>
          )}
        </Button>
      );
    }

    if (state.isIncomplete) {
      return (
        <Button variant="ghost" onClick={handleStartStop} className="bg-primary/80 hover:bg-primary/90 text-background">
          <Play className="mr-2 h-4 w-4" />
          Resume Task
        </Button>
      );
    }

    if (task.status === 'backlog' || task.status === 'in_progress') {
      return (
        <Button
          variant="ghost"
          onClick={handleStartStop}
          className={state.isRunning ? 'bg-primary/30 hover:bg-primary/40 text-primary' : 'bg-primary/80 hover:bg-primary/90 text-background'}
        >
          {state.isRunning ? (
            <>
              <Square className="mr-2 h-4 w-4" />
              Stop Task
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start Task
            </>
          )}
        </Button>
      );
    }

    if (task.status === 'done') {
      return (
        <div className="completion-state text-sm flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Task completed</span>
        </div>
      );
    }

    return null;
  };


  return (
    <TooltipProvider delayDuration={300}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          {/* Semi-transparent overlay - can see background content */}
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/60',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
            )}
          />

          {/* Full-height centered modal content */}
          <DialogPrimitive.Content
            className={cn(
              'fixed left-[50%] top-4 z-50',
              'translate-x-[-50%]',
              'w-[95vw] max-w-5xl h-[calc(100vh-32px)]',
              'bg-card border border-border rounded-xl',
              'shadow-2xl overflow-hidden flex flex-col',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'duration-200'
            )}
          >
            {/* Header */}
            <div className="p-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 overflow-hidden">
                  <DialogPrimitive.Title className="text-xl font-semibold leading-tight text-foreground truncate">
                    {task.title}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description asChild>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-mono">
                        {task.specId}
                      </Badge>
                      {state.isStuck ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/20 text-primary border-primary/30 animate-pulse">
                          <AlertTriangle className="h-3 w-3" />
                          Stuck
                        </Badge>
                      ) : state.isIncomplete ? (
                        <>
                          <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/20 text-primary border-primary/30">
                            <AlertTriangle className="h-3 w-3" />
                            Incomplete
                          </Badge>
                        </>
                      ) : (
                        <>
                          <Badge
                            variant={task.status === 'done' ? 'success' : task.status === 'human_review' ? 'purple' : task.status === 'in_progress' ? 'info' : 'secondary'}
                            className={cn('text-xs', (task.status === 'in_progress' && !state.isStuck) && 'status-running')}
                          >
                            {TASK_STATUS_LABELS[task.status]}
                          </Badge>
                          {task.status === 'human_review' && task.reviewReason && (
                            <Badge
                              variant={task.reviewReason === 'completed' ? 'success' :task.reviewReason === 'errors' ? 'destructive' : 'warning'}
                              className="text-xs"
                            >
                              {task.reviewReason === 'completed' ? 'Completed' :
                               task.reviewReason === 'errors' ? 'Has Errors' :
                               task.reviewReason === 'plan_review' ? 'Approve Plan' : 'QA Issues'}
                            </Badge>
                          )}
                        </>
                      )}
                      {/* Compact progress indicator */}
                      {totalSubtasks > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {completedSubtasks}/{totalSubtasks} subtasks
                        </span>
                      )}
                    </div>
                  </DialogPrimitive.Description>
                </div>
                <div className="flex items-center gap-1 shrink-0 electron-no-drag">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={() => state.setIsEditDialogOpen(true)}
                    disabled={state.isRunning && !state.isStuck}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DialogPrimitive.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:bg-muted transition-colors"
                    >
                      <X className="h-5 w-5" />
                      <span className="sr-only">Close</span>
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </div>

              {/* Progress bar - only show when running or has progress */}
              {(state.isRunning || completedSubtasks > 0) && totalSubtasks > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={progressPercent} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{progressPercent}%</span>
                </div>
              )}

              {/* Warnings - compact inline */}
              {(state.isStuck || state.isIncomplete) && (
                <div className="mt-3">
                  <TaskWarnings
                    isStuck={state.isStuck}
                    isIncomplete={state.isIncomplete}
                    isRecovering={state.isRecovering}
                    taskProgress={state.taskProgress}
                    onRecover={handleRecover}
                    onResume={handleStartStop}
                  />
                </div>
              )}
            </div>

            {/* Body - Single Column with Tabs */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Tabs value={state.activeTab} onValueChange={state.setActiveTab} className="flex flex-col h-full">
                <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-5 h-auto shrink-0">
                  <TabsTrigger
                    value="overview"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="subtasks"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                  >
                    Subtasks ({task.subtasks.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                  >
                    Logs
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="flex-1 min-h-0 overflow-hidden mt-0">
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-5">
                      {/* Metadata */}
                      <TaskMetadata task={task} />

                      {/* Human Review Section */}
                      {state.needsReview && (
                        <>
                          <Separator />
                          <TaskReview
                            task={task}
                            feedback={state.feedback}
                            isSubmitting={state.isSubmitting}
                            worktreeStatus={state.worktreeStatus}
                            worktreeDiff={state.worktreeDiff}
                            isLoadingWorktree={state.isLoadingWorktree}
                            isMerging={state.isMerging}
                            isDiscarding={state.isDiscarding}
                            isDiscardingFile={state.isDiscardingFile}
                            showDiscardDialog={state.showDiscardDialog}
                            showDiffDialog={state.showDiffDialog}
                            workspaceError={state.workspaceError}
                            discardFileSuccess={state.discardFileSuccess}
                            stageOnly={state.stageOnly}
                            stagedSuccess={state.stagedSuccess}
                            stagedProjectPath={state.stagedProjectPath}
                            suggestedCommitMessage={state.suggestedCommitMessage}
                            mergePreview={state.mergePreview}
                            isLoadingPreview={state.isMergePreviewLoading}
                            showConflictDialog={state.showConflictDialog}
                            onFeedbackChange={state.setFeedback}
                            onReject={handleReject}
                            onMerge={handleMerge}
                            onDiscard={handleDiscard}
                            onDiscardFile={handleDiscardFile}
                            onShowDiscardDialog={state.setShowDiscardDialog}
                            onShowDiffDialog={state.setShowDiffDialog}
                            onStageOnlyChange={state.setStageOnly}
                            onShowConflictDialog={state.setShowConflictDialog}
                            onLoadMergePreview={state.loadMergePreview}
                            onRefreshDiff={state.refreshDiff}
                            onClose={handleClose}
                          />
                        </>
                      )}

                      {/* Workspace Changes (when not in review) */}
                      {!state.needsReview && state.worktreeStatus && (
                        <>
                          <Separator />
                          <TaskReview
                            task={task}
                            feedback={state.feedback}
                            isSubmitting={state.isSubmitting}
                            worktreeStatus={state.worktreeStatus}
                            worktreeDiff={state.worktreeDiff}
                            isLoadingWorktree={state.isLoadingWorktree}
                            isMerging={state.isMerging}
                            isDiscarding={state.isDiscarding}
                            isDiscardingFile={state.isDiscardingFile}
                            showDiscardDialog={state.showDiscardDialog}
                            showDiffDialog={state.showDiffDialog}
                            workspaceError={state.workspaceError}
                            discardFileSuccess={state.discardFileSuccess}
                            stageOnly={state.stageOnly}
                            stagedSuccess={state.stagedSuccess}
                            stagedProjectPath={state.stagedProjectPath}
                            suggestedCommitMessage={state.suggestedCommitMessage}
                            mergePreview={state.mergePreview}
                            isLoadingPreview={state.isMergePreviewLoading}
                            showConflictDialog={state.showConflictDialog}
                            onFeedbackChange={state.setFeedback}
                            onReject={handleReject}
                            onMerge={handleMerge}
                            onDiscard={handleDiscard}
                            onDiscardFile={handleDiscardFile}
                            onShowDiscardDialog={state.setShowDiscardDialog}
                            onShowDiffDialog={state.setShowDiffDialog}
                            onStageOnlyChange={state.setStageOnly}
                            onShowConflictDialog={state.setShowConflictDialog}
                            onLoadMergePreview={state.loadMergePreview}
                            onRefreshDiff={state.refreshDiff}
                            onClose={handleClose}
                          />
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Subtasks Tab */}
                <TabsContent value="subtasks" className="flex-1 min-h-0 overflow-hidden mt-0">
                  <ScrollArea className="h-full">
                    <div className="p-5">
                      <TaskSubtasks subtasks={task.subtasks} />
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs" className="flex-1 min-h-0 overflow-hidden mt-0">
                  <TaskLogs taskId={task.id} />
                </TabsContent>
              </Tabs>
            </div>

            {/* Footer with Action Buttons */}
            <div className="shrink-0 border-t border-border px-5 py-4 flex items-center justify-between bg-card">
              <div className="flex items-center gap-3 flex-1">
                {state.isEditDialogOpen && (
                  <TaskEditDialog
                    task={task}
                    open={state.isEditDialogOpen}
                    onOpenChange={state.setIsEditDialogOpen}
                  />
                )}

                {/* Delete Button */}
                <AlertDialog open={state.showDeleteDialog} onOpenChange={state.setShowDeleteDialog}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => state.setShowDeleteDialog(true)}
                    disabled={state.isDeleting}
                  >
                    {state.isDeleting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Task
                      </>
                    )}
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Task</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the task and its associated worktree.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {state.deleteError && (
                  <div className="text-sm text-destructive flex-1">{state.deleteError}</div>
                )}
              </div>

              {/* Primary action button on the right */}
              <div className="flex items-center gap-3 ml-auto">
                {renderPrimaryAction()}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </TooltipProvider>
  );
}