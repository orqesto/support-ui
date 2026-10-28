import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatisticsFetch } from '@/hooks/useStatisticsFetch';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { BarChart3, Users, Activity, RefreshCw, Cpu, Coins } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import {
  dayPresets,
  periodFromSearch,
  periodKey,
  periodToPickerValue,
  periodToSearch,
  pickerValueToPeriod,
  type ReportPeriod,
} from '@/lib/reportPeriod';
import { cn } from '@/lib/utils';
import { statisticsService, type StatisticsData, type UserStatEntry, type MessageStatsData, type AIStatsData, type LabelStatEntry, type SpeedToLeadData, type SLASummary } from '@/services/statistics.service';
import { StatisticsOverviewTab } from '@/components/statistics/StatisticsOverviewTab';
import { StatisticsTeamTab } from '@/components/statistics/StatisticsTeamTab';
import { PerformanceTab } from '@/components/statistics/PerformanceTab';
import { DiagnosticsTab } from '@/components/statistics/DiagnosticsTab';
import { TokenUsageTab } from '@/components/statistics/TokenUsageTab';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';

type TabType = 'overview' | 'performance' | 'team' | 'diagnostics' | 'tokens';
const VALID_TABS: TabType[] = ['overview', 'performance', 'team', 'diagnostics', 'tokens'];
// Admin-only tabs (internal AI/model + cost metrics).
const ADMIN_TABS: TabType[] = ['diagnostics', 'tokens'];

// Old per-source hashes now live inside the merged Performance tab.
const LEGACY_TAB_REDIRECTS: Record<string, TabType> = {
  sla: 'performance',
  messages: 'performance',
  speedToLead: 'performance',
};

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All Channels' },
  { value: 'email', label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'slack', label: 'Slack' },
  { value: 'chat', label: 'Chat Widget' },
  { value: 'other', label: 'Other' },
];

const DAYS_PRESETS = dayPresets([
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
]);

