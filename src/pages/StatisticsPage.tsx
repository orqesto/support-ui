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
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { statisticsService, type StatisticsData } from '../services/statistics.service';

export const StatisticsPage = () => {
  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatistics = async () => {
    try {
      const response = await statisticsService.getAll();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
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
        return <Mail className="h-5 w-5" />;
      case 'telegram':
        return <MessageSquare className="h-5 w-5" />;
      case 'slack':
        return <MessageSquare className="h-5 w-5" />;
      default:
        return <Send className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-4" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded" />
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
        <div className="max-w-7xl mx-auto text-center py-12">
          <p className="text-muted-foreground">No statistics available</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics & Statistics</h1>
            <p className="text-muted-foreground mt-2">
              Comprehensive insights across channels, categories, and tickets
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Messages</p>
                  <p className="text-3xl font-bold mt-2">{stats.overview.totalMessages}</p>
                </div>
                <Inbox className="h-10 w-10 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
                  <p className="text-3xl font-bold mt-2">{stats.overview.totalTickets}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Spam Detected</p>
                  <p className="text-3xl font-bold mt-2">{stats.overview.totalSpam}</p>
                </div>
                <AlertTriangle className="h-10 w-10 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Needs Info</p>
                  <p className="text-3xl font-bold mt-2">{stats.overview.totalNeedsInfo}</p>
                </div>
                <Mail className="h-10 w-10 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Spam/Scam Alert Section */}
        {stats.topCategories.some((cat) => isSpamOrScam(cat.categoryName)) && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-5 w-5" />
                ⚠️ Spam & Scam Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topCategories
                  .filter((cat) => isSpamOrScam(cat.categoryName))
                  .map((category) => (
                    <div
                      key={category.categoryId}
                      className="p-3 bg-red-500/10 dark:bg-red-500/10 rounded-lg border border-red-500/20"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-red-600" />
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {category.categoryName}
                          </span>
                        </div>
                        <div className="text-sm text-red-600 dark:text-red-400 font-medium">
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
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {isSpamCategory && <ShieldAlert className="h-4 w-4 text-red-500" />}
                          <div
                            className={`font-medium text-sm ${isSpamCategory ? 'text-red-600' : ''}`}
                          >
                            {category.categoryName}
                          </div>
                          {isSpamCategory && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full border border-red-300">
                              ⚠️ Spam/Scam
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
                      <div className="w-full bg-muted rounded-full h-2">
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

        {/* AI Category Accuracy */}
        {stats.aiAccuracy && stats.aiAccuracy.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                AI Category Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.aiAccuracy
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 10)
                  .map((item, index) => {
                    const isMatch = item.suggestedCategoryName === item.actualCategoryName;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-sm">
                            <span className="font-medium">AI Suggested:</span>{' '}
                            <span
                              className={
                                isMatch
                                  ? 'text-green-600 dark:text-green-400 font-medium'
                                  : 'text-muted-foreground'
                              }
                            >
                              {item.suggestedCategoryName}
                            </span>
                          </div>
                          <span className="text-muted-foreground">→</span>
                          <div className="text-sm">
                            <span className="font-medium">User Selected:</span>{' '}
                            <span
                              className={
                                isMatch
                                  ? 'text-green-600 dark:text-green-400 font-medium'
                                  : 'text-primary font-medium'
                              }
                            >
                              {item.actualCategoryName}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isMatch && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">
                              ✓ Match
                            </span>
                          )}
                          <span className="text-sm font-medium text-muted-foreground">
                            {item.count} {item.count === 1 ? 'ticket' : 'tickets'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Channel Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {stats.byChannel.map((channelStats) => {
            const conversionRate =
              channelStats.totalMessages > 0
                ? (channelStats.totalTickets / channelStats.totalMessages) * 100
                : 0;

            return (
              <Card key={channelStats.channel}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    {getChannelIcon(channelStats.channel)}
                    {channelStats.channel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Channel Overview */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-500/10 dark:bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div className="text-xs text-muted-foreground">Messages</div>
                      <div className="text-2xl font-bold">{channelStats.totalMessages}</div>
                    </div>
                    <div className="p-3 bg-green-500/10 dark:bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="text-xs text-muted-foreground">Tickets</div>
                      <div className="text-2xl font-bold">{channelStats.totalTickets}</div>
                    </div>
                  </div>

                  {/* Conversion Rate */}
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/10 rounded-lg border border-purple-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Ticket Conversion Rate</div>
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
                  </div>

                  {/* Top Categories for Channel */}
                  {channelStats.categories.length > 0 && (
                    <div className="pt-4 border-t">
                      <div className="text-xs font-medium text-muted-foreground mb-2">
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
                                <div className="flex items-center gap-1 truncate flex-1">
                                  {isCategorySpam && (
                                    <ShieldAlert className="h-3 w-3 text-red-500 flex-shrink-0" />
                                  )}
                                  <span
                                    className={`truncate ${isCategorySpam ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
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
      </div>
    </Layout>
  );
};
