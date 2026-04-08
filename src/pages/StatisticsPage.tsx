import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Mail,
  MessageSquare,
  Send,
  AlertTriangle,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  Brain,
  Cpu,
  BookOpen,
  FileText,
  CheckCircle,
  Activity,
  Users,
  Clock,
  Ticket,
  StickyNote,
  Bot,
  Globe,
  Timer,
  GitBranch,
  Tag,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable } from '@/components/sla/SLAByPriorityTable';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { cn } from '@/lib/utils';
import { documentationService } from '@/services/documentation.service';
import { kbService, type KBEntry } from '@/services/kb.service';
import { statisticsService, type StatisticsData, type UserStatEntry, type MessageStatsData, type AIStatsData, type LabelStatEntry } from '@/services/statistics.service';
import { useLocation, useNavigate } from 'react-router-dom';

type TabType = 'overview' | 'sla' | 'team' | 'messages' | 'ai' | 'labels';
const VALID_TABS: TabType[] = ['overview', 'sla', 'team', 'messages', 'ai', 'labels'];

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function fullName(entry: UserStatEntry): string {
  return entry.lastName ? `${entry.firstName} ${entry.lastName}` : entry.firstName;
}

function formatAvgReply(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

export const StatisticsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
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

  // Team tab state
  const [teamData, setTeamData] = useState<UserStatEntry[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamRefreshing, setTeamRefreshing] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamDays, setTeamDays] = useState(30);

  // Messages tab state
  const [msgStats, setMsgStats] = useState<MessageStatsData | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgRefreshing, setMsgRefreshing] = useState(false);
  const [msgDays, setMsgDays] = useState(30);

  // AI tab state
  const [aiStats, setAiStats] = useState<AIStatsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiDays, setAiDays] = useState(30);

  // Labels tab state
  const [labelStats, setLabelStats] = useState<LabelStatEntry[] | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelRefreshing, setLabelRefreshing] = useState(false);
  const [labelDays, setLabelDays] = useState(30);

  const fetchStatistics = async () => {
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
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatistics().catch((error) => {
      console.error('Failed to fetch statistics:', error);
    });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatistics();
  };

  const fetchTeamStats = async (days: number, isRefresh = false) => {
    if (isRefresh) setTeamRefreshing(true);
    else setTeamLoading(true);
    setTeamError(null);
    try {
      const response = await statisticsService.getTeamStats(days);
      if (response.success && response.data) {
        setTeamData(response.data);
      } else {
        setTeamError('Failed to load team stats.');
      }
    } catch {
      setTeamError('Failed to load team stats.');
    } finally {
      setTeamLoading(false);
      setTeamRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'team') {
      void fetchTeamStats(teamDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, teamDays]);

  const fetchMsgStats = async (days: number, isRefresh = false) => {
    if (isRefresh) setMsgRefreshing(true);
    else setMsgLoading(true);
    try {
      const response = await statisticsService.getMessageStats(days);
      if (response.success && response.data) setMsgStats(response.data);
    } catch { /* handled by empty state */ }
    finally { setMsgLoading(false); setMsgRefreshing(false); }
  };

  useEffect(() => {
    if (activeTab === 'messages') void fetchMsgStats(msgDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, msgDays]);

  const fetchAIStats = async (days: number, isRefresh = false) => {
    if (isRefresh) setAiRefreshing(true);
    else setAiLoading(true);
    try {
      const response = await statisticsService.getAIStats(days);
      if (response.success && response.data) setAiStats(response.data);
    } catch { /* handled by empty state */ }
    finally { setAiLoading(false); setAiRefreshing(false); }
  };

  useEffect(() => {
    if (activeTab === 'ai') void fetchAIStats(aiDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, aiDays]);

  const fetchLabelStats = async (days: number, isRefresh = false) => {
    if (isRefresh) setLabelRefreshing(true);
    else setLabelLoading(true);
    try {
      const response = await statisticsService.getLabelStats(days);
      if (response.success && response.data) setLabelStats(response.data);
    } catch { /* handled by empty state */ }
    finally { setLabelLoading(false); setLabelRefreshing(false); }
  };

  useEffect(() => {
    if (activeTab === 'labels') void fetchLabelStats(labelDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, labelDays]);

  const isSpamOrScam = (categoryName: string) => {
    const lowerName = categoryName.toLowerCase();
    return lowerName.includes('spam') || lowerName.includes('scam');
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'telegram':
        return <MessageSquare className="w-5 h-5" />;
      case 'slack':
        return <MessageSquare className="w-5 h-5" />;
      default:
        return <Send className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
          <div className="animate-pulse">
            <div className="mb-4 w-1/4 h-8 rounded bg-muted" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                // Index key is safe: array is immutable (recreated from text split), no reordering
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

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Analytics & Statistics</h1>
            <p className="mt-2 text-muted-foreground">
              Comprehensive insights across channels, categories, and SLA performance
            </p>
          </div>
          {activeTab === 'overview' && (
            <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={refreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          )}
          {activeTab === 'team' && (
            <Button variant="outline" size="sm" onClick={() => void fetchTeamStats(teamDays, true)} isLoading={teamRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          )}
          {activeTab === 'messages' && (
            <Button variant="outline" size="sm" onClick={() => void fetchMsgStats(msgDays, true)} isLoading={msgRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          )}
          {activeTab === 'ai' && (
            <Button variant="outline" size="sm" onClick={() => void fetchAIStats(aiDays, true)} isLoading={aiRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          )}
          {activeTab === 'labels' && (
            <Button variant="outline" size="sm" onClick={() => void fetchLabelStats(labelDays, true)} isLoading={labelRefreshing}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleTabChange('overview')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'overview'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Overview
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('sla')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'sla'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                SLA Performance
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('team')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'team'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Team Performance
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('messages')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'messages'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4" />
                Messages
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('ai')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'ai'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI Usage
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('labels')}
              className={cn(
                'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'labels'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Labels
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Messages</p>
                      <p className="mt-2 text-3xl font-bold">{stats.overview.totalMessages}</p>
                    </div>
                    <Inbox className="w-10 h-10 text-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
                      <p className="mt-2 text-3xl font-bold">{stats.overview.totalTickets}</p>
                    </div>
                    <TrendingUp className="w-10 h-10 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Spam Detected</p>
                      <p className="mt-2 text-3xl font-bold">{stats.overview.totalSpam}</p>
                    </div>
                    <AlertTriangle className="w-10 h-10 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Needs Info</p>
                      <p className="mt-2 text-3xl font-bold">{stats.overview.totalNeedsInfo}</p>
                    </div>
                    <Mail className="w-10 h-10 text-yellow-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Jira Synced</p>
                      <p className="mt-2 text-3xl font-bold">{stats.overview.jiraSyncedTickets}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stats.overview.totalTickets > 0
                          ? `${((stats.overview.jiraSyncedTickets / stats.overview.totalTickets) * 100).toFixed(0)}% of tickets`
                          : '0% of tickets'}
                      </p>
                    </div>
                    <ExternalLink className="w-10 h-10 text-blue-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Message Status Breakdown */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Active</p>
                  <p className="mt-1 text-2xl font-bold text-blue-600">{stats.overview.activeMessages}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stats.overview.totalMessages > 0
                      ? `${((stats.overview.activeMessages / stats.overview.totalMessages) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Resolved</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">{stats.overview.resolvedMessages}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stats.overview.totalMessages > 0
                      ? `${((stats.overview.resolvedMessages / stats.overview.totalMessages) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Closed</p>
                  <p className="mt-1 text-2xl font-bold text-gray-600">{stats.overview.closedMessages}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stats.overview.totalMessages > 0
                      ? `${((stats.overview.closedMessages / stats.overview.totalMessages) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Filtered</p>
                  <p className="mt-1 text-2xl font-bold text-orange-600">{stats.overview.filteredMessages}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stats.overview.totalMessages > 0
                      ? `${((stats.overview.filteredMessages / stats.overview.totalMessages) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Knowledge Base Statistics */}
            {kbStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex gap-2 items-center">
                    <Brain className="w-5 h-5" />
                    Knowledge Base
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* KB Entries by Type */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-muted-foreground">By Type</p>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold">{kbEntries.length}</p>
                        <p className="text-sm text-muted-foreground">Total Entries</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold">{kbEntries.filter((e) => e.type === 'qa_pair').length}</p>
                        <p className="text-sm text-muted-foreground">Q&A Pairs</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold">{kbEntries.filter((e) => e.type === 'document').length}</p>
                        <p className="text-sm text-muted-foreground">Documents</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold">{kbEntries.filter((e) => e.type === 'manual_entry').length}</p>
                        <p className="text-sm text-muted-foreground">Business Knowledge</p>
                      </div>
                    </div>
                  </div>

                  {/* KB Entries by Status */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-muted-foreground">By Status</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold text-green-600">
                          {kbEntries.filter((e) => e.approved).length}
                        </p>
                        <p className="text-sm text-muted-foreground">Approved</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold text-yellow-600">
                          {kbEntries.filter((e) => !e.approved && !e.hidden).length}
                        </p>
                        <p className="text-sm text-muted-foreground">Pending Review</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-2xl font-bold text-gray-600">
                          {kbEntries.filter((e) => e.hidden).length}
                        </p>
                        <p className="text-sm text-muted-foreground">Hidden</p>
                      </div>
                    </div>
                  </div>

                  {/* Documentation Stats */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-muted-foreground">
                      Documentation Uploads
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex gap-3 items-center p-4 rounded-lg border bg-card">
                        <BookOpen className="w-8 h-8 text-blue-500" />
                        <div>
                          <p className="text-2xl font-bold">{kbStats.totalDocs}</p>
                          <p className="text-sm text-muted-foreground">Documents</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center p-4 rounded-lg border bg-card">
                        <FileText className="w-8 h-8 text-green-500" />
                        <div>
                          <p className="text-2xl font-bold">{kbStats.totalChunks}</p>
                          <p className="text-sm text-muted-foreground">Chunks</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center p-4 rounded-lg border bg-card">
                        <CheckCircle className="w-8 h-8 text-purple-500" />
                        <div>
                          <p className="text-2xl font-bold">{kbStats.totalReferences}</p>
                          <p className="text-sm text-muted-foreground">Times Used</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Spam/Scam Alert Section */}
            {stats.topCategories.some((cat) => isSpamOrScam(cat.categoryName)) && (
              <Card className="bg-red-50 border-red-200">
                <CardHeader>
                  <CardTitle className="flex gap-2 items-center text-red-700">
                    <ShieldAlert className="w-5 h-5" />
                    Spam & Scam Detection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.topCategories
                      .filter((cat) => isSpamOrScam(cat.categoryName))
                      .map((category) => (
                        <div
                          key={category.categoryId}
                          className="p-3 rounded-lg border bg-red-500/10 dark:bg-red-500/10 border-red-500/20"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex gap-2 items-center">
                              <ShieldAlert className="w-4 h-4 text-red-600" />
                              <span className="font-medium text-red-600 dark:text-red-400">
                                {category.categoryName}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-red-600 dark:text-red-400">
                              {category.totalMessages} messages detected
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="flex gap-2 items-center">
                  <BarChart3 className="w-5 h-5" />
                  Top Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.topCategories
                    .filter((category) => category.categoryName !== 'Uncategorized')
                    .slice(0, 10)
                    .map((category) => {
                      const total = category.totalMessages;
                      const ticketRate = total > 0 ? (category.totalTickets / total) * 100 : 0;
                      const isSpamCategory = isSpamOrScam(category.categoryName);

                      return (
                        <div key={category.categoryId} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <div className="flex flex-1 gap-3 items-center">
                              {isSpamCategory && <ShieldAlert className="w-4 h-4 text-red-500" />}
                              <div
                                className={`font-medium text-sm ${isSpamCategory ? 'text-red-600' : ''}`}
                              >
                                {category.categoryName}
                              </div>
                              {isSpamCategory && (
                                <span className="flex gap-1 items-center px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full border border-red-300">
                                  <AlertTriangle className="w-3 h-3" />
                                  Spam/Scam
                                </span>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {category.totalMessages} messages • {category.totalTickets} tickets
                              </div>
                            </div>
                            <div
                              className={`text-sm font-medium ${isSpamCategory ? 'text-red-600' : 'text-green-600'}`}
                            >
                              {ticketRate.toFixed(0)}% conversion
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full ${isSpamCategory ? 'bg-red-500' : 'bg-primary'}`}
                              style={{
                                width: `${Math.min((category.totalMessages / stats.overview.totalMessages) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            {/* Channel Statistics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {stats.byChannel.map((channelStats) => {
                const conversionRate =
                  channelStats.totalMessages > 0
                    ? (channelStats.totalTickets / channelStats.totalMessages) * 100
                    : 0;

                return (
                  <Card key={channelStats.channel}>
                    <CardHeader>
                      <CardTitle className="flex gap-2 items-center capitalize">
                        {getChannelIcon(channelStats.channel)}
                        {channelStats.channel}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Channel Overview */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
                          <div className="text-xs text-muted-foreground">Messages</div>
                          <div className="text-2xl font-bold">{channelStats.totalMessages}</div>
                        </div>
                        <div className="p-3 rounded-lg border bg-green-500/10 dark:bg-green-500/10 border-green-500/20">
                          <div className="text-xs text-muted-foreground">Tickets</div>
                          <div className="text-2xl font-bold">{channelStats.totalTickets}</div>
                        </div>
                      </div>

                      {/* Conversion Rate */}
                      <div className="p-3 rounded-lg border bg-purple-500/10 dark:bg-purple-500/10 border-purple-500/20">
                        <div className="mb-1 text-xs text-muted-foreground">
                          Ticket Conversion Rate
                        </div>
                        <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                          {conversionRate.toFixed(1)}%
                        </div>
                      </div>

                      {/* Status Breakdown */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Unprocessed</span>
                          <span className="font-medium">{channelStats.unprocessedMessages}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Ticket Worthy</span>
                          <span className="font-medium text-green-600">
                            {channelStats.ticketWorthyCount}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Spam</span>
                          <span className="font-medium text-red-600">{channelStats.spamCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Needs Info</span>
                          <span className="font-medium text-yellow-600">
                            {channelStats.needsInfoCount}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 text-sm border-t">
                          <span className="flex gap-1 items-center text-muted-foreground">
                            <ExternalLink className="w-3 h-3" />
                            Jira Synced
                          </span>
                          <span className="font-medium text-blue-600">
                            {channelStats.jiraSyncedTickets}
                            {channelStats.totalTickets > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (
                                {(
                                  (channelStats.jiraSyncedTickets / channelStats.totalTickets) *
                                  100
                                ).toFixed(0)}
                                %)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Top Categories for Channel */}
                      {channelStats.categories.length > 0 && (
                        <div className="pt-4 border-t">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            Top Categories
                          </div>
                          <div className="space-y-2">
                            {channelStats.categories
                              .filter((cat) => cat.categoryName !== 'Uncategorized')
                              .slice(0, 5)
                              .map((cat) => {
                                const isCategorySpam = isSpamOrScam(cat.categoryName);
                                return (
                                  <div
                                    key={cat.categoryId}
                                    className="flex justify-between items-center text-sm"
                                  >
                                    <div className="flex flex-1 gap-1 items-center truncate">
                                      {isCategorySpam && (
                                        <ShieldAlert className="flex-shrink-0 w-3 h-3 text-red-500" />
                                      )}
                                      <span
                                        className={`truncate ${isCategorySpam ? 'font-medium text-red-600' : 'text-muted-foreground'}`}
                                      >
                                        {cat.categoryName}
                                      </span>
                                    </div>
                                    <span
                                      className={`font-medium ml-2 flex-shrink-0 ${isCategorySpam ? 'text-red-600' : ''}`}
                                    >
                                      {cat.messageCount}msg / {cat.ticketCount}tkts
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* AI Models Usage */}
            {stats.aiModels &&
              (stats.aiModels.totalAnalyzed > 0 || stats.aiModels.totalEmbedded > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex gap-2 items-center">
                      <Brain className="w-5 h-5" />
                      AI Models Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Message Processing Breakdown */}
                    <div className="p-4 mb-6 rounded-lg bg-muted/50">
                      <h3 className="mb-3 text-sm font-semibold">Message Processing Breakdown</h3>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div>
                          <div className="text-2xl font-bold">{stats.aiModels.totalMessages}</div>
                          <div className="text-xs text-muted-foreground">Total Messages</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-red-600">
                            {stats.aiModels.totalSpam}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Spam Filtered (
                            {Math.round(
                              (stats.aiModels.totalSpam / stats.aiModels.totalMessages) * 100
                            )}
                            %)
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-orange-600">
                            {stats.aiModels.totalUnprocessed}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Unprocessed (
                            {Math.round(
                              (stats.aiModels.totalUnprocessed / stats.aiModels.totalMessages) * 100
                            )}
                            %)
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {stats.aiModels.totalAnalyzed}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            AI Analyzed (
                            {Math.round(
                              (stats.aiModels.totalAnalyzed / stats.aiModels.totalMessages) * 100
                            )}
                            %)
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        💡 Only messages that pass spam filtering and are marked as processed go
                        through AI analysis
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {/* Analysis Providers */}
                      {stats.aiModels.analysisProviders.length > 0 && (
                        <div>
                          <div className="flex gap-2 items-center mb-3">
                            <Cpu className="w-4 h-4 text-purple-600" />
                            <h3 className="text-sm font-semibold">Analysis Providers</h3>
                            <span className="text-xs text-muted-foreground">
                              ({stats.aiModels.totalAnalyzed} messages)
                            </span>
                          </div>
                          <div className="space-y-2">
                            {stats.aiModels.analysisProviders.map((item) => (
                              <div
                                key={item.provider}
                                className="flex justify-between items-center"
                              >
                                <span className="text-sm capitalize">{item.provider}</span>
                                <div className="flex gap-2 items-center">
                                  <span className="text-sm font-medium">{item.count}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({item.percentage}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Embedding Providers */}
                      {stats.aiModels.embeddingProviders.length > 0 && (
                        <div>
                          <div className="flex gap-2 items-center mb-3">
                            <Cpu className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold">Embedding Providers</h3>
                            <span className="text-xs text-muted-foreground">
                              ({stats.aiModels.totalEmbedded} messages)
                            </span>
                          </div>
                          <div className="space-y-2">
                            {stats.aiModels.embeddingProviders.map((item) => (
                              <div
                                key={item.provider}
                                className="flex justify-between items-center"
                              >
                                <span className="text-sm capitalize">{item.provider}</span>
                                <div className="flex gap-2 items-center">
                                  <span className="text-sm font-medium">{item.count}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({item.percentage}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Analysis Models */}
                      {stats.aiModels.analysisModels.length > 0 && (
                        <div>
                          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                            Analysis Models
                          </h3>
                          <div className="space-y-2">
                            {stats.aiModels.analysisModels.map((item) => (
                              <div
                                key={item.model}
                                className="flex justify-between items-center text-xs"
                              >
                                <span className="font-mono">{item.model}</span>
                                <div className="flex gap-2 items-center">
                                  <span className="font-medium">{item.count}</span>
                                  <span className="text-muted-foreground">
                                    ({item.percentage}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Embedding Models */}
                      {stats.aiModels.embeddingModels.length > 0 && (
                        <div>
                          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                            Embedding Models
                          </h3>
                          <div className="space-y-2">
                            {stats.aiModels.embeddingModels.map((item) => (
                              <div
                                key={item.model}
                                className="flex justify-between items-center text-xs"
                              >
                                <span className="font-mono">{item.model}</span>
                                <div className="flex gap-2 items-center">
                                  <span className="font-medium">{item.count}</span>
                                  <span className="text-muted-foreground">
                                    ({item.percentage}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Category Accuracy */}
                    {stats.aiAccuracy &&
                      stats.aiAccuracy.length > 0 &&
                      (() => {
                        const totalPredictions = stats.aiAccuracy.reduce(
                          (sum, item) => sum + item.count,
                          0
                        );
                        const correctPredictions = stats.aiAccuracy
                          .filter((item) => item.suggestedCategoryName === item.actualCategoryName)
                          .reduce((sum, item) => sum + item.count, 0);
                        const accuracyRate =
                          totalPredictions > 0
                            ? Math.round((correctPredictions / totalPredictions) * 100)
                            : 0;

                        return (
                          <div className="pt-6 mt-6 border-t">
                            <div className="flex gap-2 items-center mb-4">
                              <BarChart3 className="w-4 h-4 text-purple-600" />
                              <h3 className="text-sm font-semibold">
                                Category Prediction Accuracy
                              </h3>
                              <span className="px-3 py-1 ml-auto text-sm font-semibold text-purple-600 rounded-full bg-purple-500/10 dark:text-purple-400">
                                {accuracyRate}% Match Rate
                              </span>
                            </div>

                            <div className="p-3 mb-4 rounded-lg bg-muted/50">
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <div className="text-lg font-bold">{totalPredictions}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Total Predictions
                                  </div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold text-green-600">
                                    {correctPredictions}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Correct</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold text-orange-600">
                                    {totalPredictions - correctPredictions}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Human Adjusted
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="overflow-y-auto space-y-2 max-h-64">
                              {stats.aiAccuracy
                                .sort((a, b) => b.count - a.count)
                                .slice(0, 15)
                                .map((item, index) => {
                                  const isMatch =
                                    item.suggestedCategoryName === item.actualCategoryName;
                                  return (
                                    <div
                                      // Index key is safe: array is immutable (recreated from text split), no reordering
                                      // eslint-disable-next-line react/no-array-index-key
                                      key={`${item.suggestedCategoryName}-${item.actualCategoryName}-${index}`}
                                      className="flex justify-between items-center p-2 text-xs rounded transition-colors hover:bg-muted/50"
                                    >
                                      <div className="flex flex-1 gap-2 items-center min-w-0">
                                        {isMatch ? (
                                          <div className="flex gap-1 items-center min-w-0">
                                            <span className="flex flex-shrink-0 justify-center items-center w-4 h-4 text-green-600 rounded-full bg-green-500/10 dark:text-green-400">
                                              ✓
                                            </span>
                                            <span className="font-medium text-green-600 truncate dark:text-green-400">
                                              {item.suggestedCategoryName}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex gap-1 items-center min-w-0">
                                            <span className="flex flex-shrink-0 justify-center items-center w-4 h-4 text-orange-600 rounded-full bg-orange-500/10 dark:text-orange-400">
                                              ✎
                                            </span>
                                            <span className="truncate text-muted-foreground">
                                              {item.suggestedCategoryName}
                                            </span>
                                            <span className="flex-shrink-0 text-muted-foreground">
                                              →
                                            </span>
                                            <span className="font-medium truncate">
                                              {item.actualCategoryName}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <span className="flex-shrink-0 ml-2 font-medium text-muted-foreground">
                                        {item.count}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })()}
                  </CardContent>
                </Card>
              )}
          </>
        )}

        {/* SLA Performance Tab */}
        {activeTab === 'sla' && (
          <div className="space-y-6 pb-6">
            <div className="animate-in fade-in duration-500">
              <SLAOverviewCards />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-500 delay-100">
              <SLAByChannelChart />
              <SLAByPriorityTable />
            </div>
            <div className="animate-in fade-in duration-500 delay-200">
              <SLATrendChart />
            </div>
            <div className="animate-in fade-in duration-500 delay-300">
              <SLABreachList />
            </div>
          </div>
        )}

        {/* Team Performance Tab */}
        {activeTab === 'team' && (
          <div className="space-y-4 pb-6">
            {/* Days selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <div className="flex rounded-md border border-border overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTeamDays(opt.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium transition-colors',
                      teamDays === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {teamError && (
              <Card>
                <CardContent className="py-4 text-sm text-destructive">{teamError}</CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Users className="w-4 h-4" />
                  Agent Stats — last {teamDays} days
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Agent</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Role</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1"><MessageSquare className="w-3.5 h-3.5" />Assigned</span>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Processed</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Replied</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1"><Clock className="w-3.5 h-3.5" />Avg Reply</span>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1"><Ticket className="w-3.5 h-3.5" />Tkts Assigned</span>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Tkts Resolved</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1"><StickyNote className="w-3.5 h-3.5" />Notes</span>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Unresolved</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Outgoing</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Confidence</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1"><Globe className="w-3.5 h-3.5" />Top Lang</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <tr key={i} className="border-b border-border">
                            {Array.from({ length: 13 }).map((__, j) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <td key={j} className="px-4 py-3">
                                <div className="h-4 rounded bg-muted animate-pulse" style={{ width: j === 0 ? '120px' : '60px' }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : teamData.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                            No agents found for this organisation.
                          </td>
                        </tr>
                      ) : (
                        teamData.map((entry) => {
                          const topLang = Object.entries(entry.stats.languageBreakdown ?? {})
                            .sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—';
                          return (
                          <tr
                            key={entry.userId}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{fullName(entry)}</div>
                              <div className="text-xs text-muted-foreground">{entry.email}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground capitalize">
                                {entry.orgRole.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesAssigned}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesProcessed}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesReplied}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {formatAvgReply(entry.stats.avgReplyTimeHours)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.ticketsAssigned}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.ticketsResolved}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.notesAdded}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-orange-600">
                              {entry.stats.unresolvedMessages}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{entry.stats.outgoingMessages}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {entry.stats.avgConfidence !== null ? `${(entry.stats.avgConfidence * 100).toFixed(0)}%` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums uppercase text-xs font-mono">
                              {topLang}
                            </td>
                          </tr>
                        );})
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="space-y-4 pb-6">
            {/* Days selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <div className="flex rounded-md border border-border overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMsgDays(opt.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium transition-colors',
                      msgDays === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {msgLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : msgStats ? (
              <>
                {/* Resolution Time Cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Avg Resolution</p>
                          <p className="mt-2 text-3xl font-bold">
                            {msgStats.resolutionTime.avgHours !== null
                              ? formatAvgReply(msgStats.resolutionTime.avgHours)
                              : '—'}
                          </p>
                        </div>
                        <Timer className="w-10 h-10 text-blue-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">P50 Resolution</p>
                          <p className="mt-2 text-3xl font-bold">
                            {msgStats.resolutionTime.p50Hours !== null
                              ? formatAvgReply(msgStats.resolutionTime.p50Hours)
                              : '—'}
                          </p>
                        </div>
                        <Activity className="w-10 h-10 text-green-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">P90 Resolution</p>
                          <p className="mt-2 text-3xl font-bold">
                            {msgStats.resolutionTime.p90Hours !== null
                              ? formatAvgReply(msgStats.resolutionTime.p90Hours)
                              : '—'}
                          </p>
                        </div>
                        <TrendingUp className="w-10 h-10 text-orange-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Closed Messages</p>
                          <p className="mt-2 text-3xl font-bold">{msgStats.resolutionTime.totalClosed}</p>
                        </div>
                        <CheckCircle className="w-10 h-10 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Thread Size Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5" />
                        Thread Size Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(msgStats.threadSizeDistribution).map(([bucket, cnt]) => (
                        <div key={bucket} className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{bucket} message{bucket === '1' ? '' : 's'}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{
                                  width: `${Math.round((cnt / Math.max(...Object.values(msgStats.threadSizeDistribution))) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium tabular-nums w-8 text-right">{cnt}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Language Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="w-5 h-5" />
                        Language Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {msgStats.languageBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No language data yet — new messages will be detected automatically.</p>
                      ) : (
                        msgStats.languageBreakdown.slice(0, 10).map((item) => {
                          const total = msgStats.languageBreakdown.reduce((s, r) => s + r.count, 0);
                          return (
                            <div key={item.language} className="flex justify-between items-center">
                              <span className="text-sm font-mono uppercase">{item.language}</span>
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-2 rounded-full bg-primary"
                                    style={{ width: `${Math.round((item.count / total) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium tabular-nums w-8 text-right">{item.count}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Category Trends */}
                {msgStats.categoryTrends.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Category Trends by Week
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Category</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Week</th>
                              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Messages</th>
                            </tr>
                          </thead>
                          <tbody>
                            {msgStats.categoryTrends.slice(0, 30).map((row, i) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <tr key={`${row.categoryName}-${row.week}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                                <td className="px-4 py-2">{row.categoryName}</td>
                                <td className="px-4 py-2 text-muted-foreground">{row.week}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{row.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No message statistics available.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* AI Usage Tab */}
        {activeTab === 'ai' && (
          <div className="space-y-4 pb-6">
            {/* Days selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <div className="flex rounded-md border border-border overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAiDays(opt.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium transition-colors',
                      aiDays === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {aiLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : aiStats ? (
              <>
                {/* AI vs Human Summary Cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">AI Responded</p>
                          <p className="mt-2 text-3xl font-bold text-blue-600">{aiStats.summary.aiResponded}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{aiStats.summary.aiPercentage}% of responded</p>
                        </div>
                        <Bot className="w-10 h-10 text-blue-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Human Responded</p>
                          <p className="mt-2 text-3xl font-bold text-green-600">{aiStats.summary.humanResponded}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{aiStats.summary.aiPercentage < 100 ? 100 - aiStats.summary.aiPercentage : 0}% of responded</p>
                        </div>
                        <Users className="w-10 h-10 text-green-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">No Response</p>
                          <p className="mt-2 text-3xl font-bold text-gray-500">{aiStats.summary.noResponse}</p>
                        </div>
                        <Inbox className="w-10 h-10 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* AI Reply Count Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        AI Reply Count Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(aiStats.aiReplyDistribution).map(([bucket, cnt]) => {
                        const total = Object.values(aiStats.aiReplyDistribution).reduce((s, v) => s + v, 0);
                        return (
                          <div key={bucket} className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{bucket} AI {bucket === '1' ? 'reply' : 'replies'}</span>
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{ width: total > 0 ? `${Math.round((cnt / total) * 100)}%` : '0%' }}
                                />
                              </div>
                              <span className="text-sm font-medium tabular-nums w-8 text-right">{cnt}</span>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {/* Responded By breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        First Response By
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {aiStats.respondedBy.map((item) => {
                        const total = aiStats.respondedBy.reduce((s, r) => s + r.count, 0);
                        return (
                          <div key={item.respondedBy} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{item.respondedBy === 'none' ? 'Not responded' : item.respondedBy}</span>
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{ width: total > 0 ? `${Math.round((item.count / total) * 100)}%` : '0%' }}
                                />
                              </div>
                              <span className="text-sm font-medium tabular-nums w-8 text-right">{item.count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                {/* Model usage */}
                {(aiStats.analysisModels.length > 0 || aiStats.embeddingModels.length > 0) && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {aiStats.analysisModels.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Cpu className="w-5 h-5" />
                            Analysis Models
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {aiStats.analysisModels.map((item) => (
                            <div key={item.model} className="flex justify-between items-center text-sm">
                              <span className="font-mono text-xs">{item.model}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.count}</span>
                                <span className="text-muted-foreground text-xs">({item.percentage}%)</span>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                    {aiStats.embeddingModels.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Brain className="w-5 h-5" />
                            Embedding Models
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {aiStats.embeddingModels.map((item) => (
                            <div key={item.model} className="flex justify-between items-center text-sm">
                              <span className="font-mono text-xs">{item.model}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.count}</span>
                                <span className="text-muted-foreground text-xs">({item.percentage}%)</span>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No AI statistics available.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Labels Tab */}
        {activeTab === 'labels' && (
          <div className="space-y-4 pb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <div className="flex rounded-md border border-border overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLabelDays(opt.value)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium transition-colors',
                      labelDays === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {labelLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`label-skeleton-${i}`} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : labelStats && labelStats.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    Label Message Counts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const sorted = [...labelStats].sort((a, b) => b.messageCount - a.messageCount);
                    const max = Math.max(...labelStats.map((e) => e.messageCount), 1);
                    return sorted.map((entry) => (
                        <div key={entry.labelId} className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="w-40 truncate text-sm font-medium">{entry.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(entry.messageCount / max) * 100}%`,
                                backgroundColor: entry.color,
                              }}
                            />
                          </div>
                          <span className="text-sm font-semibold w-10 text-right">{entry.messageCount}</span>
                        </div>
                      ));
                  })()}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No label statistics available.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};