export const StatisticsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOrgAdmin } = usePermissions();
  const rawHash = location.hash.replace('#', '');
  const hashTab: TabType = LEGACY_TAB_REDIRECTS[rawHash] ?? (rawHash as TabType);
  // Diagnostics is admin-only — a non-admin landing on #diagnostics falls back to Overview.
  const activeTab: TabType =
    VALID_TABS.includes(hashTab) && (!ADMIN_TABS.includes(hashTab) || isOrgAdmin)
      ? hashTab
      : 'overview';

  const handleTabChange = (tabId: TabType) => {
    navigate({ pathname: '/statistics', search: location.search, hash: tabId }, { replace: true });
  };

  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Phase A: one shared date window for every tab, synced to the URL (?days= or, for a custom
  // range, ?from=&to=) so it survives tab switches and is shareable.
  const [period, setPeriodState] = useState<ReportPeriod>(() =>
    periodFromSearch(location.search, 30)
  );
  const { days } = period;
  // Channel filter — shared across tabs, synced to the URL (?channel=). 'all' = no filter.
  const [channel, setChannelState] = useState<string>(
    () => new URLSearchParams(location.search).get('channel') ?? 'all'
  );
  const syncUrl = (nextPeriod: ReportPeriod, nextChannel: string) => {
    const params = periodToSearch(nextPeriod, new URLSearchParams());
    if (nextChannel !== 'all') params.set('channel', nextChannel);
    navigate(
      { pathname: '/statistics', search: `?${params.toString()}`, hash: activeTab },
      { replace: true }
    );
  };
  const setPeriod = (next: ReportPeriod) => {
    setPeriodState(next);
    syncUrl(next, channel);
  };
  const setChannel = (next: string) => {
    setChannelState(next);
    syncUrl(period, next);
  };
  const [teamError, setTeamError] = useState<string | null>(null);

  const {
    data: speedData,
    loading: speedLoading,
    refreshing: speedRefreshing,
    refresh: refreshSpeed,
  } = useStatisticsFetch<SpeedToLeadData>(
    statisticsService.getSpeedToLead,
    period,
    channel,
    activeTab === 'performance' || activeTab === 'overview'
  );

  const {
    data: teamData,
    loading: teamLoading,
    refreshing: teamRefreshing,
    refresh: refreshTeam,
  } = useStatisticsFetch<UserStatEntry[]>(
    statisticsService.getTeamStats,
    period,
    channel,
    activeTab === 'team',
    setTeamError
  );

  const {
    data: msgStats,
    loading: msgLoading,
    refreshing: msgRefreshing,
    refresh: refreshMsg,
  } = useStatisticsFetch<MessageStatsData>(
    statisticsService.getMessageStats,
    period,
    channel,
    activeTab === 'performance' || activeTab === 'overview'
  );

  const { data: slaSummary } = useStatisticsFetch<SLASummary>(
    statisticsService.getSlaSummary,
    period,
    channel,
    activeTab === 'overview'
  );

  const {
    data: aiStats,
    loading: aiLoading,
    refresh: refreshAI,
  } = useStatisticsFetch<AIStatsData>(
    statisticsService.getAIStats,
    period,
    channel,
    activeTab === 'overview'
  );

  const {
    data: labelStats,
    loading: labelLoading,
    refresh: refreshLabels,
  } = useStatisticsFetch<LabelStatEntry[]>(
    statisticsService.getLabelStats,
    period,
    channel,
    activeTab === 'performance'
  );

  // The Overview follows the shared bar and the department selector like every other tab
  // (D-H2): it fetched once, with no window, no channel and no department key, so it showed the
  // 90-day all-channel figures of the department selected at page load.
  const selectedDeptKey = useDepartmentContextKey();
  const fetchStatistics = useCallback(async () => {
    try {
      const statsResponse = await statisticsService.getAll(period, channel);
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
    } catch (error) {
      logger.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // selectedDeptKey is a refresh trigger read indirectly through the axios interceptor
    // (X-Department-Context), as in useStatisticsFetch.
    // A new period object for the same window (periodKey) must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey(period), channel, selectedDeptKey]);

  useEffect(() => {
    fetchStatistics().catch((error) => {
      logger.error('Failed to fetch statistics:', error);
    });
  }, [fetchStatistics]);

  const handleRefresh = async () => {
    switch (activeTab) {
      case 'team':
        refreshTeam();
        break;
      case 'performance':
        // Merged tab: refresh Messages + Speed-to-Lead data and the SLA queries.
        refreshMsg();
        refreshLabels();
        refreshSpeed();
        void queryClient.invalidateQueries({ queryKey: ['sla-summary'] });
        void queryClient.invalidateQueries({ queryKey: ['sla-breaches'] });
        void queryClient.invalidateQueries({ queryKey: ['sla-trends'] });
        void queryClient.invalidateQueries({ queryKey: ['sla-statistics'] });
        break;
      case 'overview':
      default:
        setRefreshing(true);
        refreshAI();
        await fetchStatistics();
        break;
    }
  };

  if (loading) {
    return (
      <>
        <div className="px-4 mx-auto space-y-4 w-full">
          <div className="animate-pulse">
            <div className="mb-4 w-1/4 h-8 rounded bg-muted" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 4 }).map((_, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={`stat-skeleton-${idx}`} className="h-32 rounded bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <div className="px-4 py-12 mx-auto w-full text-center">
          <p className="text-muted-foreground">No statistics available</p>
        </div>
      </>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'performance', label: 'Performance', icon: <Activity className="w-4 h-4" /> },
    { id: 'team', label: 'Agent Performance', icon: <Users className="w-4 h-4" /> },
    // Admin-only: AI/model internals split out of the customer-facing Overview.
    ...(isOrgAdmin
      ? [
          { id: 'diagnostics' as const, label: 'Diagnostics', icon: <Cpu className="w-4 h-4" /> },
          { id: 'tokens' as const, label: 'Token Usage', icon: <Coins className="w-4 h-4" /> },
        ]
      : []),
  ];

  return (
    <>
      <div className="px-4 mx-auto space-y-6 w-full pb-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Analytics & Statistics</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Comprehensive insights across channels, categories, and SLA performance
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={refreshing || teamRefreshing || speedRefreshing || msgRefreshing}
          >
            <RefreshCw className="mr-2 w-4 h-4" />Refresh
          </Button>
        </div>

        {/* Shared filter bar — one date window + channel drive every tab
            (department is controlled globally via the X-Department-Context selector). */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            <DateRangePicker
              ariaLabel="Period"
              presets={DAYS_PRESETS}
              value={periodToPickerValue(period)}
              onChange={(next) => setPeriod(pickerValueToPeriod(next))}
              maxSpanDays={365}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Channel:</span>
            <Select
              value={channel}
              onChange={setChannel}
              options={CHANNEL_OPTIONS}
              aria-label="Channel"
              className="min-w-[10rem]"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b overflow-x-auto">
          <div className="flex gap-1 min-w-max" role="tablist" aria-label="Statistics sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'font-display px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-2">{tab.icon}{tab.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div id="panel-overview" role="tabpanel">
            <StatisticsOverviewTab
              stats={stats}
              aiStats={aiStats}
              aiLoading={aiLoading}
              isOrgAdmin={isOrgAdmin}
              onDrill={handleTabChange}
              kpi={{
                actionable: stats.overview.actionableMessages,
                openBacklog: stats.overview.activeMessages,
                aiHandledPct: aiStats?.summary.aiPercentage ?? null,
                medianFirstResponseHours: msgStats?.firstResponseTime.p50Hours ?? null,
                leadsAtRiskValue: speedData?.estimatedLostValue ?? null,
                slaCompliancePct: slaSummary?.messages.complianceRate ?? null,
              }}
            />
          </div>
        )}

        {activeTab === 'performance' && (
          <PerformanceTab
            days={days}
            period={period}
            msgStats={msgStats}
            msgLoading={msgLoading}
            labelStats={labelStats}
            labelLoading={labelLoading}
            speedData={speedData}
            speedLoading={speedLoading}
            speedDays={days}
          />
        )}

        {activeTab === 'team' && (
          <div id="panel-team" role="tabpanel">
            <StatisticsTeamTab
              teamData={teamData}
              teamLoading={teamLoading}
              teamError={teamError}
              teamDays={days}
            />
          </div>
        )}

        {activeTab === 'diagnostics' && isOrgAdmin && (
          <DiagnosticsTab stats={stats} />
        )}

        {activeTab === 'tokens' && isOrgAdmin && (
          <div id="panel-tokens" role="tabpanel">
            <TokenUsageTab period={period} />
          </div>
        )}
      </div>
    </>
  );
};
