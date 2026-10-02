import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import type { Message } from '@/types';

/**
 * The one "Delete message" confirm — the inbox slide-over and the full page both open THIS, so the two ways into a message cannot drift into two different questions. What a
 * delete does afterwards (refresh the list, go back to it) stays with each host.
 */
export const DeleteMessageDialog = ({
  open,
  message,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  message: Pick<Message, 'sender' | 'subject'> | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  /*
    ⛔ No way out while the delete is in flight — Esc, the X, the backdrop and Cancel alike. A
    dialog closed mid-request let a second Delete be sent, and the first one's success then acted
    (navigated, closed the thread) after the agent had already dismissed the question.
  */
  const cancel = () => {
    if (!deleting) onCancel();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && cancel()}>
      <DialogHeader>
        <DialogTitle>Delete message</DialogTitle>
        <DialogClose onClose={cancel} />
      </DialogHeader>
      <DialogContent>
        <p>Are you sure you want to delete this message? This action cannot be undone.</p>
        {message && (
          <div className="p-4 mt-4 rounded bg-muted">
            <p className="text-sm font-medium">From: {message.sender}</p>
            {message.subject && (
              <p className="text-sm text-muted-foreground">Subject: {message.subject}</p>
            )}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={cancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} isLoading={deleting}>
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
