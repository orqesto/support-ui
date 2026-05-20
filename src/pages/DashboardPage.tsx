import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Inbox,
  PlayCircle,
  Mail,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  BarChart3,
  Loader2,
  MessageSquare,
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
import { DashboardSystemStatus } from '@/components/dashboard/DashboardSystemStatus';
import { DashboardSLASection, DashboardStatusBarSection } from '@/components/dashboard/DashboardStatCards';

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
  const selectedDepartment = useAuthStore((state) => state.selectedDepartmentRole);

  const {
    status: processingStatus,
    stage: processingStage,
    processed: processedCount,
    isProcessing,
  } = useEmailProcessing(true, selectedDepartment ?? undefined);
  const prevProcessingStatus = useRef(processingStatus);

  const { isProcessing: isTelegramProcessing, totalProcessed: telegramProcessedCount } =
    useTelegramProcessing(true);
  const prevIsTelegramProcessing = useRef(isTelegramProcessing);

  const fetchStats = useCallback(async () => {
    try {
      const deptFilter: Record<string, string> = selectedDepartment ? { departmentRole: selectedDepartment } : {};
      const [
        slaBreachRes, slaAtRiskRes, slaSummary,
        resolvedExclKBRes, closedExclKBRes,
        activeRes, clientRepliedRes, awaitingRes,
        suspiciousRes, notAnalysedRes, resolvedRes,
        openTicketsRes, inProgressTicketsRes, pendingTicketsRes,
        kbQARes, kbDocRes, docStatsRes,
      ] = await Promise.all([
        messageService.getThreads({ view: 'work_queue', slaBreached: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'work_queue', slaAtRisk: 'true', ...deptFilter }, 1, 1),
        slaService.getSummary().catch(() => null),
        messageService.getThreads({ view: 'resolved', excludeKB: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'active', processed: 'closed', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'inbox', excludeNotAnalysed: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'client_replied', excludeSuspicious: 'true', excludeNotAnalysed: 'true', ...deptFilter }, 1, 1),
        messageService.getThreads({ view: 'awaiting_response', excludeSuspicious: 'true', excludeNotAnalysed: 'true', ...deptFilter }, 1, 1),
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

  useEffect(() => {
    const wasNotComplete = prevProcessingStatus.current !== 'complete';
    const isNowComplete = processingStatus === 'complete';
    if (wasNotComplete && isNowComplete) {
      if (processedCount > 0) {
        clearMessagesCache();
        fetchStats().catch((error) => { logger.error('Failed to refresh stats after email processing:', error); });
      } else {
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'email' });
        noNewMessagesTimerRef.current = setTimeout(() => { setNoNewMessagesInfo({ show: false, type: null }); noNewMessagesTimerRef.current = null; }, 5000);
      }
    }
    prevProcessingStatus.current = processingStatus;
  }, [processingStatus, processedCount, clearMessagesCache, fetchStats]);

  useEffect(() => {
    if (prevIsTelegramProcessing.current && !isTelegramProcessing) {
      if (telegramProcessedCount > 0) {
        clearMessagesCache();
        fetchStats().catch((error) => { logger.error('Failed to refresh stats after telegram processing:', error); });
      } else {
        if (noNewMessagesTimerRef.current) clearTimeout(noNewMessagesTimerRef.current);
        setNoNewMessagesInfo({ show: true, type: 'telegram' });
        noNewMessagesTimerRef.current = setTimeout(() => { setNoNewMessagesInfo({ show: false, type: null }); noNewMessagesTimerRef.current = null; }, 5000);
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
        const msgSrc = active.filter((intg) => ['email', 'gmail', 'telegram', 'slack'].includes(intg.type));
        setHasIntegrations(active.length > 0);
        setHasMessageSources(msgSrc.length > 0);
        setHasEmailIntegrations(emailInt.length > 0);
        setHasTelegramIntegrations(telegramInt.length > 0);
      } catch (error) {
        logger.error('Failed to check integrations:', error);
        setHasIntegrations(false); setHasMessageSources(false); setHasEmailIntegrations(false); setHasTelegramIntegrations(false);
      }
    };
    checkIntegrations().catch((error) => { logger.error('Failed to check integrations:', error); });
  }, []);

  useEffect(() => {
    fetchStats().catch((error) => { logger.error('Failed to fetch stats:', error); });
  }, [fetchStats]);

  useEffect(() => {
    const socket = getSocket();
    const handleStatsUpdate = (_updatedStats: Record<string, number>) => { /* rely on fetchStats */ };
    socket.on('stats:update', handleStatsUpdate);
    return () => { socket.off('stats:update', handleStatsUpdate); releaseSocket(); };
  }, []);

  useEffect(() => () => {
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
    if (noNewMessagesTimerRef.current) { clearTimeout(noNewMessagesTimerRef.current); noNewMessagesTimerRef.current = null; }
  }, []);

  const handleIngestion = async (type: 'all' | 'email' | 'telegram') => {
    if (type === 'all' && !hasIntegrations) return;
    if (type === 'email' && !hasEmailIntegrations) {
      setAlertDialog({ open: true, title: 'No Email Integration', description: 'No email integrations configured for the current organization. Please configure email integration in Settings.', variant: 'warning' });
      return;
    }
    if (type === 'telegram' && !hasTelegramIntegrations) {
      setAlertDialog({ open: true, title: 'No Telegram Integration', description: 'No Telegram integration configured for the current organization. Please configure Telegram integration in Settings.', variant: 'warning' });
      return;
    }
    setIngesting(type);
    try {
      const response = await (
        type === 'all'       ? ingestionService.startAll() :
        type === 'email'     ? ingestionService.checkEmails() :
                               ingestionService.startTelegram()
      );
      if (response.success) {
        clearMessagesCache();
        await fetchStats();
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        let attempts = 0;
        pollingIntervalRef.current = setInterval(() => {
          attempts++;
          void fetchStats().finally(() => {
            if (attempts >= 12 && pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
          });
        }, 5000) as unknown as number;
      }
    } catch (error) {
      logger.error('Failed to start ingestion:', error);
      setAlertDialog({ open: true, title: 'Ingestion Failed', description: 'Failed to start ingestion', variant: 'error' });
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
    { title: 'SLA Breach', value: stats.slaBreachCount, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/50', borderColor: '#dc2626', hint: 'Active breaches', onClick: () => navigate('/messages?slaBreached=true'), isClickable: true },
    { title: 'SLA At Risk', value: stats.slaAtRiskCount, icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50', borderColor: '#d97706', hint: '>80% of deadline', onClick: () => navigate('/messages?slaAtRisk=true'), isClickable: true },
    { title: 'Avg First Response', value: formatMinutes(stats.avgFirstResponseMins), icon: Timer, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50', borderColor: '#2563eb', hint: stats.avgFirstResponsePeriodDays === null ? 'No data' : stats.avgFirstResponsePeriodDays === 1 ? 'Last 24 hours' : stats.avgFirstResponsePeriodDays === 7 ? 'Last 7 days' : stats.avgFirstResponsePeriodDays === 30 ? 'Last 30 days' : 'Last year', onClick: () => navigate('/sla-dashboard'), isClickable: false },
    { title: 'Resolved', value: stats.resolvedExclKB, icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/50', borderColor: '#16a34a', hint: 'Excl. KB processing', onClick: () => navigate('/messages?status=resolved'), isClickable: true },
    { title: 'Closed', value: stats.closedExclKB, icon: Archive, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-950/50', borderColor: '#475569', hint: 'Excl. KB processing', onClick: () => navigate('/messages?threadStatus=closed'), isClickable: true },
  ];

  const messageCards = [
    { title: 'Active', value: stats.activeMessages, borderColor: '#2563eb', onClick: () => navigate('/messages?status=active') },
    { title: 'Client Replied', value: stats.clientReplied, borderColor: '#ea580c', onClick: () => navigate('/messages?status=client_replied') },
    { title: 'Awaiting Response', value: stats.awaitingResponse, borderColor: '#ca8a04', onClick: () => navigate('/messages?status=awaiting_response') },
    { title: 'Suspicious', value: stats.suspiciousMessages, borderColor: '#d97706', onClick: () => navigate('/messages?status=suspicious') },
    { title: 'Not Analysed', value: stats.notAnalysed, borderColor: '#dc2626', onClick: () => navigate('/messages?status=not_analysed') },
    { title: 'Resolved', value: stats.resolvedMessages, borderColor: '#16a34a', onClick: () => navigate('/messages?status=resolved') },
  ];

  const ticketCards = [
    { title: 'Open', value: stats.openTickets, borderColor: '#2563eb', onClick: () => navigate('/tickets?status=open') },
    { title: 'In Progress', value: stats.inProgressTickets, borderColor: '#ca8a04', onClick: () => navigate('/tickets?status=in_progress') },
    { title: 'Pending', value: stats.pendingTickets, borderColor: '#9333ea', onClick: () => navigate('/tickets?status=pending') },
  ];

  const skeletonCard = (
    <Card className="animate-pulse">
      <CardHeader className="flex flex-row justify-between items-center pb-2 space-y-0">
        <div className="w-20 h-4 bg-gray-200 rounded" />
        <div className="w-8 h-8 bg-gray-200 rounded" />
      </CardHeader>
      <CardContent><div className="w-12 h-7 bg-gray-200 rounded" /></CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time overview of your support operations</p>
          </div>
          {lastUpdated && <div className="text-right text-s text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</div>}
        </div>

        {loading ? (
          <div className="space-y-6">
            {/* eslint-disable react/no-array-index-key */}
            <div><div className="w-32 h-4 bg-gray-200 rounded mb-3" /><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, idx) => <div key={`sk-sla-${idx}`}>{skeletonCard}</div>)}</div></div>
            <div><div className="w-24 h-4 bg-gray-200 rounded mb-3" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, idx) => <div key={`sk-msg-${idx}`}>{skeletonCard}</div>)}</div></div>
            <div><div className="w-16 h-4 bg-gray-200 rounded mb-3" /><div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, idx) => <div key={`sk-tkt-${idx}`}>{skeletonCard}</div>)}</div></div>
            {/* eslint-enable react/no-array-index-key */}
            <div><div className="w-32 h-4 bg-gray-200 rounded mb-3" /><div className="grid gap-4 max-w-xs">{skeletonCard}</div></div>
          </div>
        ) : (
          <div className="space-y-6">
            <DashboardSLASection cards={slaCards} />

            <div className="grid gap-4 lg:grid-cols-2">
              <DashboardStatusBarSection label="Messages by Status" cards={messageCards} />
              <DashboardStatusBarSection label="Tickets by Status" cards={ticketCards} />
            </div>

            {/* Knowledge Base Section */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Knowledge Base</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'Q&A', value: stats.kbQAPairs, icon: MessageSquare, iconColor: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/50', borderColor: '#0891b2', hint: 'Extracted pairs', path: '/knowledge-base#qa_pair' },
                  { label: 'Documents', value: stats.kbDocuments, icon: FileText, iconColor: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50', borderColor: '#059669', hint: 'Processed attachments', path: '/knowledge-base#document' },
                  { label: 'Documentation', value: stats.kbDocumentation, icon: BookOpen, iconColor: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/50', borderColor: '#7c3aed', hint: 'Uploaded files', path: '/knowledge-base#documentation' },
                ].map((kb) => {
                  const Icon = kb.icon;
                  return (
                    <Card key={kb.label} onClick={() => navigate(kb.path)} className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group" style={{ borderLeftColor: kb.borderColor }}>
                      <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">{kb.label}</CardTitle>
                        <div className={`${kb.bg} p-2.5 rounded-xl group-hover:scale-110 transition-transform`}><Icon className={`h-5 w-5 ${kb.iconColor}`} /></div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">{kb.value}</div>
                        <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5"><BarChart3 className="w-3 h-3" />{kb.hint}<span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">→</span></p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Ingestion Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex gap-2 items-center"><PlayCircle className="w-5 h-5 text-primary" />Quick Actions</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Start all services or trigger specific ingestion channels</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => handleIngestion('all')}
                isLoading={ingesting === 'all'}
                disabled={!hasMessageSources || isProcessing || processingStatus === 'processing' || processingStatus === 'complete'}
                className="w-full h-12 text-base font-semibold"
                size="lg"
                title={!hasMessageSources ? 'No message sources configured (email, gmail, telegram, or slack)' : isProcessing || processingStatus === 'processing' ? 'Email processing is already running. Please wait for completion.' : processingStatus === 'complete' ? 'Processing just completed. Wait for widget to close before starting again.' : ''}
              >
                <PlayCircle className="mr-2 w-5 h-5" />
                {isProcessing || processingStatus === 'processing' ? 'Processing...' : 'Start All Services'}
              </Button>
              {!hasMessageSources && (
                <p className="flex gap-1 justify-center items-center text-xs text-amber-600"><AlertTriangle className="w-3 h-3" />No message sources configured. Go to Settings to add email, Gmail, Telegram, or Slack integrations.</p>
              )}
              {(isProcessing || processingStatus === 'processing' || processingStatus === 'complete') && (
                <p className="flex gap-1 justify-center items-center text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {processingStatus === 'complete' ? 'Processing completed. Widget will close automatically...' : processingStage === 'kb-processing' ? 'Building knowledge base from attachments...' : 'Email processing in progress. Please wait...'}
                </p>
              )}
              {noNewMessagesInfo.show && (
                <p className="flex gap-1 justify-center items-center text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  All caught up! No new {noNewMessagesInfo.type === 'email' ? 'emails' : noNewMessagesInfo.type === 'telegram' ? 'Telegram messages' : 'messages'} found.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => handleIngestion('email')} isLoading={ingesting === 'email'} disabled={!hasEmailIntegrations || isProcessing || processingStatus === 'processing' || processingStatus === 'complete'} className="w-full" title={!hasEmailIntegrations ? 'No email integrations configured' : isProcessing || processingStatus === 'processing' ? 'Processing already in progress' : processingStatus === 'complete' ? 'Wait for widget to close' : ''}>
                  <Mail className="mr-2 w-4 h-4" />Email
                </Button>
                <Button variant="outline" onClick={() => handleIngestion('telegram')} isLoading={ingesting === 'telegram'} disabled={!hasTelegramIntegrations || isProcessing || processingStatus === 'processing' || processingStatus === 'complete'} className="w-full" title={!hasTelegramIntegrations ? 'No Telegram integration configured' : isProcessing || processingStatus === 'processing' ? 'Processing already in progress' : processingStatus === 'complete' ? 'Wait for widget to close' : ''}>
                  <Inbox className="mr-2 w-4 h-4" />Telegram
                </Button>
              </div>
            </CardContent>
          </Card>

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
