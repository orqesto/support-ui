import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ScrollButtons } from '@/components/ScrollButtons';
import { TicketDetail } from '@/components/TicketDetail';
import { Button } from '@/components/ui/Button';
import { ticketService } from '@/services/ticket.service';
import type { Ticket } from '@/types';

export const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

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
            <TicketDetail
              ticket={ticket}
              onDelete={handleBack}
            />
          </div>
        </div>
      </Layout>
    </>
  );
};
