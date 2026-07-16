import {
  BarChart3,
  Mail,
  MessageSquare,
  Send,
  AlertTriangle,
  Inbox,
  ShieldAlert,
  Users,
  Ticket,
  Bot,
  HelpCircle,
  Link2,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { StatisticsData, AIStatsData } from '@/services/statistics.service';

type DrillTab = 'overview' | 'performance' | 'team' | 'diagnostics';

interface Props {
  stats: StatisticsData;
  aiStats: AIStatsData | null;
  aiLoading: boolean;
  isOrgAdmin: boolean;
  onDrill: (tab: DrillTab) => void;
  kpi: {
    actionable: number;
    openBacklog: number;
    aiHandledPct: number | null;
    medianFirstResponseHours: number | null;
    leadsAtRiskValue: number | null;
    slaCompliancePct: number | null;
  };
}

function fmtHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}
function fmtPct(pct: number | null): string {
  return pct === null ? '—' : `${Math.round(pct)}%`;
}

function isSpamOrScam(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return lower.includes('spam') || lower.includes('scam');
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email':
      return <Mail className="w-5 h-5" />;
    case 'telegram':
    case 'slack':
      return <MessageSquare className="w-5 h-5" />;
    default:
      return <Send className="w-5 h-5" />;
  }
}

