import { useState, useEffect } from 'react';
import { ArrowLeft, Link2, Loader2 } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TicketDeleteDialog } from '@/components/tickets/TicketsJiraDialogs';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePermissions } from '@/hooks/usePermissions';
import { ticketService } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { TicketRef } from '@/components/tickets/TicketRef';

export const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAnyPermission } = usePermissions();
  // Create ticket opens it with these when its threads could not be linked or its files could not
  // be uploaded (CreateTicketPage). Read once for this ticket, then dropped from the history
  // entry: it lived there, so it came back on every reload and Back long after they were added.
  const location = useLocation();
  type CreateNotice = { threadsNotLinked?: boolean; filesNotAttached?: boolean } | null;
  const [noticeFor] = useState(() => {
    const state = location.state as CreateNotice;
    return state?.threadsNotLinked === true || state?.filesNotAttached === true
      ? { id, threads: state.threadsNotLinked === true, files: state.filesNotAttached === true }
      : null;
  });
  const threadsNotLinked = noticeFor !== null && noticeFor.id === id && noticeFor.threads;
  const filesNotAttached = noticeFor !== null && noticeFor.id === id && noticeFor.files;
  useEffect(() => {
    const state = location.state as CreateNotice;
    if (state?.threadsNotLinked || state?.filesNotAttached)
      navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
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

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/tickets?id=${ticket?.id ?? ''}`)
      .then(() => toast.success('Link copied'))
      .catch((error: unknown) => toast.failure('copy the link', error));
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
      <>
        <div className="flex justify-center items-center h-64 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading ticket...
        </div>
      </>
    );
  }

  if (!ticket) {
    return (
      <>
        <div className="flex flex-col gap-4 justify-center items-center h-64">
          <div className="text-muted-foreground">{fetchError ?? 'Ticket not found'}</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Tickets
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <ScrollButtons bottomTarget="[data-ticket-actions]" />
      <>
        <div className="px-4 mx-auto space-y-4 w-full">
          {threadsNotLinked && (
            <Alert variant="warning">
              The ticket was created, but its threads could not be linked — add them here.
            </Alert>
          )}
          {filesNotAttached && (
            <Alert variant="warning">
              The ticket was created, but its files could not be attached — add them here.
            </Alert>
          )}

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
            renderChrome={(more, body) => (
              // overflow-clip, not hidden: the tab bar and the sidebar stick to the page's scroll.
              <Card padding="none" className="overflow-clip bg-background">
                <div className="flex gap-1 items-center px-2 h-[46px] border-b border-border bg-card text-[12.5px] text-muted-foreground">
                  <Tooltip content="Back to tickets" size="sm">
                    <Button variant="ghost" size="sm" onClick={handleBack}>
                      <ArrowLeft className="mr-1.5 w-4 h-4" />
                      Tickets
                    </Button>
                  </Tooltip>
                  <span>/</span>
                  <TicketRef ticket={ticket} />
                  <span className="flex-1" />
                  <Tooltip content="Copy link">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Copy link"
                      onClick={handleCopyLink}
                      className="p-0 w-8 h-8"
                    >
                      <Link2 className="w-4 h-4" />
                    </Button>
                  </Tooltip>
                  {more}
                </div>
                {body}
              </Card>
            )}
          />
        </div>
      </>

      <TicketDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        ticketToDelete={ticket}
        deleting={deleting}
        error={deleteError}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  );
};
