import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatisticsFetch } from '@/hooks/useStatisticsFetch';
import { BarChart3, Users, MessageSquare, Clock, RefreshCw } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { documentationService } from '@/services/documentation.service';
import { kbService, type KBEntry } from '@/services/kb.service';
import { statisticsService, type StatisticsData, type UserStatEntry, type MessageStatsData, type AIStatsData, type LabelStatEntry } from '@/services/statistics.service';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable } from '@/components/sla/SLAByPriorityTable';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { StatisticsOverviewTab } from '@/components/statistics/StatisticsOverviewTab';
import { StatisticsTeamTab } from '@/components/statistics/StatisticsTeamTab';
import { StatisticsMessagesTab } from '@/components/statistics/StatisticsMessagesTab';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';

type TabType = 'overview' | 'team' | 'messages' | 'sla';
const VALID_TABS: TabType[] = ['overview', 'team', 'messages', 'sla'];

export const StatisticsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hashTab = location.hash.replace('#', '') as TabType;
  const activeTab: TabType = VALID_TABS.includes(hashTab) ? hashTab : 'overview';

  const handleTabChange = (tabId: TabType) => {
    navigate(`/statistics#${tabId}`, { replace: true });
  };

  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [kbStats, setKbStats] = useState<{
    totalDocs: number;
    totalChunks: number;
    totalReferences: number;
  } | null>(null);
  const [kbEntries, setKbEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [teamDays, setTeamDays] = useState(30);
  const [msgDays, setMsgDays] = useState(30);
  const [aiDays, setAiDays] = useState(30);
  const [teamError, setTeamError] = useState<string | null>(null);

  const {
    data: teamData,
    loading: teamLoading,
    refreshing: teamRefreshing,
    refresh: refreshTeam,
  } = useStatisticsFetch<UserStatEntry[]>(
    statisticsService.getTeamStats,
    teamDays,
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
    msgDays,
    activeTab === 'messages'
  );

  const {
    data: aiStats,
    loading: aiLoading,
    refresh: refreshAI,
  } = useStatisticsFetch<AIStatsData>(
    statisticsService.getAIStats,
    aiDays,
    activeTab === 'overview'
  );

  const {
    data: labelStats,
    loading: labelLoading,
    refresh: refreshLabels,
  } = useStatisticsFetch<LabelStatEntry[]>(
    statisticsService.getLabelStats,
    msgDays,
    activeTab === 'messages'
  );

  const fetchStatistics = useCallback(async () => {
    try {
      const [statsResponse, kbStatsData, kbEntriesData] = await Promise.all([
        statisticsService.getAll(),
        documentationService.getStats(),
        kbService.getAll(),
      ]);
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
      setKbStats(kbStatsData);
      setKbEntries(Array.isArray(kbEntriesData?.data) ? kbEntriesData.data : []);
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
    setRefreshing(true);
    refreshAI();
    await fetchStatistics();
  };

  if (loading) {
    return (
      <Layout>
        <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
          <div className="animate-pulse">
            <div className="mb-4 w-1/4 h-8 rounded bg-muted" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 4 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={`stat-skeleton-${i}`} className="h-32 rounded bg-muted" />
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
        <div className="px-4 py-12 mx-auto w-full max-w-7xl text-center">
          <p className="text-muted-foreground">No statistics available</p>
        </div>
      </Layout>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'team', label: 'Team Performance', icon: <Users className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'sla', label: 'SLA', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full max-w-7xl pb-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Analytics & Statistics</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Comprehensive insights across channels, categories, and SLA performance
            </p>
          </div>
          {activeTab === 'overview' && (
            <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={refreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />Refresh
            </Button>
          )}
          {activeTab === 'team' && (
            <Button variant="outline" size="sm" onClick={refreshTeam} isLoading={teamRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />Refresh
            </Button>
          )}
          {activeTab === 'messages' && (
            <Button variant="outline" size="sm" onClick={() => { refreshMsg(); refreshLabels(); }} isLoading={msgRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />Refresh
            </Button>
          )}
          {activeTab === 'sla' && (
            <Button variant="outline" size="sm" onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['sla-summary'] });
              void queryClient.invalidateQueries({ queryKey: ['sla-breaches'] });
              void queryClient.invalidateQueries({ queryKey: ['sla-trends'] });
              void queryClient.invalidateQueries({ queryKey: ['sla-statistics'] });
            }}>
              <RefreshCw className="mr-2 w-4 h-4" />Refresh
            </Button>
          )}
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
          <StatisticsOverviewTab
            stats={stats}
            kbStats={kbStats}
            kbEntries={kbEntries}
            aiStats={aiStats}
            aiLoading={aiLoading}
            aiDays={aiDays}
            onAiDaysChange={setAiDays}
          />
        )}

        {activeTab === 'team' && (
          <StatisticsTeamTab
            teamData={teamData}
            teamLoading={teamLoading}
            teamError={teamError}
            teamDays={teamDays}
            onTeamDaysChange={setTeamDays}
          />
        )}

        {activeTab === 'messages' && (
          <StatisticsMessagesTab
            msgStats={msgStats}
            msgLoading={msgLoading}
            labelStats={labelStats}
            labelLoading={labelLoading}
            msgDays={msgDays}
            onMsgDaysChange={setMsgDays}
          />
        )}

        {activeTab === 'sla' && (
          <div id="panel-sla" role="tabpanel">
            <div className="space-y-6 pb-6">
              <SLAOverviewCards />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SLAByChannelChart />
                <SLAByPriorityTable />
              </div>
              <SLATrendChart />
              <SLABreachList />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
