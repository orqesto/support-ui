import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatisticsFetch } from '@/hooks/useStatisticsFetch';
import { BarChart3, Users, Activity, RefreshCw, Cpu } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { statisticsService, type StatisticsData, type UserStatEntry, type MessageStatsData, type AIStatsData, type LabelStatEntry, type SpeedToLeadData, type SLASummary } from '@/services/statistics.service';
import { StatisticsOverviewTab } from '@/components/statistics/StatisticsOverviewTab';
import { StatisticsTeamTab } from '@/components/statistics/StatisticsTeamTab';
import { PerformanceTab } from '@/components/statistics/PerformanceTab';
import { DiagnosticsTab } from '@/components/statistics/DiagnosticsTab';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';

type TabType = 'overview' | 'performance' | 'team' | 'diagnostics';
const VALID_TABS: TabType[] = ['overview', 'performance', 'team', 'diagnostics'];

// Old per-source hashes now live inside the merged Performance tab.
const LEGACY_TAB_REDIRECTS: Record<string, TabType> = {
  sla: 'performance',
  messages: 'performance',
  speedToLead: 'performance',
};

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
];

export const StatisticsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOrgAdmin } = usePermissions();
  const rawHash = location.hash.replace('#', '');
  const hashTab: TabType = LEGACY_TAB_REDIRECTS[rawHash] ?? (rawHash as TabType);
  // Diagnostics is admin-only — a non-admin landing on #diagnostics falls back to Overview.
  const activeTab: TabType =
    VALID_TABS.includes(hashTab) && (hashTab !== 'diagnostics' || isOrgAdmin) ? hashTab : 'overview';

  const handleTabChange = (tabId: TabType) => {
    navigate({ pathname: '/statistics', search: location.search, hash: tabId }, { replace: true });
  };

  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Phase A: one shared date window for every tab, synced to the URL (?days=)
  // so it survives tab switches and is shareable. Replaces the old per-tab selectors.
  const [days, setDaysState] = useState<number>(() => {
    const parsed = Number(new URLSearchParams(location.search).get('days'));
    return parsed > 0 ? parsed : 30;
  });
  const setDays = (next: number) => {
    setDaysState(next);
    navigate({ pathname: '/statistics', search: `?days=${next}`, hash: activeTab }, { replace: true });
  };
  const [teamError, setTeamError] = useState<string | null>(null);

  const {
    data: speedData,
    loading: speedLoading,
    refreshing: speedRefreshing,
    refresh: refreshSpeed,
  } = useStatisticsFetch<SpeedToLeadData>(
    statisticsService.getSpeedToLead,
    days,
    activeTab === 'performance' || activeTab === 'overview'
  );

  const {
    data: teamData,
    loading: teamLoading,
    refreshing: teamRefreshing,
    refresh: refreshTeam,
  } = useStatisticsFetch<UserStatEntry[]>(
    statisticsService.getTeamStats,
    days,
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
    days,
    activeTab === 'performance' || activeTab === 'overview'
  );

  const { data: slaSummary } = useStatisticsFetch<SLASummary>(
    statisticsService.getSlaSummary,
    days,
    activeTab === 'overview'
  );

  const {
    data: aiStats,
    loading: aiLoading,
    refresh: refreshAI,
  } = useStatisticsFetch<AIStatsData>(
    statisticsService.getAIStats,
    days,
    activeTab === 'overview'
  );

  const {
    data: labelStats,
    loading: labelLoading,
    refresh: refreshLabels,
  } = useStatisticsFetch<LabelStatEntry[]>(
    statisticsService.getLabelStats,
    days,
    activeTab === 'performance'
  );

  const fetchStatistics = useCallback(async () => {
    try {
      const statsResponse = await statisticsService.getAll();
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
    } catch (error) {
      logger.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
      <Layout>
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
      </Layout>
    );
  }

  if (!stats) {
    return (
      <Layout>
        <div className="px-4 py-12 mx-auto w-full text-center">
          <p className="text-muted-foreground">No statistics available</p>
        </div>
      </Layout>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'performance', label: 'Performance', icon: <Activity className="w-4 h-4" /> },
    { id: 'team', label: 'Team Performance', icon: <Users className="w-4 h-4" /> },
    // Admin-only: AI/model internals split out of the customer-facing Overview.
    ...(isOrgAdmin
      ? [{ id: 'diagnostics' as const, label: 'Diagnostics', icon: <Cpu className="w-4 h-4" /> }]
      : []),
  ];

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full pb-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Analytics & Statistics</h1>
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

        {/* Shared filter bar — one date window drives every tab (department is
            controlled globally via the X-Department-Context selector). */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  days === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
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
                  'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
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
      </div>
    </Layout>
  );
};
