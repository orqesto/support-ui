import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
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
  markReadPromptOpen: boolean;
  setMarkReadPromptOpen: (open: boolean) => void;
  notCustomerWorkOpen: boolean;
  setNotCustomerWorkOpen: (open: boolean) => void;
  onReject?: () => void;
  onReopen?: () => void;
  onResolveToKB?: () => void;
  /** Bin the thread as not customer work, with the agent's optional words for why. */
  onNotCustomerWork?: (reason: string) => void;
  onCloseThread?: () => void;
  /** Mark the conversation read for the current user, then close the detail. */
  onMarkReadAndClose?: () => void;
  /** Leave the conversation unread and close the detail. */
  onKeepUnreadAndClose?: () => void;
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
  markReadPromptOpen,
  setMarkReadPromptOpen,
  notCustomerWorkOpen,
  setNotCustomerWorkOpen,
  onReject,
  onReopen,
  onResolveToKB,
  onNotCustomerWork,
  onCloseThread,
  onMarkReadAndClose,
  onKeepUnreadAndClose,
}: Props) => {
  const [notCustomerWorkReason, setNotCustomerWorkReason] = useState('');
  return (
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
            This marks the conversation as resolved and saves it to the knowledge base. You can
            reopen it later if needed.
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
            This resolves the conversation without saving it to the knowledge base. It will move to
            the Resolved view; you can reopen it later.
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

      {/* Prompt shown when closing an UNREAD triage thread — "have I reviewed this?" */}
      <Dialog open={markReadPromptOpen} onOpenChange={setMarkReadPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as read?</DialogTitle>
            <DialogClose onClose={() => setMarkReadPromptOpen(false)} />
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You&apos;re closing this conversation while it&apos;s still marked unread. Mark it as
            read so it no longer shows the unread indicator, or keep it unread to review later.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMarkReadPromptOpen(false);
                onKeepUnreadAndClose?.();
              }}
            >
              Keep unread
            </Button>
            <Button
              onClick={() => {
                setMarkReadPromptOpen(false);
                onMarkReadAndClose?.();
              }}
            >
              Mark as read
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notCustomerWorkOpen} onOpenChange={setNotCustomerWorkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not customer work?</DialogTitle>
            <DialogClose onClose={() => setNotCustomerWorkOpen(false)} />
          </DialogHeader>
          {/* ⛔ Says what it is NOT, because the neighbouring dialogs all say "resolve" and an agent
            reading quickly will assume this is another way of doing that. The two consequences
            named here are the two the backend actually enforces. */}
          <p className="text-sm text-muted-foreground">
            This clears the thread off the queue without recording it as a resolution. It will not
            be counted in the resolved statistics, and it cannot be saved to the knowledge base.
            Reopen it later to undo both.
          </p>
          <div className="mt-3">
            <Label htmlFor="not-customer-work-reason">Why? (optional)</Label>
            <Input
              id="not-customer-work-reason"
              value={notCustomerWorkReason}
              onChange={(event) => setNotCustomerWorkReason(event.target.value)}
              placeholder="newsletter, automated notice, our own sent copy…"
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotCustomerWorkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setNotCustomerWorkOpen(false);
                onNotCustomerWork?.(notCustomerWorkReason);
                // Cleared after use: the next thread an agent bins is a different thread, and a
                // reason left in the box would be attributed to it silently.
                setNotCustomerWorkReason('');
              }}
            >
              Not customer work
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
