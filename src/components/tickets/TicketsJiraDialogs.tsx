import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/components/tickets/list/ticketFilterKeys';
import type { TicketPriority, TicketStatus } from '@/types';
import { TicketRef } from '@/components/tickets/TicketRef';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketToDelete: {
    id?: number;
    reference?: string | null;
    title: string;
    status: string;
    priority: string;
  } | null;
  deleting: boolean;
  /** Why the last attempt failed, shown under the ticket. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Delete a ticket — and say what happens to its threads (they stay; only the link goes). */
export function TicketDeleteDialog({
  open,
  onOpenChange,
  ticketToDelete,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Delete this ticket?</DialogTitle>
        <DialogClose onClose={onCancel} />
      </DialogHeader>
      <DialogContent>
        <p className="text-sm">
          This can’t be undone. Its threads stay in the inbox; they just lose the link to this
          ticket.
        </p>
        {ticketToDelete && (
          <div className="p-3 mt-3 rounded-lg border bg-muted border-border">
            <p className="text-sm font-semibold text-foreground">
              {ticketToDelete.id !== undefined && (
                <TicketRef
                  ticket={{ id: ticketToDelete.id, reference: ticketToDelete.reference }}
                  className="mr-1.5 font-normal text-muted-foreground"
                />
              )}
              {ticketToDelete.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {STATUS_LABELS[ticketToDelete.status as TicketStatus] ?? ticketToDelete.status} ·{' '}
              {PRIORITY_LABELS[ticketToDelete.priority as TicketPriority] ??
                ticketToDelete.priority}{' '}
              priority
            </p>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} isLoading={deleting}>
          Delete ticket
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TicketSyncAllDialog({ open, onOpenChange, onCancel, onConfirm }: SyncDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Sync All Tickets to Jira</DialogTitle>
        <DialogClose onClose={onCancel} />
      </DialogHeader>
      <DialogContent>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to sync all unsynced tickets to Jira?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This will create Jira issues for all tickets that haven&apos;t been synced yet.
        </p>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>
          <RefreshCw className="mr-2 w-4 h-4" />
          Sync All
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