export function StatisticsOverviewTab({ stats, aiStats, aiLoading, isOrgAdmin, onDrill, kpi }: Props) {
  return (
    <div id="panel-overview" role="tabpanel" className="space-y-8 pt-4">
      {/* KPI pulse — headline metrics; clickable ones drill into the detail tab */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {([
          { label: 'Actionable inbound', value: String(kpi.actionable), drill: null as DrillTab | null },
          { label: 'Open backlog', value: String(kpi.openBacklog), drill: 'team' as DrillTab | null },
          { label: 'SLA compliance', value: fmtPct(kpi.slaCompliancePct), drill: 'performance' as DrillTab | null },
          { label: 'Median first response', value: fmtHours(kpi.medianFirstResponseHours), drill: 'performance' as DrillTab | null },
          { label: 'AI-handled', value: fmtPct(kpi.aiHandledPct), drill: (isOrgAdmin ? 'diagnostics' : 'performance') as DrillTab | null },
          { label: 'Leads at risk', value: kpi.leadsAtRiskValue === null ? '—' : `€${Math.round(kpi.leadsAtRiskValue).toLocaleString()}`, drill: 'performance' as DrillTab | null },
        ]).map((item) => {
          const drill = item.drill;
          const body = (
            <>
              <p className="text-xs font-medium text-muted-foreground truncate">{item.label}</p>
              <p className="mt-1 text-2xl font-bold">{item.value}</p>
              {drill && <p className="mt-1 text-[10px] text-primary">View →</p>}
            </>
          );
          return drill ? (
            <button key={item.label} type="button" onClick={() => onDrill(drill)} className="rounded-lg border bg-card p-4 text-left hover:border-primary transition-colors">{body}</button>
          ) : (
            <div key={item.label} className="rounded-lg border bg-card p-4">{body}</div>
          );
        })}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">All Conversations</p><p className="mt-2 text-3xl font-bold">{stats.overview.totalMessages}</p><p className="mt-1 text-xs text-muted-foreground">Actionable: {stats.overview.actionableMessages}{stats.meta?.truncated && stats.meta.conversationsTotal ? ` · showing 50k of ${stats.meta.conversationsTotal.toLocaleString()}` : ''}</p></div><Inbox className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Total Tickets</p><p className="mt-2 text-3xl font-bold">{stats.overview.totalTickets}</p></div><Ticket className="w-10 h-10 text-green-400" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Spam Detected</p><p className="mt-2 text-3xl font-bold">{stats.overview.totalSpam}</p></div><AlertTriangle className="w-10 h-10 text-red-400" /></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Needs Info</p><p className="mt-2 text-3xl font-bold">{stats.overview.totalNeedsInfo}</p></div><HelpCircle className="w-10 h-10 text-amber-400" /></div></CardContent></Card>
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
              <Link2 className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message Status Breakdown */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {[
          { label: 'Active', value: stats.overview.activeMessages, color: 'text-blue-600' },
          { label: 'Resolved', value: stats.overview.resolvedMessages, color: 'text-green-600' },
          { label: 'Closed', value: stats.overview.closedMessages, color: 'text-gray-600' },
          { label: 'Filtered', value: stats.overview.filteredMessages, color: 'text-orange-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.overview.totalMessages > 0
                  ? `${((value / stats.overview.totalMessages) * 100).toFixed(0)}% of all`
                  : '—'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Knowledge Base stats moved to the KB page (Phase C). */}

      {/* Spam/Scam Alert Section */}
      {stats.topCategories.some((cat) => isSpamOrScam(cat.categoryName)) && (
        <Card className="bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
          <CardHeader><CardTitle className="flex gap-2 items-center text-red-700 dark:text-red-400"><ShieldAlert className="w-5 h-5" />Spam &amp; Scam Detection</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topCategories.filter((cat) => isSpamOrScam(cat.categoryName)).map((category) => (
                <div key={category.categoryId} className="p-3 rounded-lg border bg-red-500/10 dark:bg-red-500/10 border-red-500/20">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2 items-center"><ShieldAlert className="w-4 h-4 text-red-600" /><span className="font-medium text-red-600 dark:text-red-400">{category.categoryName}</span></div>
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">{category.totalMessages} messages detected</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Categories */}
      <Card>
        <CardHeader><CardTitle className="flex gap-2 items-center"><BarChart3 className="w-5 h-5" />Top Categories</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.topCategories.filter((cat) => cat.categoryName !== 'Uncategorized').slice(0, 10).map((category) => {
              const total = category.totalMessages;
              const ticketRate = total > 0 ? (category.totalTickets / total) * 100 : 0;
              const isSpamCat = isSpamOrScam(category.categoryName);
              return (
                <div key={category.categoryId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-1 gap-3 items-center">
                      {isSpamCat && <ShieldAlert className="w-4 h-4 text-red-500" />}
                      <div className={`font-medium text-sm ${isSpamCat ? 'text-red-600' : ''}`}>{category.categoryName}</div>
                      {isSpamCat && <span className="flex gap-1 items-center px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full border border-red-300"><AlertTriangle className="w-3 h-3" />Spam/Scam</span>}
                      <div className="text-xs text-muted-foreground">{category.totalMessages} messages • {category.totalTickets} tickets</div>
                    </div>
                    <div className={`text-sm font-medium ${isSpamCat ? 'text-red-600' : 'text-green-600'}`}>{ticketRate.toFixed(0)}% conversion</div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div className={`h-2 rounded-full ${isSpamCat ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${Math.min((category.totalMessages / stats.overview.totalMessages) * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Channel Statistics */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {stats.byChannel.map((channelStats) => {
          const conversionRate = channelStats.totalMessages > 0 ? (channelStats.totalTickets / channelStats.totalMessages) * 100 : 0;
          return (
            <Card key={channelStats.channel}>
              <CardHeader><CardTitle className="flex gap-2 items-center capitalize">{getChannelIcon(channelStats.channel)}{channelStats.channel}</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/20"><div className="text-xs text-muted-foreground">Messages</div><div className="text-2xl font-bold">{channelStats.totalMessages}</div></div>
                  <div className="p-3 rounded-lg border bg-green-500/10 border-green-500/20"><div className="text-xs text-muted-foreground">Tickets</div><div className="text-2xl font-bold">{channelStats.totalTickets}</div></div>
                </div>
                <div className="p-3 rounded-lg border bg-purple-500/10 border-purple-500/20"><div className="mb-1 text-xs text-muted-foreground">Ticket Conversion Rate</div><div className="text-xl font-bold text-purple-600 dark:text-purple-400">{conversionRate.toFixed(1)}%</div></div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Unprocessed</span><span className="font-medium">{channelStats.unprocessedMessages}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ticket Worthy</span><span className="font-medium text-green-600">{channelStats.ticketWorthyCount}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Spam</span><span className="font-medium text-red-600">{channelStats.spamCount}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Needs Info</span><span className="font-medium text-amber-600">{channelStats.needsInfoCount}</span></div>
                  <div className="flex justify-between pt-2 text-sm border-t">
                    <span className="flex gap-1 items-center text-muted-foreground"><ExternalLink className="w-3 h-3" />Jira Synced</span>
                    <span className="font-medium text-blue-600">{channelStats.jiraSyncedTickets}{channelStats.totalTickets > 0 && <span className="ml-1 text-xs text-muted-foreground">({((channelStats.jiraSyncedTickets / channelStats.totalTickets) * 100).toFixed(0)}%)</span>}</span>
                  </div>
                </div>
                {channelStats.categories.length > 0 && (
                  <div className="pt-4 border-t">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Top Categories</div>
                    <div className="space-y-2">
                      {channelStats.categories.filter((cat) => cat.categoryName !== 'Uncategorized').slice(0, 5).map((cat) => {
                        const isCatSpam = isSpamOrScam(cat.categoryName);
                        return (
                          <div key={cat.categoryId} className="flex justify-between items-center text-sm">
                            <div className="flex flex-1 gap-1 items-center truncate">
                              {isCatSpam && <ShieldAlert className="flex-shrink-0 w-3 h-3 text-red-500" />}
                              <span className={`truncate ${isCatSpam ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>{cat.categoryName}</span>
                            </div>
                            <span className={`font-medium ml-2 flex-shrink-0 ${isCatSpam ? 'text-red-600' : ''}`}>{cat.messageCount}msg / {cat.ticketCount}tkts</span>
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

      {/* AI Usage Section (customer-facing: how much AI vs human handled). Model/provider
          internals + prediction accuracy live in the admin-only Diagnostics tab. */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />AI Usage</CardTitle></CardHeader>
        <CardContent>
          <div className="pt-2">
            {aiLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={idx} className="h-32 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : aiStats ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">AI Responded</p><p className="mt-2 text-3xl font-bold text-blue-600">{aiStats.summary.aiResponded}</p><p className="mt-1 text-xs text-muted-foreground">{aiStats.summary.aiPercentage}% of responded</p></div><Bot className="w-10 h-10 text-blue-400" /></div></CardContent></Card>
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Human Responded</p><p className="mt-2 text-3xl font-bold text-green-600">{aiStats.summary.humanResponded}</p><p className="mt-1 text-xs text-muted-foreground">{(aiStats.summary.aiResponded + aiStats.summary.humanResponded) > 0 ? Math.round((aiStats.summary.humanResponded / (aiStats.summary.aiResponded + aiStats.summary.humanResponded)) * 100) : 0}% of responded</p></div><Users className="w-10 h-10 text-green-400" /></div></CardContent></Card>
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">No Response</p><p className="mt-2 text-3xl font-bold text-gray-500">{aiStats.summary.noResponse}</p></div><Inbox className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />AI Reply Count Distribution</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const total = Object.values(aiStats.aiReplyDistribution).reduce((sum, val) => sum + val, 0);
                        return Object.entries(aiStats.aiReplyDistribution).map(([bucket, cnt]) => (
                          <div key={bucket} className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{bucket} AI {bucket === '1' ? 'reply' : 'replies'}</span>
                            <div className="flex items-center gap-3"><div className="w-24 h-2 rounded-full bg-muted overflow-hidden"><div className="h-2 rounded-full bg-blue-500" style={{ width: total > 0 ? `${Math.round((cnt / total) * 100)}%` : '0%' }} /></div><span className="text-sm font-medium tabular-nums w-8 text-right">{cnt}</span></div>
                          </div>
                        ));
                      })()}
                    </CardContent>
                  </Card>
                </div>
                {aiStats.suggestedAnswerUsage.total > 0 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-1 mt-4">
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-500" />Suggested Answer Usage<span className="ml-auto text-sm font-normal text-muted-foreground">{aiStats.suggestedAnswerUsage.total} replies used a suggestion</span></CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {aiStats.suggestedAnswerUsage.bySource.map((item) => (
                          <div key={item.source} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{item.source === 'ai-generated' ? 'AI Generated' : item.source === 'lead_qualification' ? 'Lead Qualification' : item.source}</span>
                            <div className="flex items-center gap-3"><div className="w-24 h-2 rounded-full bg-muted overflow-hidden"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${item.percentage}%` }} /></div><span className="text-sm font-medium tabular-nums w-8 text-right">{item.count}</span></div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No AI statistics available.</CardContent></Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
