import { useEffect, useState, useRef } from 'react';
import {
  Inbox,
  Ticket as TicketIcon,
  PlayCircle,
  Mail,
  Clock,
  CheckCircle,
  AlertTriangle,
  Hourglass,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { useTelegramProcessing } from '@/hooks/useTelegramProcessing';
import { getSocket } from '@/lib/socketManager';
import { ingestionService } from '@/services/ingestion.service';
import { integrationsService } from '@/services/integrations.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';

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
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [hasMessageSources, setHasMessageSources] = useState(false);
  const [hasEmailIntegrations, setHasEmailIntegrations] = useState(false);
  const [hasTelegramIntegrations, setHasTelegramIntegrations] = useState(false);

  // Ref to track polling interval for cleanup
  const pollingIntervalRef = useRef<number | null>(null);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  // Get real-time system health
  const { health, isWebSocketConnected } = useSystemHealth();

  // Get messages store cache clear function
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  // Get current user's department for filtering
  const selectedDepartment = useAuthStore((state) => state.selectedDepartmentRole);

  // Subscribe to email processing events to auto-refresh on completion
  // Filter by department to only show processing for user's department
  const {
    status: processingStatus,
    processed: processedCount,
    isProcessing,
  } = useEmailProcessing(true, selectedDepartment ?? undefined);
  const prevProcessingStatus = useRef(processingStatus);

  // Subscribe to telegram processing events
  const { isProcessing: isTelegramProcessing, totalProcessed: telegramProcessedCount } =
    useTelegramProcessing(true);
  const prevIsTelegramProcessing = useRef(isTelegramProcessing);

  // Auto-refresh stats when email processing completes
  useEffect(() => {
    // Detect transition from processing to complete
    if (
      prevProcessingStatus.current === 'processing' &&
      processingStatus === 'complete' &&
      processedCount > 0
    ) {
      // Clear caches to force fresh data fetch
      clearMessagesCache();

      // Refresh dashboard stats
      fetchStats().catch((error) => {
        console.error('Failed to refresh stats after processing:', error);
      });
    }
    prevProcessingStatus.current = processingStatus;
  }, [processingStatus, processedCount, clearMessagesCache]);

  // Auto-refresh stats when telegram processing completes
  useEffect(() => {
    // Detect transition from processing to complete
    if (prevIsTelegramProcessing.current && !isTelegramProcessing && telegramProcessedCount > 0) {
      // Clear caches to force fresh data fetch
      clearMessagesCache();

      // Refresh dashboard stats
      fetchStats().catch((error) => {
        console.error('Failed to refresh stats after processing:', error);
      });
    }
    prevIsTelegramProcessing.current = isTelegramProcessing;
  }, [isTelegramProcessing, telegramProcessedCount, clearMessagesCache]);

  const fetchStats = async () => {
    try {
      // Fetch all data without pagination limits to get accurate counts
      const [
        allMessagesResponse,
        unprocessedMessagesResponse,
        allTicketsResponse,
        pendingTicketsResponse,
      ] = await Promise.all([
        messageService.getAll(undefined, 1, 9999), // Get total count from pagination
        messageService.getAll({ processed: 'unprocessed' }, 1, 9999),
        ticketService.getAll(undefined, 1, 9999),
        ticketService.getAll({ status: 'pending' }, 1, 9999),
      ]);

      if (allMessagesResponse.success) {
        setStats((prev) => ({
          ...prev,
          totalMessages: allMessagesResponse.pagination.total,
        }));
      }

      if (unprocessedMessagesResponse.success) {
        setStats((prev) => ({
          ...prev,
          unprocessedMessages: unprocessedMessagesResponse.pagination.total,
        }));
      }

      if (allTicketsResponse.success) {
        setStats((prev) => ({
          ...prev,
          totalTickets: allTicketsResponse.pagination.total,
        }));
      }

      if (pendingTicketsResponse.success) {
        setStats((prev) => ({
          ...prev,
          pendingTickets: pendingTicketsResponse.pagination.total,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if current organization has integrations
  useEffect(() => {
    const checkIntegrations = async () => {
      try {
        const response = await integrationsService.getAll();
        const activeIntegrations = response.data?.filter((i) => i.enabled) ?? [];

        const emailIntegrations = activeIntegrations.filter(
          (i) => i.type === 'email' || i.type === 'gmail'
        );
        const telegramIntegrations = activeIntegrations.filter((i) => i.type === 'telegram');
        const messageSourceIntegrations = activeIntegrations.filter(
          (i) =>
            i.type === 'email' || i.type === 'gmail' || i.type === 'telegram' || i.type === 'slack'
        );

        setHasIntegrations(activeIntegrations.length > 0);
        setHasMessageSources(messageSourceIntegrations.length > 0);
        setHasEmailIntegrations(emailIntegrations.length > 0);
        setHasTelegramIntegrations(telegramIntegrations.length > 0);
      } catch (error) {
        console.error('Failed to check integrations:', error);
        setHasIntegrations(false);
        setHasMessageSources(false);
        setHasEmailIntegrations(false);
        setHasTelegramIntegrations(false);
      }
    };

    checkIntegrations().catch((error) => {
      console.error('Failed to check integrations:', error);
    });
  }, []);

  useEffect(() => {
    fetchStats().catch((error) => {
      console.error('Failed to fetch stats:', error);
    });
  }, []);

  // Listen for real-time stats updates via WebSocket
  useEffect(() => {
    const socket = getSocket();

    const handleStatsUpdate = (updatedStats: {
      totalMessages?: number;
      unprocessedMessages?: number;
      totalTickets?: number;
      pendingTickets?: number;
    }) => {
      setStats((prev) => ({
        ...prev,
        ...updatedStats,
      }));
    };

    socket.on('stats:update', handleStatsUpdate);

    return () => {
      socket.off('stats:update', handleStatsUpdate);
    };
  }, []);

  // Cleanup polling interval on unmount
  useEffect(
    () => () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    },
    []
  );

  const handleIngestion = async (type: 'all' | 'email' | 'telegram') => {
    // Check if current org has required integrations before starting
    if (type === 'all' && !hasIntegrations) {
      return;
    }

    if (type === 'email' && !hasEmailIntegrations) {
      setAlertDialog({
        open: true,
        title: 'No Email Integration',
        description:
          'No email integrations configured for the current organization. Please configure email integration in Settings.',
        variant: 'warning',
      });
      return;
    }

    if (type === 'telegram' && !hasTelegramIntegrations) {
      setAlertDialog({
        open: true,
        title: 'No Telegram Integration',
        description:
          'No Telegram integration configured for the current organization. Please configure Telegram integration in Settings.',
        variant: 'warning',
      });
      return;
    }

    setIngesting(type);

    // Note: Progress is tracked by MessageProcessingProgress widget

    try {
      let response;
      switch (type) {
        case 'all':
          response = await ingestionService.startAll();
          break;
        case 'email':
          response = await ingestionService.checkEmails(); // Check emails immediately, not just start polling
          break;
        case 'telegram':
          response = await ingestionService.startTelegram();
          break;
      }
      if (response.success) {
        // Clear Messages page cache so it shows fresh data
        clearMessagesCache();

        // Refresh stats immediately
        await fetchStats();

        // No modal shown - users see progress in EmailProcessingProgress widget

        // Clear any existing polling interval
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }

        // Poll stats aggressively for 60 seconds to catch async processing
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts × 2s = 60 seconds
        pollingIntervalRef.current = setInterval(async () => {
          attempts++;
          await fetchStats();

          // Stop polling after max attempts
          if (attempts >= maxAttempts && pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }, 2000) as unknown as number;
      }
    } catch (error) {
      console.error('Failed to start ingestion:', error);
      setAlertDialog({
        open: true,
        title: 'Ingestion Failed',
        description: 'Failed to start ingestion',
        variant: 'error',
      });
    } finally {
      setIngesting(null);
    }
  };

  const statCards = [
    {
      title: 'Total Messages',
      value: stats.totalMessages,
      icon: Mail,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      onClick: () => navigate('/messages?processed=all'),
    },
    {
      title: 'Unprocessed Messages',
      value: stats.unprocessedMessages,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-950/50',
      onClick: () => navigate('/messages?processed=unprocessed'),
    },
    {
      title: 'Total Tickets',
      value: stats.totalTickets,
      icon: TicketIcon,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/50',
      onClick: () => navigate('/tickets?status=all'),
    },
    {
      title: 'Pending Tickets',
      value: stats.pendingTickets,
      icon: CheckCircle,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/50',
      onClick: () => navigate('/tickets?status=pending'),
    },
  ];

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
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
            {Array.from({ length: 4 }).map((_, i) => (
              // Index key is safe: array is immutable (recreated from text split), no reordering
              // eslint-disable-next-line react/no-array-index-key
              <Card key={`skeleton-${i}`} className="animate-pulse">
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
                    <div
                      className={`${stat.bg} p-2.5 rounded-xl group-hover:scale-110 transition-transform`}
                    >
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                      {stat.value}
                    </div>
                    <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                      {stat.title === 'Unprocessed Messages' && stats.unprocessedMessages > 0 && (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          Needs attention
                        </>
                      )}
                      {stat.title === 'Pending Tickets' && stats.pendingTickets > 0 && (
                        <>
                          <Hourglass className="w-3 h-3" />
                          Awaiting response
                        </>
                      )}
                      {(stat.title === 'Total Messages' || stat.title === 'Total Tickets') && (
                        <>
                          <BarChart3 className="w-3 h-3" />
                          All time
                        </>
                      )}
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
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
                disabled={
                  !hasMessageSources ||
                  isProcessing ||
                  processingStatus === 'processing' ||
                  processingStatus === 'complete'
                }
                className="w-full h-12 text-base font-semibold"
                size="lg"
                title={
                  !hasMessageSources
                    ? 'No message sources configured (email, gmail, telegram, or slack)'
                    : isProcessing || processingStatus === 'processing'
                      ? 'Email processing is already running. Please wait for completion.'
                      : processingStatus === 'complete'
                        ? 'Processing just completed. Wait for widget to close before starting again.'
                        : ''
                }
              >
                <PlayCircle className="mr-2 w-5 h-5" />
                {isProcessing || processingStatus === 'processing'
                  ? 'Processing...'
                  : 'Start All Services'}
              </Button>
              {!hasMessageSources && (
                <p className="flex gap-1 justify-center items-center text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  No message sources configured. Go to Settings to add email, Gmail, Telegram, or
                  Slack integrations.
                </p>
              )}
              {(isProcessing ||
                processingStatus === 'processing' ||
                processingStatus === 'complete') && (
                <p className="flex gap-1 justify-center items-center text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {processingStatus === 'complete'
                    ? 'Processing completed. Widget will close automatically...'
                    : 'Email processing in progress. Please wait...'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleIngestion('email')}
                  isLoading={ingesting === 'email'}
                  disabled={
                    !hasEmailIntegrations ||
                    isProcessing ||
                    processingStatus === 'processing' ||
                    processingStatus === 'complete'
                  }
                  className="w-full"
                  title={
                    !hasEmailIntegrations
                      ? 'No email integrations configured'
                      : isProcessing || processingStatus === 'processing'
                        ? 'Processing already in progress'
                        : processingStatus === 'complete'
                          ? 'Wait for widget to close'
                          : ''
                  }
                >
                  <Mail className="mr-2 w-4 h-4" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleIngestion('telegram')}
                  isLoading={ingesting === 'telegram'}
                  disabled={
                    !hasTelegramIntegrations ||
                    isProcessing ||
                    processingStatus === 'processing' ||
                    processingStatus === 'complete'
                  }
                  className="w-full"
                  title={
                    !hasTelegramIntegrations
                      ? 'No Telegram integration configured'
                      : isProcessing || processingStatus === 'processing'
                        ? 'Processing already in progress'
                        : processingStatus === 'complete'
                          ? 'Wait for widget to close'
                          : ''
                  }
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
                {/* Database Status */}
                {health?.services.database && (
                  <div
                    className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                      health.services.database.status === 'active'
                        ? 'bg-green-500/10 border-green-500/20 dark:bg-green-500/10 dark:border-green-500/20'
                        : health.services.database.status === 'error'
                          ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
                          : 'bg-muted border-border'
                    }`}
                  >
                    <div className="flex gap-2 items-center">
                      <div
                        className={`w-2 h-2 flex-shrink-0 rounded-full ${
                          health.services.database.status === 'active'
                            ? 'bg-green-500 animate-pulse'
                            : health.services.database.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-sm font-medium">Database</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        health.services.database.status === 'active'
                          ? 'text-green-600 dark:text-green-400'
                          : health.services.database.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {health.services.database.status === 'active'
                        ? 'Connected'
                        : health.services.database.status === 'error'
                          ? 'Error'
                          : 'Inactive'}
                    </span>
                  </div>
                )}

                {/* Email Service Status */}
                {health?.services.email && (
                  <div
                    className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                      health.services.email.status === 'active'
                        ? 'bg-green-500/10 border-green-500/20 dark:bg-green-500/10 dark:border-green-500/20'
                        : health.services.email.status === 'error'
                          ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
                          : 'bg-muted border-border'
                    }`}
                  >
                    <div className="flex gap-2 items-center">
                      <div
                        className={`w-2 h-2 flex-shrink-0 rounded-full ${
                          health.services.email.status === 'active'
                            ? 'bg-green-500 animate-pulse'
                            : health.services.email.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-sm font-medium">Email Service</span>
                    </div>
                    <span
                      className={`text-xs font-medium break-words ${
                        health.services.email.status === 'active'
                          ? 'text-green-600 dark:text-green-400'
                          : health.services.email.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {health.services.email.message ?? health.services.email.status}
                    </span>
                  </div>
                )}

                {/* Telegram Service Status */}
                {health?.services.telegram && (
                  <div
                    className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                      health.services.telegram.status === 'active'
                        ? 'bg-cyan-500/10 border-cyan-500/20 dark:bg-cyan-500/10 dark:border-cyan-500/20'
                        : health.services.telegram.status === 'error'
                          ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
                          : 'bg-muted border-border'
                    }`}
                  >
                    <div className="flex gap-2 items-center">
                      <div
                        className={`w-2 h-2 flex-shrink-0 rounded-full ${
                          health.services.telegram.status === 'active'
                            ? 'bg-cyan-500 animate-pulse'
                            : health.services.telegram.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-sm font-medium">Telegram Service</span>
                    </div>
                    <span
                      className={`text-xs font-medium break-words ${
                        health.services.telegram.status === 'active'
                          ? 'text-cyan-600 dark:text-cyan-400'
                          : health.services.telegram.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {health.services.telegram.message ?? health.services.telegram.status}
                    </span>
                  </div>
                )}

                {/* WebSocket Status */}
                <div
                  className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                    isWebSocketConnected
                      ? 'bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/10 dark:border-blue-500/20'
                      : 'bg-muted border-border'
                  }`}
                >
                  <div className="flex gap-2 items-center">
                    <div
                      className={`w-2 h-2 flex-shrink-0 rounded-full ${
                        isWebSocketConnected ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-sm font-medium">WebSocket</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isWebSocketConnected
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isWebSocketConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {/* AI Service Status */}
                {health?.services.ai && (
                  <div
                    className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                      health.services.ai.status === 'active'
                        ? 'bg-purple-500/10 border-purple-500/20 dark:bg-purple-500/10 dark:border-purple-500/20'
                        : health.services.ai.status === 'error'
                          ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
                          : 'bg-muted border-border'
                    }`}
                  >
                    <div className="flex flex-shrink-0 gap-2 items-center">
                      <div
                        className={`w-2 h-2 flex-shrink-0 rounded-full ${
                          health.services.ai.status === 'active'
                            ? 'bg-purple-500 animate-pulse'
                            : health.services.ai.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-sm font-medium whitespace-nowrap">AI Processing</span>
                    </div>
                    <span
                      className={`text-xs font-medium break-words ${
                        health.services.ai.status === 'active'
                          ? 'text-purple-600 dark:text-purple-400'
                          : health.services.ai.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {health.services.ai.message ?? health.services.ai.status}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
