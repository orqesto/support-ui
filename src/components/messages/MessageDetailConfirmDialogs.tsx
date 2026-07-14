import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import type { Message } from '@/types';

type Props = {
  message: Message;
  rejectDialogOpen: boolean;
  setRejectDialogOpen: (open: boolean) => void;
  reopenDialogOpen: boolean;
  setReopenDialogOpen: (open: boolean) => void;
  resolveConfirmOpen: boolean;
  setResolveConfirmOpen: (open: boolean) => void;
  closeConfirmOpen: boolean;
  setCloseConfirmOpen: (open: boolean) => void;
  onReject?: () => void;
  onReopen?: () => void;
  onResolveToKB?: () => void;
  onCloseThread?: () => void;
};

export const MessageDetailConfirmDialogs = ({
  message,
  rejectDialogOpen,
  setRejectDialogOpen,
  reopenDialogOpen,
  setReopenDialogOpen,
  resolveConfirmOpen,
  setResolveConfirmOpen,
  closeConfirmOpen,
  setCloseConfirmOpen,
  onReject,
  onReopen,
  onResolveToKB,
  onCloseThread,
}: Props) => (
  <>
    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Processed?</DialogTitle>
          <DialogClose onClose={() => setRejectDialogOpen(false)} />
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Mark this message as processed without creating a ticket? This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setRejectDialogOpen(false);
              onReject?.();
            }}
          >
            Mark as Processed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {message.status === 'resolved' ? 'Unresolve Message?' : 'Reopen Message?'}
          </DialogTitle>
          <DialogClose onClose={() => setReopenDialogOpen(false)} />
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This reopens the message and removes any KB entries created from it. It returns to its
          previous column (Active / Awaiting / Replied) based on the last message.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setReopenDialogOpen(false);
              onReopen?.();
            }}
          >
            {message.status === 'resolved' ? 'Unresolve & Clean Up' : 'Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={resolveConfirmOpen} onOpenChange={setResolveConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve &amp; Save to KB?</DialogTitle>
          <DialogClose onClose={() => setResolveConfirmOpen(false)} />
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This marks the conversation as resolved and saves it to the knowledge base. You can reopen
          it later if needed.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResolveConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setResolveConfirmOpen(false);
              onResolveToKB?.();
            }}
          >
            Resolve &amp; Save to KB
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve without saving to KB?</DialogTitle>
          <DialogClose onClose={() => setCloseConfirmOpen(false)} />
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This resolves the conversation without saving it to the knowledge base. It will move to the
          Resolved view; you can reopen it later.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setCloseConfirmOpen(false);
              onCloseThread?.();
            }}
          >
            Resolve (no KB)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
