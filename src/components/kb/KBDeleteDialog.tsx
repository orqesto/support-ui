import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import type { KBEntry } from '@/services/kb.service';

/** The KB list's "Delete KB Entry" confirmation (moved out of KnowledgeBasePage unchanged). */
export const KBDeleteDialog = ({
  open,
  onOpenChange,
  entry,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: KBEntry | null;
  deleting: boolean;
  onConfirm: () => void | Promise<void>;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogHeader>
      <DialogTitle>Delete KB Entry</DialogTitle>
      <DialogClose onClose={() => onOpenChange(false)} />
    </DialogHeader>
    <DialogContent>
      <p>Are you sure you want to delete this entry? This action cannot be undone.</p>
      {entry && (
        <div className="p-3 mt-3 bg-muted rounded-md border border-border">
          <p className="text-sm font-semibold text-foreground">{entry.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Type: <span className="font-medium">{entry.type}</span> | Category:{' '}
            <span className="font-medium">{entry.category}</span>
          </p>
        </div>
      )}
    </DialogContent>
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={() => void onConfirm()} isLoading={deleting}>
        Delete
      </Button>
    </DialogFooter>
  </Dialog>
);
