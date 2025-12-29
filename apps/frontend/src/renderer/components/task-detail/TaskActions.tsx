import { Play, Square, CheckCircle2, RotateCcw, Trash2, RefreshCw, AlertTriangle } from '@/lib/icons';
import { Button } from '../ui/button';
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
import type { Task } from '../../../shared/types';

interface TaskActionsProps {
  task: Task;
  isStuck: boolean;
  isIncomplete: boolean;
  isRunning: boolean;
  isRecovering: boolean;
  showDeleteDialog: boolean;
  isDeleting: boolean;
  deleteError: string | null;
  showRestartDialog: boolean;
  isRestarting: boolean;
  restartError: string | null;
  onStartStop: () => void;
  onRecover: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onShowDeleteDialog: (show: boolean) => void;
  onShowRestartDialog: (show: boolean) => void;
}

export function TaskActions({
  task,
  isStuck,
  isIncomplete,
  isRunning,
  isRecovering,
  showDeleteDialog,
  isDeleting,
  deleteError,
  showRestartDialog,
  isRestarting,
  restartError,
  onStartStop,
  onRecover,
  onDelete,
  onRestart,
  onShowDeleteDialog,
  onShowRestartDialog
}: TaskActionsProps) {
  return (
    <>
      <div className="p-4">
        {isStuck ? (
          <Button
            className="w-full bg-primary/20 hover:bg-primary/30 text-primary"
            variant="ghost"
            onClick={onRecover}
            disabled={isRecovering}
          >
            {isRecovering ? (
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
        ) : isIncomplete ? (
          <Button
            className="w-full bg-primary/80 hover:bg-primary/90 text-background"
            variant="ghost"
            onClick={onStartStop}
          >
            <Play className="mr-2 h-4 w-4" />
            Resume Task
          </Button>
        ) : (task.status === 'backlog' || task.status === 'in_progress') && (
          <Button
            className={`w-full ${isRunning
              ? 'bg-primary/30 hover:bg-primary/40 text-primary'
              : 'bg-primary/80 hover:bg-primary/90 text-background'
              }`}
            variant="ghost"
            onClick={onStartStop}
          >
            {isRunning ? (
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
        )}
        {task.status === 'done' && (
          <div className="completion-state text-sm">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Task completed successfully</span>
          </div>
        )}

        {/* Restart Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-orange-500 hover:bg-orange-500/10 hover:text-orange-600"
          onClick={() => onShowRestartDialog(true)}
          disabled={isDeleting || isRecovering}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart Task
        </Button>

        {/* Delete Button - always visible but disabled when running */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-1 text-muted-foreground hover:bg-muted hover:text-foreground/70"
          onClick={() => onShowDeleteDialog(true)}
          disabled={isRunning && !isStuck}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Task
        </Button>
      </div>

      {/* Restart Confirmation Dialog */}
      <AlertDialog open={showRestartDialog} onOpenChange={onShowRestartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Restart Task?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  Are you sure you want to restart <strong className="text-foreground">"{task.title}"</strong>?
                </p>
                <p className="text-orange-500">
                  This will delete all progress (execution logs, implementation plan) and start fresh from the current main branch.
                  Your original task request (spec) will be preserved.
                </p>
                {restartError && (
                  <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-sm">
                    {restartError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestarting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onRestart();
              }}
              disabled={isRestarting}
              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-500"
            >
              {isRestarting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Restarting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Confirm Restart
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={onShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Task
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  Are you sure you want to delete <strong className="text-foreground">"{task.title}"</strong>?
                </p>
                <p className="text-destructive">
                  This action cannot be undone. All task files, including the spec, implementation plan, and any generated code will be permanently deleted from the project.
                </p>
                {deleteError && (
                  <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-sm">
                    {deleteError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={isDeleting}
              className="bg-primary/30 hover:bg-primary/40 text-primary"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}