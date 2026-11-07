import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import type { KBEntry } from '@/features/kb/services/kb.service';

/** The KB list's "Delete KB Entry" confirmation (moved out of KnowledgeBasePage unchanged). */
export const KBDeleteDialog = ({
  open,
  onOpenChange,
  entry,
  deleting,
  onConfirm,
  restorable = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: KBEntry | null;
  deleting: boolean;
  onConfirm: () => void | Promise<void>;
  /**
   * The backend keeps a deleted entry 90 days (soft delete, `filters.deletedStatus`). Without it
   * the delete is for good and the dialog says so.
   */
  restorable?: boolean;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogHeader>
      <DialogTitle>Delete KB Entry</DialogTitle>
      <DialogClose onClose={() => onOpenChange(false)} />
    </DialogHeader>
    <DialogContent>
      <p>
        {restorable
          ? 'Delete this entry? The AI stops using it at once. You can restore it from Deleted for 90 days; after that it is gone for good.'
          : 'Are you sure you want to delete this entry? This action cannot be undone.'}
      </p>
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
