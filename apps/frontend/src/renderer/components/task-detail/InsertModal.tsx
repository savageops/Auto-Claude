import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface InsertModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (instruction: string) => Promise<void>;
}

export function InsertModal({ isOpen, onClose, onSubmit }: InsertModalProps) {
    const [instruction, setInstruction] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!instruction.trim()) return;

        try {
            setIsSubmitting(true);
            await onSubmit(instruction);
            setInstruction('');
            onClose();
        } catch (error) {
            console.error('Failed to submit instruction:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] gap-6">
                <DialogHeader>
                    <DialogTitle>Insert User Instruction</DialogTitle>
                    <DialogDescription>
                        Inject a new instruction or feedback into the task stream.
                        The agent will see this as user input.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                    <Textarea
                        placeholder="Type your instruction or feedback here... (Cmd+Enter to submit)"
                        className="min-h-[120px] resize-none bg-secondary/20 border-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSubmitting}
                        autoFocus
                    />
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!instruction.trim() || isSubmitting}>
                        {isSubmitting ? 'Inserting...' : 'Insert Instruction'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
