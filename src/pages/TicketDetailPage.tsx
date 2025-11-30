import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { ticketService } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';

export const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clearCache = useTicketsStore((state) => state.clearCache);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      void fetchTicket(parseInt(id));
    }
  }, [id]);

  const fetchTicket = async (ticketId: number) => {
    try {
      setLoading(true);
      const response = await ticketService.getById(ticketId);
      if (response.success && response.data) {
        setTicket(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
    } finally {
      setLoading(false);
    }
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
      console.error('Failed to delete ticket:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading ticket...</div>
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 justify-center items-center h-64">
          <div className="text-muted-foreground">Ticket not found</div>
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
        <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
          <div className="flex gap-2 items-center">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Ticket Details</h1>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <TicketDetail ticket={ticket} onDelete={handleDeleteClick} />
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
            <div className="p-3 mt-3 bg-gray-50 rounded-md border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {ticket.title}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Status: <span className="font-medium">{ticket.status}</span> | Priority:{' '}
                <span className="font-medium">{ticket.priority}</span>
              </p>
            </div>
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
