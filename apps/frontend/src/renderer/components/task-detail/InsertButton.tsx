import { Plus } from '../../lib/icons';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface InsertButtonProps {
    taskId: string;
    onClick: () => void;
    className?: string;
}

export function InsertButton({ taskId, onClick, className }: InsertButtonProps) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className={cn(
                "h-6 px-2 text-xs font-medium text-muted-foreground",
                "flex items-center gap-1 transition-all duration-200",
                className
            )}
        >
            <Plus className="h-3.5 w-3.5" />
            <span>Insert Instruction</span>
        </Button>
    );
}
