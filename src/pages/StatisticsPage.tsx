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
import { statisticsService, type StatisticsData } from '@/services/statistics.service';

type TabType = 'overview' | 'sla';

export const StatisticsPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [kbStats, setKbStats] = useState<{
    totalDocs: number;
    totalChunks: number;
    totalReferences: number;
  } | null>(null);
  const [kbEntries, setKbEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
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
              onClick={() => setActiveTab('sla')}
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
                        <p className="text-sm text-muted-foreground">Q&A Pairs</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <p className="text-sm text-muted-foreground">Documents</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
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
          <div className="space-y-6">
            <SLAOverviewCards />

            <div className="grid grid-cols-2 gap-6">
              <SLAByChannelChart />
              <SLAByPriorityTable />
            </div>

            <SLATrendChart />

            <SLABreachList />
          </div>
        )}
      </div>
    </Layout>
  );
};
