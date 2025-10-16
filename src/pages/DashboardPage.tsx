import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Inbox, Ticket as TicketIcon, PlayCircle, Mail, Clock, CheckCircle } from 'lucide-react';
import { ingestionService } from '../services/ingestion.service';
import { messageService } from '../services/message.service';
import { ticketService } from '../services/ticket.service';
import { EmailProcessingProgress } from '../components/EmailProcessingProgress';
import type { Message, Ticket } from '../types';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalMessages: 0,
    unprocessedMessages: 0,
    totalTickets: 0,
    pendingTickets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [messagesResponse, ticketsResponse] = await Promise.all([
          messageService.getAll(),
          ticketService.getAll(),
        ]);

        if (messagesResponse.success && messagesResponse.data) {
          const messages = messagesResponse.data;
          setStats(prev => ({
            ...prev,
            totalMessages: messages.length,
            unprocessedMessages: messages.filter((m: Message) => !m.processed).length,
          }));
        }

        if (ticketsResponse.success && ticketsResponse.data) {
          const tickets = ticketsResponse.data;
          setStats(prev => ({
            ...prev,
            totalTickets: tickets.length,
            pendingTickets: tickets.filter((t: Ticket) => t.status === 'pending').length,
          }));
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const handleIngestion = async (type: 'all' | 'email' | 'telegram' | 'check-email') => {
    setIngesting(type);
    try {
      let response;
      switch (type) {
        case 'all':
          response = await ingestionService.startAll();
          break;
        case 'email':
          response = await ingestionService.startEmail();
          break;
        case 'telegram':
          response = await ingestionService.startTelegram();
          break;
        case 'check-email':
          response = await ingestionService.checkEmails();
          break;
      }
      if (response.success) {
        const message = response.message || 'Ingestion started successfully';
        const note = (response as { note?: string }).note;
        
        if (note) {
          alert(`${message}\n\n${note}`);
        } else {
          alert(message);
        }
      }
    } catch (error) {
      console.error('Failed to start ingestion:', error);
      alert('Failed to start ingestion');
    } finally {
      setIngesting(null);
    }
  };

  const statCards = [
    {
      title: 'Total Messages',
      value: stats.totalMessages,
      icon: Mail,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      onClick: () => navigate('/messages'),
    },
    {
      title: 'Unprocessed Messages',
      value: stats.unprocessedMessages,
      icon: Clock,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      onClick: () => navigate('/messages?filter=unprocessed'),
    },
    {
      title: 'Total Tickets',
      value: stats.totalTickets,
      icon: TicketIcon,
      color: 'text-green-600',
      bg: 'bg-green-50',
      onClick: () => navigate('/tickets'),
    },
    {
      title: 'Pending Tickets',
      value: stats.pendingTickets,
      icon: CheckCircle,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      onClick: () => navigate('/tickets?filter=pending'),
    },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Real-time overview of your support operations
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
                  <div className="w-24 h-4 bg-gray-200 rounded" />
                  <div className="w-10 h-10 bg-gray-200 rounded" />
                </CardHeader>
                <CardContent>
                  <div className="w-16 h-8 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card 
                  key={stat.title}
                  onClick={stat.onClick}
                  className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
                  style={{ borderLeftColor: stat.color.replace('text-', '') }}
                >
                  <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                      {stat.title}
                    </CardTitle>
                    <div className={`${stat.bg} p-2.5 rounded-xl group-hover:scale-110 transition-transform`}>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stat.title === 'Unprocessed Messages' && stats.unprocessedMessages > 0 && '⚠️ Needs attention'}
                      {stat.title === 'Pending Tickets' && stats.pendingTickets > 0 && '⏳ Awaiting response'}
                      {(stat.title === 'Total Messages' || stat.title === 'Total Tickets') && '📊 All time'}
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Ingestion Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Primary Actions */}
          <Card className="bg-gradient-to-br to-transparent border-primary/20 from-primary/5">
            <CardHeader>
              <CardTitle className="flex gap-2 items-center">
                <PlayCircle className="w-5 h-5 text-primary" />
                Quick Actions
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Start all services or trigger specific ingestion channels
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => handleIngestion('all')}
                isLoading={ingesting === 'all'}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                <PlayCircle className="mr-2 w-5 h-5" />
                Start All Services
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleIngestion('email')}
                  isLoading={ingesting === 'email'}
                  className="w-full"
                >
                  <Mail className="mr-2 w-4 h-4" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleIngestion('telegram')}
                  isLoading={ingesting === 'telegram'}
                  className="w-full"
                >
                  <Inbox className="mr-2 w-4 h-4" />
                  Telegram
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status & Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex gap-2 items-center">
                <Inbox className="w-5 h-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex gap-2 items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium">Email Service</span>
                  </div>
                  <span className="text-xs font-medium text-green-700">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex gap-2 items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium">WebSocket</span>
                  </div>
                  <span className="text-xs font-medium text-blue-700">Connected</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex gap-2 items-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    <span className="text-sm font-medium">AI Processing</span>
                  </div>
                  <span className="text-xs font-medium text-gray-600">Ready</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => handleIngestion('check-email')}
                isLoading={ingesting === 'check-email'}
                className="w-full"
                size="sm"
              >
                <Mail className="mr-2 w-4 h-4" />
                Check Emails Manually
              </Button>
            </CardContent>
          </Card>
        </div>
                {/* Real-time Email Processing Progress */}
        <EmailProcessingProgress />
      </div>
    </Layout>
  );
};
