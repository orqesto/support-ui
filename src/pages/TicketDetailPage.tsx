import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { ticketService } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';

export const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAnyPermission } = usePermissions();
  // New ticket opens it with this when its threads could not be linked (NewTicketButton).
  const threadsNotLinked =
    (useLocation().state as { threadsNotLinked?: boolean } | null)?.threadsNotLinked === true;
  const clearCache = useTicketsStore((state) => state.clearCache);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const numId = id ? parseInt(id, 10) : NaN;
    if (id && !isNaN(numId)) {
      void fetchTicket(numId);
    } else {
      setLoading(false);
    }
  }, [id]);

  const fetchTicket = async (ticketId: number) => {
    try {
      setLoading(true);
      setFetchError(null);
      const response = await ticketService.getById(ticketId);
      if (response.success && response.data) {
        setTicket(response.data);
      } else {
        setFetchError('Ticket not found');
      }
    } catch (error) {
      logger.error('Failed to fetch ticket:', error);
      setFetchError('Failed to load ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // A quiet reload after an edit (title, description): no loading screen, so the open tab stays.
  const refreshTicket = async () => {
    if (!ticket) return;
    const response = await ticketService.getById(ticket.id);
    if (response.success && response.data) setTicket(response.data);
  };

  const handleBack = () => {
    navigate('/tickets');
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ticket) return;

    try {
      setDeleting(true);
      await ticketService.delete(ticket.id);
      clearCache(); // Clear cache to refresh tickets list
      setDeleteDialogOpen(false);
      navigate('/tickets');
    } catch (error) {
      logger.error('Failed to delete ticket:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete ticket');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading ticket...
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 justify-center items-center h-64">
          <div className="text-muted-foreground">{fetchError ?? 'Ticket not found'}</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Tickets
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <ScrollButtons bottomTarget="[data-ticket-actions]" />
      <Layout>
        <div className="px-4 mx-auto space-y-4 w-full">
          <div className="flex gap-2 items-center">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <h1 className="font-display text-2xl font-bold">Ticket Details</h1>
          </div>

          {threadsNotLinked && (
            <Alert variant="warning">
              The ticket was created, but its threads could not be linked — add them here.
            </Alert>
          )}

          <div className="p-6 rounded-lg border bg-card">
            <TicketDetail
              key={ticket.id}
              ticket={ticket}
              // Deleting needs DELETE_TICKETS or MANAGE_ORGANIZATION, as the route (and the list's
              // Delete): support and moderators manage tickets but were offered a Delete it refused.
              onDelete={
                hasAnyPermission([Permission.DELETE_TICKETS, Permission.MANAGE_ORGANIZATION])
                  ? handleDeleteClick
                  : undefined
              }
              onRefresh={refreshTicket}
            />
          </div>
        </div>
      </Layout>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Ticket</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this ticket? This action cannot be undone.</p>
          {ticket && (
            <div className="p-3 mt-3 bg-muted rounded-md border border-border">
              <p className="text-sm font-semibold text-foreground">
                {ticket.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status: <span className="font-medium">{ticket.status}</span> | Priority:{' '}
                <span className="font-medium">{ticket.priority}</span>
              </p>
            </div>
          )}
          {deleteError && (
            <p className="mt-2 text-sm text-destructive">{deleteError}</p>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteConfirm} isLoading={deleting}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
};
