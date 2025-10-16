import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { ListCard } from '@/components/ui/ListCard';
import { Drawer } from '@/components/ui/Drawer';
import { TicketDetail } from '@/components/TicketDetail';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ticketService } from '@/services/ticket.service';
import { formatDate } from '@/lib/utils';
import { Ticket, ExternalLink, Send, RefreshCw, Edit2, Trash2, Filter } from 'lucide-react';
import type { Ticket as TicketType, TicketStatus, TicketPriority } from '@/types';
import { Dialog, DialogHeader, DialogTitle, DialogClose, DialogContent, DialogFooter } from '@/components/ui/Dialog';

const statusColors: Record<TicketStatus, 'default' | 'success' | 'warning' | 'danger' | 'secondary'> = {
  pending: 'warning',
  open: 'default',
  in_progress: 'default',
  resolved: 'success',
  closed: 'secondary',
};

const priorityColors: Record<TicketPriority, 'default' | 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'default',
  high: 'warning',
  critical: 'danger',
};

export const TicketsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending'>(
    (searchParams.get('filter') as 'all' | 'pending') || 'all'
  );
  const [syncing, setSyncing] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<TicketType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);

  const handleFilterChange = (newFilter: 'all' | 'pending') => {
    setFilter(newFilter);
    setSearchParams(newFilter === 'pending' ? { filter: 'pending' } : {});
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const response = await ticketService.getAll();
      if (response.success && response.data) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePushToJira = async (ticketId: number) => {
    setSyncing(ticketId);
    try {
      const response = await ticketService.pushToJira(ticketId);
      if (response.success) {
        alert(`Ticket pushed to Jira: ${response.data?.jiraKey}`);
        fetchTickets();
      }
    } catch (error) {
      console.error('Failed to push to Jira:', error);
      alert('Failed to push ticket to Jira');
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    if (!confirm('Sync all unsynced tickets to Jira?')) return;
    
    try {
      const response = await ticketService.syncAllToJira();
      if (response.success) {
        alert(response.message || 'Sync completed');
        fetchTickets();
      }
    } catch (error) {
      console.error('Failed to sync tickets:', error);
      alert('Failed to sync tickets to Jira');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTickets();
    setRefreshing(false);
  };

  const handleDeleteClick = (ticket: TicketType) => {
    setTicketToDelete(ticket);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ticketToDelete) return;
    
    setDeleting(true);
    try {
      await ticketService.delete(ticketToDelete.id);
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
      fetchTickets();
    } catch (error) {
      console.error('Failed to delete ticket:', error);
      alert('Failed to delete ticket');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tickets</h1>
            <p className="text-muted-foreground mt-2">
              Manage and track support tickets
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              isLoading={refreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant={filter === 'all' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('all')}
            >
              <Filter className="h-4 w-4 mr-2" />
              All ({tickets.length})
            </Button>
            <Button
              variant={filter === 'pending' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('pending')}
            >
              <Filter className="h-4 w-4 mr-2" />
              Pending ({tickets.filter(t => t.status === 'pending').length})
            </Button>
            <Button onClick={handleSyncAll} size="sm">
              <Send className="h-4 w-4 mr-2" />
              Sync All to Jira
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tickets found</h3>
              <p className="text-muted-foreground">
                Create a ticket from unprocessed messages
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 w-full">
            {tickets
              .filter(ticket => filter === 'all' || ticket.status === 'pending')
              .map((ticket) => (
              <ListCard
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                header={
                  <>
                    <h3 className="font-semibold text-lg">{ticket.title}</h3>
                    <Badge variant={statusColors[ticket.status]}>
                      {ticket.status}
                    </Badge>
                    <Badge variant={priorityColors[ticket.priority]}>
                      {ticket.priority}
                    </Badge>
                    {ticket.externalId && (
                      <a
                        href={ticket.externalUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {ticket.externalId}
                      </a>
                    )}
                  </>
                }
                content={
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {ticket.description}
                  </p>
                }
                metadata={
                  <>
                    <span>From: {ticket.sender}</span>
                    {ticket.categoryName && <span>• {ticket.categoryName}</span>}
                    <span>• {formatDate(ticket.createdAt)}</span>
                  </>
                }
                actions={
                  <>
                    <Link to={`/tickets/edit/${ticket.id}`}>
                      <Button size="sm" variant="outline">
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </Link>
                    {!ticket.externalId && (
                      <Button
                        size="sm"
                        onClick={() => handlePushToJira(ticket.id)}
                        isLoading={syncing === ticket.id}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Push
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteClick(ticket)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Ticket</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this ticket? This action cannot be undone.</p>
          {ticketToDelete && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <p className="text-sm font-medium">{ticketToDelete.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Status: {ticketToDelete.status} | Priority: {ticketToDelete.priority}
              </p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteConfirm}
            isLoading={deleting}
          >
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Ticket Detail Drawer */}
      {selectedTicket && (
        <Drawer
          open={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          title="Ticket Details"
        >
          <TicketDetail
            ticket={selectedTicket}
            onPushToJira={async () => {
              await handlePushToJira(selectedTicket.id);
              // Refresh to get updated ticket data
              await fetchTickets();
              setSelectedTicket(null);
            }}
            onDelete={() => {
              setTicketToDelete(selectedTicket);
              setSelectedTicket(null);
              setDeleteDialogOpen(true);
            }}
            isPushingToJira={syncing === selectedTicket.id}
          />
        </Drawer>
      )}
    </Layout>
  );
};
