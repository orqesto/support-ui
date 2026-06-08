import { useCallback, useEffect, useState, useRef } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Timer,
  Archive,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { useTelegramProcessing } from '@/hooks/useTelegramProcessing';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { ingestionService } from '@/services/ingestion.service';
import { integrationsService } from '@/services/integrations.service';
import { documentationService } from '@/services/documentation.service';
import { kbService } from '@/services/kb.service';
import { messageService } from '@/services/message.service';
import { slaService } from '@/services/sla.service';
import { ticketService } from '@/services/ticket.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { logger } from '@/lib/logger';
import { MESSAGE_SOURCE_TYPES } from '@/types';
import { DashboardKBSection } from '@/components/dashboard/DashboardKBSection';
import { DashboardQuickActions } from '@/components/dashboard/DashboardQuickActions';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { DashboardSystemStatus } from '@/components/dashboard/DashboardSystemStatus';
import {
  DashboardSLASection,
  DashboardStatusBarSection,
} from '@/components/dashboard/DashboardStatCards';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    slaBreachCount: 0,
    slaAtRiskCount: 0,
    avgFirstResponseMins: null as number | null,
    avgFirstResponsePeriodDays: null as number | null,
    resolvedExclKB: 0,
    closedExclKB: 0,
    activeMessages: 0,
    clientReplied: 0,
    awaitingResponse: 0,
    suspiciousMessages: 0,
    notAnalysed: 0,
    resolvedMessages: 0,
    openTickets: 0,
    inProgressTickets: 0,
    pendingTickets: 0,
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

  const pollingIntervalRef = useRef<number | null>(null);
  const noNewMessagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const fetchGenRef = useRef(0); // monotonic counter — stale responses are discarded on arrival
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // Re-fetch dashboard stats when the dept-context checkboxes change.
  const selectedDeptKey = useDepartmentContextKey();

  const [noNewMessagesInfo, setNoNewMessagesInfo] = useState<{
    show: boolean;
    type: 'email' | 'telegram' | 'all' | null;
  }>({ show: false, type: null });

  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const { health, isWebSocketConnected } = useSystemHealth(300000);
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  const {
    status: processingStatus,
    stage: processingStage,
    processed: processedCount,
    isProcessing,
  } = useEmailProcessing(true);
  const prevProcessingStatus = useRef(processingStatus);

  const { isProcessing: isTelegramProcessing, totalProcessed: telegramProcessedCount } =
    useTelegramProcessing(true);
  const prevIsTelegramProcessing = useRef(isTelegramProcessing);

  const fetchStats = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
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
        messageService.getThreads({ view: 'work_queue', slaBreached: 'true' }, 1, 1),
        messageService.getThreads({ view: 'work_queue', slaAtRisk: 'true' }, 1, 1),
        slaService.getSummary().catch(() => null),
        messageService.getThreads({ view: 'resolved', excludeKB: 'true' }, 1, 1),
        messageService.getThreads({ view: 'active', processed: 'closed' }, 1, 1),
        messageService.getThreads({ view: 'inbox', excludeNotAnalysed: 'true' }, 1, 1),
        messageService.getThreads(
          { view: 'client_replied', excludeSuspicious: 'true', excludeNotAnalysed: 'true' },
          1,
          1
        ),
        messageService.getThreads(
          { view: 'awaiting_response', excludeSuspicious: 'true', excludeNotAnalysed: 'true' },
          1,
          1
        ),
        messageService.getThreads({ view: 'suspicious' }, 1, 1),
        messageService.getThreads({ view: 'not_analysed' }, 1, 1),
        messageService.getThreads({ view: 'resolved' }, 1, 1),
        ticketService.getAll({ status: 'open' }, 1, 1),
        ticketService.getAll({ status: 'in_progress' }, 1, 1),
        ticketService.getAll({ status: 'pending' }, 1, 1),
        kbService.getAll({ type: 'qa_pair', limit: 1 }),
        kbService.getAll({ type: 'document', limit: 1 }),
        documentationService.getStats(),
      ]);

      if (gen !== fetchGenRef.current) return; // newer fetch already in flight — discard stale response
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
    // selectedDeptKey is a refresh trigger: read indirectly via the axios
    // interceptor (X-Department-Context header), so eslint's exhaustive-deps
    // can't see the link. Force callback identity to change on toggle so the
    // consumer useEffect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptKey]);

  useEffect(() => {
    const wasNotComplete = prevProcessingStatus.current !== 'complete';
    const isNowComplete = processingStatus === 'complete';
    if (wasNotComplete && isNowComplete) {
      if (processedCount > 0) {
        clearMessagesCache();
        fetchStats().catch((error) => {
          logger.error('Failed to refresh stats after email processing:', error);
        });
      } else {
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'email' });
        noNewMessagesTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setNoNewMessagesInfo({ show: false, type: null });
          noNewMessagesTimerRef.current = null;
        }, 5000);
      }
    }
    prevProcessingStatus.current = processingStatus;
  }, [processingStatus, processedCount, clearMessagesCache, fetchStats]);

  useEffect(() => {
    if (prevIsTelegramProcessing.current && !isTelegramProcessing) {
      if (telegramProcessedCount > 0) {
        clearMessagesCache();
        fetchStats().catch((error) => {
          logger.error('Failed to refresh stats after telegram processing:', error);
        });
      } else {
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'telegram' });
        noNewMessagesTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setNoNewMessagesInfo({ show: false, type: null });
          noNewMessagesTimerRef.current = null;
        }, 5000);
      }
    }
    prevIsTelegramProcessing.current = isTelegramProcessing;
  }, [isTelegramProcessing, telegramProcessedCount, clearMessagesCache, fetchStats]);

  useEffect(() => {
    const checkIntegrations = async () => {
      try {
        const response = await integrationsService.getAll();
        const active = response.data?.filter((intg) => intg.enabled) ?? [];
        const emailInt = active.filter((intg) => intg.type === 'email' || intg.type === 'gmail');
        const telegramInt = active.filter((intg) => intg.type === 'telegram');
        const msgSrc = active.filter((intg) =>
          (MESSAGE_SOURCE_TYPES as readonly string[]).includes(intg.type)
        );
        setHasIntegrations(active.length > 0);
        setHasMessageSources(msgSrc.length > 0);
        setHasEmailIntegrations(emailInt.length > 0);
        setHasTelegramIntegrations(telegramInt.length > 0);
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

  useEffect(() => {
    const handleStatsUpdate = (_updatedStats: unknown) => {
      fetchStats().catch((error) => {
        logger.error('Failed to refresh stats on WS update:', error);
      });
    };
    subscribeToEvent('stats:update', handleStatsUpdate);
    return () => {
      unsubscribeFromEvent('stats:update', handleStatsUpdate);
    };
  }, [fetchStats]);

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
    if (type === 'all' && !hasIntegrations) return;
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
    try {
      const response = await (type === 'all'
        ? ingestionService.startAll()
        : type === 'email'
          ? ingestionService.checkEmails()
          : ingestionService.startTelegram());
      if (response.success) {
        clearMessagesCache();
        await fetchStats();
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        let attempts = 0;
        pollingIntervalRef.current = setInterval(() => {
          if (!mountedRef.current) {
            clearInterval(pollingIntervalRef.current!);
            pollingIntervalRef.current = null;
            return;
          }
          attempts++;
          void fetchStats().finally(() => {
            if (attempts >= 12 && pollingIntervalRef.current) {
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
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
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
      hint:
        stats.avgFirstResponsePeriodDays === null
          ? 'No data'
          : stats.avgFirstResponsePeriodDays === 1
            ? 'Last 24 hours'
            : stats.avgFirstResponsePeriodDays === 7
              ? 'Last 7 days'
              : stats.avgFirstResponsePeriodDays === 30
                ? 'Last 30 days'
                : 'Last year',
      onClick: () => navigate('/sla'),
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
      borderColor: '#2563eb',
      onClick: () => navigate('/messages?status=active'),
    },
    {
      title: 'Client Replied',
      value: stats.clientReplied,
      borderColor: '#ea580c',
      onClick: () => navigate('/messages?status=client_replied'),
    },
    {
      title: 'Awaiting Response',
      value: stats.awaitingResponse,
      borderColor: '#ca8a04',
      onClick: () => navigate('/messages?status=awaiting_response'),
    },
    {
      title: 'Suspicious',
      value: stats.suspiciousMessages,
      borderColor: '#d97706',
      onClick: () => navigate('/messages?status=suspicious'),
    },
    {
      title: 'Not Analysed',
      value: stats.notAnalysed,
      borderColor: '#dc2626',
      onClick: () => navigate('/messages?status=not_analysed'),
    },
    {
      title: 'Resolved',
      value: stats.resolvedMessages,
      borderColor: '#16a34a',
      onClick: () => navigate('/messages?status=resolved'),
    },
  ];

  const ticketCards = [
    {
      title: 'Open',
      value: stats.openTickets,
      borderColor: '#2563eb',
      onClick: () => navigate('/tickets?status=open'),
    },
    {
      title: 'In Progress',
      value: stats.inProgressTickets,
      borderColor: '#ca8a04',
      onClick: () => navigate('/tickets?status=in_progress'),
    },
    {
      title: 'Pending',
      value: stats.pendingTickets,
      borderColor: '#9333ea',
      onClick: () => navigate('/tickets?status=pending'),
    },
  ];

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <PageHeader
          title="Dashboard"
          description="Real-time overview of your support operations"
          actions={
            lastUpdated && (
              <span className="text-sm text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )
          }
        />

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-6">
            <DashboardSLASection cards={slaCards} />

            <div className="grid gap-4 lg:grid-cols-2">
              <DashboardStatusBarSection label="Messages by Status" cards={messageCards} />
              <DashboardStatusBarSection label="Tickets by Status" cards={ticketCards} />
            </div>

            <DashboardKBSection
              kbQAPairs={stats.kbQAPairs}
              kbDocuments={stats.kbDocuments}
              kbDocumentation={stats.kbDocumentation}
            />
          </div>
        )}

        {/* Ingestion Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          <DashboardQuickActions
            hasMessageSources={hasMessageSources}
            hasEmailIntegrations={hasEmailIntegrations}
            hasTelegramIntegrations={hasTelegramIntegrations}
            isProcessing={isProcessing}
            processingStatus={processingStatus}
            processingStage={processingStage}
            ingesting={ingesting}
            noNewMessagesInfo={noNewMessagesInfo}
            onIngest={handleIngestion}
          />

          <DashboardSystemStatus health={health} isWebSocketConnected={isWebSocketConnected} />
        </div>
      </div>

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
