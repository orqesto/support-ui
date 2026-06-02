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
  onReject?: () => void;
  onReopen?: () => void;
};

export const MessageDetailConfirmDialogs = ({
  message,
  rejectDialogOpen,
  setRejectDialogOpen,
  reopenDialogOpen,
  setReopenDialogOpen,
  onReject,
  onReopen,
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
            {message.status === 'resolved' ? 'Unresolve Message?' : 'Unprocess Message?'}
          </DialogTitle>
          <DialogClose onClose={() => setReopenDialogOpen(false)} />
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will mark the message as unprocessed and remove any KB entries created from it.
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
            {message.status === 'resolved' ? 'Unresolve & Clean Up' : 'Unprocess & Clean Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
