import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
  ticketToDelete: { title: string; status: string; priority: string } | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TicketDeleteDialog({ open, onOpenChange, ticketToDelete, deleting, onCancel, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Delete Ticket</DialogTitle>
        <DialogClose onClose={onCancel} />
      </DialogHeader>
      <DialogContent>
        <p>Are you sure you want to delete this ticket? This action cannot be undone.</p>
        {ticketToDelete && (
          <div className="p-3 mt-3 bg-gray-50 rounded-md border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ticketToDelete.title}</p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Status: <span className="font-medium">{ticketToDelete.status}</span> | Priority:{' '}
              <span className="font-medium">{ticketToDelete.priority}</span>
            </p>
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={deleting}>Cancel</Button>
        <Button variant="destructive" onClick={onConfirm} isLoading={deleting}>Delete</Button>
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
        <p className="text-sm text-gray-700">Are you sure you want to sync all unsynced tickets to Jira?</p>
        <p className="mt-2 text-sm text-gray-500">This will create Jira issues for all tickets that haven&apos;t been synced yet.</p>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm}><RefreshCw className="mr-2 w-4 h-4" />Sync All</Button>
      </DialogFooter>
    </Dialog>
  );
}
