import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Inbox,
  Ticket as TicketIcon,
  PlayCircle,
  Mail,
  Clock,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Hourglass,
  BarChart3,
  Loader2,
  MessageSquare,
  ShieldAlert,
  BookOpen,
  FileText,
  Timer,
  Archive,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { useTelegramProcessing } from '@/hooks/useTelegramProcessing';
import { getSocket, releaseSocket } from '@/lib/socketManager';
import { ingestionService } from '@/services/ingestion.service';
import { integrationsService } from '@/services/integrations.service';
import { documentationService } from '@/services/documentation.service';
import { kbService } from '@/services/kb.service';
import { messageService } from '@/services/message.service';
import { slaService } from '@/services/sla.service';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { logger } from '@/lib/logger';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    // SLA & Resolution (top section)
    slaBreachCount: 0,
    slaAtRiskCount: 0,
    avgFirstResponseMins: null as number | null,
    avgFirstResponsePeriodDays: null as number | null,
    resolvedExclKB: 0,
    closedExclKB: 0,
    // Messages
    activeMessages: 0,
    clientReplied: 0,
    awaitingResponse: 0,
    suspiciousMessages: 0,
    notAnalysed: 0,
    resolvedMessages: 0,
    // Tickets
    openTickets: 0,
    inProgressTickets: 0,
    pendingTickets: 0,
    // KB
    kbQAPairs: 0,
    kbDocuments: 0,
    kbDocumentation: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [hasMessageSources, setHasMessageSources] = useState(false);
  const [hasEmailIntegrations, setHasEmailIntegrations] = useState(false);
  const [hasTelegramIntegrations, setHasTelegramIntegrations] = useState(false);

  // Ref to track polling interval for cleanup
  const pollingIntervalRef = useRef<number | null>(null);
  // Ref to track auto-hide timer for "no new messages" banner
  const noNewMessagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for "no new messages" feedback
  const [noNewMessagesInfo, setNoNewMessagesInfo] = useState<{
    show: boolean;
    type: 'email' | 'telegram' | 'all' | null;
  }>({ show: false, type: null });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  // System health polling - check every 5 minutes to minimize API load
  const { health, isWebSocketConnected } = useSystemHealth(300000);

  // Get messages store cache clear function
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  // Get current user's department for filtering
  const selectedDepartment = useAuthStore((state) => state.selectedDepartmentRole);

  // Subscribe to email processing events to auto-refresh on completion
  // Filter by department to only show processing for user's department
  const {
    status: processingStatus,
    stage: processingStage,
    processed: processedCount,
    isProcessing,
  } = useEmailProcessing(true, selectedDepartment ?? undefined);
  const prevProcessingStatus = useRef(processingStatus);

  // Subscribe to telegram processing events
  const { isProcessing: isTelegramProcessing, totalProcessed: telegramProcessedCount } =
    useTelegramProcessing(true);
  const prevIsTelegramProcessing = useRef(isTelegramProcessing);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch with limit=1 to get total counts from pagination metadata (we don't need the actual records)
      // Scope counts to the selected department so agents only see their own department's stats.
      const deptFilter = selectedDepartment ? { departmentRole: selectedDepartment } : {};
      const [
        slaBreachRes,
        slaAtRiskRes,
        slaSummary,
        resolvedExclKBRes,
        closedExclKBRes,
        activeRes,
        clientRepliedRes,
        awaitingRes,
        suspiciousRes,
        notAnalysedRes,
        resolvedRes,
        openTicketsRes,
        inProgressTicketsRes,
        pendingTicketsRes,
        kbQARes,
        kbDocRes,
        docStatsRes,
      ] = await Promise.all([
        messageService.getThreads({ view: 'work_queue', slaBreached: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'work_queue', slaAtRisk: 'true', ...deptFilter }, 1, 1),
        slaService.getSummary().catch(() => null),
        messageService.getThreads({ view: 'resolved', excludeKB: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'active', processed: 'closed', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'active', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'client_replied', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'awaiting_response', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'suspicious', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'not_analysed', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'resolved', ...deptFilter }, 1, 1),
        ticketService.getAll({ status: 'open' }, 1, 1),
        ticketService.getAll({ status: 'in_progress' }, 1, 1),
        ticketService.getAll({ status: 'pending' }, 1, 1),
        kbService.getAll({ type: 'qa_pair', limit: 1 }),
        kbService.getAll({ type: 'document', limit: 1 }),
        documentationService.getStats(),
      ]);

      setStats({
        slaBreachCount: slaBreachRes.success ? slaBreachRes.pagination.total : 0,
        slaAtRiskCount: slaAtRiskRes.success ? slaAtRiskRes.pagination.total : 0,
        avgFirstResponseMins: slaSummary?.messages.avgResponseTime ?? null,
        avgFirstResponsePeriodDays: slaSummary?.messages.avgResponsePeriodDays ?? null,
        resolvedExclKB: resolvedExclKBRes.success ? resolvedExclKBRes.pagination.total : 0,
        closedExclKB: closedExclKBRes.success ? closedExclKBRes.pagination.total : 0,
        activeMessages: activeRes.success ? activeRes.pagination.total : 0,
        clientReplied: clientRepliedRes.success ? clientRepliedRes.pagination.total : 0,
        awaitingResponse: awaitingRes.success ? awaitingRes.pagination.total : 0,
        suspiciousMessages: suspiciousRes.success ? suspiciousRes.pagination.total : 0,
        notAnalysed: notAnalysedRes.success ? notAnalysedRes.pagination.total : 0,
        resolvedMessages: resolvedRes.success ? resolvedRes.pagination.total : 0,
        openTickets: openTicketsRes.success ? openTicketsRes.pagination.total : 0,
        inProgressTickets: inProgressTicketsRes.success ? inProgressTicketsRes.pagination.total : 0,
        pendingTickets: pendingTicketsRes.success ? pendingTicketsRes.pagination.total : 0,
        kbQAPairs: kbQARes?.success ? Number(kbQARes.data.pagination.total) : 0,
        kbDocuments: kbDocRes?.success ? Number(kbDocRes.data.pagination.total) : 0,
        kbDocumentation: Number(docStatsRes?.totalDocs ?? 0),
      });
    } catch (error) {
      logger.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, [selectedDepartment]);

  // Auto-refresh stats when email processing completes
  useEffect(() => {
    // Detect transition to complete (from any prior state: idle, started, processing, etc.)
    const wasNotComplete = prevProcessingStatus.current !== 'complete';
    const isNowComplete = processingStatus === 'complete';

    if (wasNotComplete && isNowComplete) {
      if (processedCount > 0) {
        // Clear caches to force fresh data fetch
        clearMessagesCache();

        // Refresh dashboard stats
        fetchStats().catch((error) => {
          logger.error('Failed to refresh stats after email processing:', error);
        });
      } else {
        // No messages processed - show "no new messages" feedback
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'email' });
        noNewMessagesTimerRef.current = setTimeout(() => {
          setNoNewMessagesInfo({ show: false, type: null });
          noNewMessagesTimerRef.current = null;
        }, 5000);
      }
    }
    prevProcessingStatus.current = processingStatus;
  }, [processingStatus, processedCount, clearMessagesCache, fetchStats]);

  // Auto-refresh stats when telegram processing completes
  useEffect(() => {
    // Detect transition from processing to not processing
    if (prevIsTelegramProcessing.current && !isTelegramProcessing) {
      if (telegramProcessedCount > 0) {
        // Clear caches
        clearMessagesCache();

        // Refresh dashboard stats
        fetchStats().catch((error) => {
          logger.error('Failed to refresh stats after telegram processing:', error);
        });
      } else {
        // No messages processed - show "no new messages" feedback
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'telegram' });
        noNewMessagesTimerRef.current = setTimeout(() => {
          setNoNewMessagesInfo({ show: false, type: null });
          noNewMessagesTimerRef.current = null;
        }, 5000);
      }
    }
    prevIsTelegramProcessing.current = isTelegramProcessing;
  }, [isTelegramProcessing, telegramProcessedCount, clearMessagesCache, fetchStats]);

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
        logger.error('Failed to check integrations:', error);
        setHasIntegrations(false);
        setHasMessageSources(false);
        setHasEmailIntegrations(false);
        setHasTelegramIntegrations(false);
      }
    };

    checkIntegrations().catch((error) => {
      logger.error('Failed to check integrations:', error);
    });
  }, []);

  useEffect(() => {
    fetchStats().catch((error) => {
      logger.error('Failed to fetch stats:', error);
    });
  }, [fetchStats]);

  // Listen for real-time stats updates via WebSocket
  useEffect(() => {
    const socket = getSocket();

    const handleStatsUpdate = (_updatedStats: Record<string, number>) => {
      // WebSocket stat field names are stale (supportMessages, unprocessedMessages, etc.)
      // and no longer map to the new stats shape. Rely on fetchStats() for updates instead.
    };

    socket.on('stats:update', handleStatsUpdate);

    return () => {
      socket.off('stats:update', handleStatsUpdate);
      releaseSocket();
    };
  }, []);

  // Cleanup polling interval and notification timer on unmount
  useEffect(
    () => () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (noNewMessagesTimerRef.current) {
        clearTimeout(noNewMessagesTimerRef.current);
        noNewMessagesTimerRef.current = null;
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

        // Poll stats for 60 seconds to catch async processing
        let attempts = 0;
        const maxAttempts = 12; // 12 attempts × 5s = 60 seconds
        pollingIntervalRef.current = setInterval(() => {
          attempts++;
          void fetchStats().finally(() => {
            // Stop polling after max attempts
            if (attempts >= maxAttempts && pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          });
        }, 5000) as unknown as number;
      }
    } catch (error) {
      logger.error('Failed to start ingestion:', error);
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

  const formatMinutes = (mins: number | null): string => {
    if (mins === null) return '—';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const slaCards = [
    {
      title: 'SLA Breach',
      value: stats.slaBreachCount,
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/50',
      borderColor: '#dc2626',
      hint: 'Active breaches',
      onClick: () => navigate('/messages?slaBreached=true'),
      isClickable: true,
    },
    {
      title: 'SLA At Risk',
      value: stats.slaAtRiskCount,
      icon: AlertCircle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/50',
      borderColor: '#d97706',
      hint: '>80% of deadline',
      onClick: () => navigate('/messages?slaAtRisk=true'),
      isClickable: true,
    },
    {
      title: 'Avg First Response',
      value: formatMinutes(stats.avgFirstResponseMins),
      icon: Timer,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      borderColor: '#2563eb',
      hint: stats.avgFirstResponsePeriodDays === null
        ? 'No data'
        : stats.avgFirstResponsePeriodDays === 1
          ? 'Last 24 hours'
          : stats.avgFirstResponsePeriodDays === 7
            ? 'Last 7 days'
            : stats.avgFirstResponsePeriodDays === 30
              ? 'Last 30 days'
              : 'Last year',
      onClick: () => navigate('/sla-dashboard'),
      isClickable: false,
    },
    {
      title: 'Resolved',
      value: stats.resolvedExclKB,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/50',
      borderColor: '#16a34a',
      hint: 'Excl. KB processing',
      onClick: () => navigate('/messages?status=resolved'),
      isClickable: true,
    },
    {
      title: 'Closed',
      value: stats.closedExclKB,
      icon: Archive,
      color: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-950/50',
      borderColor: '#475569',
      hint: 'Excl. KB processing',
      onClick: () => navigate('/messages?threadStatus=closed'),
      isClickable: true,
    },
  ];

  const messageCards = [
    {
      title: 'Active',
      value: stats.activeMessages,
      icon: Mail,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      borderColor: '#2563eb',
      hint: 'Needs your attention',
      onClick: () => navigate('/messages?status=active'),
    },
    {
      title: 'Client Replied',
      value: stats.clientReplied,
      icon: MessageSquare,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950/50',
      borderColor: '#ea580c',
      hint: 'Waiting for your reply',
      onClick: () => navigate('/messages?status=client_replied'),
    },
    {
      title: 'Awaiting Response',
      value: stats.awaitingResponse,
      icon: Hourglass,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-950/50',
      borderColor: '#ca8a04',
      hint: 'Waiting for client',
      onClick: () => navigate('/messages?status=awaiting_response'),
    },
    {
      title: 'Suspicious',
      value: stats.suspiciousMessages,
      icon: ShieldAlert,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/50',
      borderColor: '#d97706',
      hint: 'Needs review',
      onClick: () => navigate('/messages?status=suspicious'),
    },
    {
      title: 'Not Analysed',
      value: stats.notAnalysed,
      icon: Clock,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/50',
      borderColor: '#dc2626',
      hint: 'Pending AI processing',
      onClick: () => navigate('/messages?status=not_analysed'),
    },
    {
      title: 'Resolved',
      value: stats.resolvedMessages,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/50',
      borderColor: '#16a34a',
      hint: 'Successfully resolved',
      onClick: () => navigate('/messages?status=resolved'),
    },
  ];

  const ticketCards = [
    {
      title: 'Open',
      value: stats.openTickets,
      icon: TicketIcon,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      borderColor: '#2563eb',
      hint: 'New tickets',
      onClick: () => navigate('/tickets?status=open'),
    },
    {
      title: 'In Progress',
      value: stats.inProgressTickets,
      icon: Loader2,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-950/50',
      borderColor: '#ca8a04',
      hint: 'Being handled',
      onClick: () => navigate('/tickets?status=in_progress'),
    },
    {
      title: 'Pending',
      value: stats.pendingTickets,
      icon: Hourglass,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/50',
      borderColor: '#9333ea',
      hint: 'Awaiting response',
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
          {lastUpdated && (
            <div className="text-right text-s text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-6">
            {/* SLA skeleton */}
            <div>
              <div className="w-32 h-4 bg-gray-200 rounded mb-3" />
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Card key={`skeleton-sla-${i}`} className="animate-pulse">
                    <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
                      <div className="w-20 h-4 bg-gray-200 rounded" />
                      <div className="w-8 h-8 bg-gray-200 rounded" />
                    </CardHeader>
                    <CardContent>
                      <div className="w-12 h-7 bg-gray-200 rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            {/* Messages skeleton */}
            <div>
              <div className="w-24 h-4 bg-gray-200 rounded mb-3" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Card key={`skeleton-msg-${i}`} className="animate-pulse">
                    <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
                      <div className="w-20 h-4 bg-gray-200 rounded" />
                      <div className="w-8 h-8 bg-gray-200 rounded" />
                    </CardHeader>
                    <CardContent>
                      <div className="w-12 h-7 bg-gray-200 rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            {/* Tickets skeleton */}
            <div>
              <div className="w-16 h-4 bg-gray-200 rounded mb-3" />
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Card key={`skeleton-tkt-${i}`} className="animate-pulse">
                    <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
                      <div className="w-20 h-4 bg-gray-200 rounded" />
                      <div className="w-8 h-8 bg-gray-200 rounded" />
                    </CardHeader>
                    <CardContent>
                      <div className="w-12 h-7 bg-gray-200 rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            {/* KB skeleton */}
            <div>
              <div className="w-32 h-4 bg-gray-200 rounded mb-3" />
              <div className="grid gap-4 max-w-xs">
                <Card className="animate-pulse">
                  <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
                    <div className="w-20 h-4 bg-gray-200 rounded" />
                    <div className="w-8 h-8 bg-gray-200 rounded" />
                  </CardHeader>
                  <CardContent>
                    <div className="w-12 h-7 bg-gray-200 rounded" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* SLA & Resolution Section */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                SLA &amp; Resolution
              </h2>
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {slaCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card
                      key={card.title}
                      onClick={card.isClickable ? card.onClick : undefined}
                      className={`border-l-4 transition-all ${card.isClickable ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group' : ''}`}
                      style={{ borderLeftColor: card.borderColor }}
                    >
                      <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                          {card.title}
                        </CardTitle>
                        <div
                          className={`${card.bg} p-2 rounded-xl ${card.isClickable ? 'group-hover:scale-110 transition-transform' : ''}`}
                        >
                          <Icon className={`h-4 w-4 ${card.color}`} />
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                          {card.value}
                        </div>
                        <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                          <BarChart3 className="w-3 h-3" />
                          {card.hint}
                          {card.isClickable && (
                            <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                              →
                            </span>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Messages + Tickets Section */}
            {(() => {
              const messageTotal = messageCards.reduce((s, c) => s + c.value, 0);
              const ticketTotal = ticketCards.reduce((s, c) => s + c.value, 0);
              return (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Messages by Status */}
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Messages by Status
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">{messageTotal} total</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 space-y-1.5">
                      {messageCards.map((row) => (
                        <button
                          key={row.title}
                          type="button"
                          onClick={row.onClick}
                          className="flex gap-3 items-center px-1 py-1 w-full rounded transition-colors group hover:bg-muted/50"
                        >
                          <div
                            className="flex-shrink-0 w-2 h-2 rounded-full"
                            style={{ backgroundColor: row.borderColor }}
                          />
                          <span className="w-36 text-sm font-medium text-left text-foreground/80 group-hover:text-foreground">
                            {row.title}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${messageTotal ? (row.value / messageTotal) * 100 : 0}%`,
                                backgroundColor: row.borderColor,
                              }}
                            />
                          </div>
                          <span className="w-6 text-sm font-semibold text-right">{row.value}</span>
                          <span className="opacity-0 text-muted-foreground transition-opacity group-hover:opacity-100">
                            →
                          </span>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Tickets by Status */}
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Tickets by Status
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">{ticketTotal} total</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 space-y-1.5">
                      {ticketCards.map((row) => (
                        <button
                          key={row.title}
                          type="button"
                          onClick={row.onClick}
                          className="flex gap-3 items-center px-1 py-1 w-full rounded transition-colors group hover:bg-muted/50"
                        >
                          <div
                            className="flex-shrink-0 w-2 h-2 rounded-full"
                            style={{ backgroundColor: row.borderColor }}
                          />
                          <span className="w-36 text-sm font-medium text-left text-foreground/80 group-hover:text-foreground">
                            {row.title}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${ticketTotal ? (row.value / ticketTotal) * 100 : 0}%`,
                                backgroundColor: row.borderColor,
                              }}
                            />
                          </div>
                          <span className="w-6 text-sm font-semibold text-right">{row.value}</span>
                          <span className="opacity-0 text-muted-foreground transition-opacity group-hover:opacity-100">
                            →
                          </span>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Knowledge Base Section */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Knowledge Base
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card
                  onClick={() => navigate('/knowledge-base#qa_pair')}
                  className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
                  style={{ borderLeftColor: '#0891b2' }}
                >
                  <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                      Q&amp;A
                    </CardTitle>
                    <div className="bg-cyan-50 dark:bg-cyan-950/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                      <MessageSquare className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                      {stats.kbQAPairs}
                    </div>
                    <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                      <BarChart3 className="w-3 h-3" />
                      Extracted pairs
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </p>
                  </CardContent>
                </Card>
                <Card
                  onClick={() => navigate('/knowledge-base#document')}
                  className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
                  style={{ borderLeftColor: '#059669' }}
                >
                  <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                      Documents
                    </CardTitle>
                    <div className="bg-emerald-50 dark:bg-emerald-950/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                      <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                      {stats.kbDocuments}
                    </div>
                    <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                      <BarChart3 className="w-3 h-3" />
                      Processed attachments
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </p>
                  </CardContent>
                </Card>
                <Card
                  onClick={() => navigate('/knowledge-base#documentation')}
                  className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
                  style={{ borderLeftColor: '#7c3aed' }}
                >
                  <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                      Documentation
                    </CardTitle>
                    <div className="bg-violet-50 dark:bg-violet-950/50 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                      <BookOpen className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                      {stats.kbDocumentation}
                    </div>
                    <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                      <BarChart3 className="w-3 h-3" />
                      Uploaded files
                      <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Ingestion Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Primary Actions */}
          <Card>
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
                    : processingStage === 'kb-processing'
                      ? 'Building knowledge base from attachments...'
                      : 'Email processing in progress. Please wait...'}
                </p>
              )}
              {noNewMessagesInfo.show && (
                <p className="flex gap-1 justify-center items-center text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  All caught up! No new{' '}
                  {noNewMessagesInfo.type === 'email'
                    ? 'emails'
                    : noNewMessagesInfo.type === 'telegram'
                      ? 'Telegram messages'
                      : 'messages'}{' '}
                  found.
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
