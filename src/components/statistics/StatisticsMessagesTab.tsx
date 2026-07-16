import { BarChart3, TrendingUp, Activity, CheckCircle, Globe, GitBranch, Tag, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { MessageStatsData, LabelStatEntry } from '@/services/statistics.service';

function formatAvgReply(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

interface Props {
  msgStats: MessageStatsData | null;
  msgLoading: boolean;
  labelStats: LabelStatEntry[] | null;
  labelLoading: boolean;
  msgDays: number;
}

export function StatisticsMessagesTab({ msgStats, msgLoading, labelStats, labelLoading }: Props) {
  return (
    <div id="panel-messages" role="tabpanel">
      <div className="space-y-6 pb-6">
        {msgLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={idx} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : msgStats ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Avg First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.avgHours)}</p></div><Timer className="w-10 h-10 text-blue-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P50 First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.p50Hours)}</p></div><Activity className="w-10 h-10 text-green-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P90 First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.p90Hours)}</p></div><TrendingUp className="w-10 h-10 text-orange-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Responded</p><p className="mt-2 text-3xl font-bold">{msgStats.firstResponseTime.totalResponded}</p></div><CheckCircle className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Avg Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.avgHours)}</p></div><Timer className="w-10 h-10 text-blue-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P50 Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.p50Hours)}</p></div><Activity className="w-10 h-10 text-green-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P90 Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.p90Hours)}</p></div><TrendingUp className="w-10 h-10 text-orange-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Closed Messages</p><p className="mt-2 text-3xl font-bold">{msgStats.resolutionTime.totalClosed}</p></div><CheckCircle className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="w-5 h-5" />Thread Size Distribution</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const threadTotal = Object.values(msgStats.threadSizeDistribution).reduce((sum, val) => sum + val, 0);
                    return Object.entries(msgStats.threadSizeDistribution).map(([bucket, cnt]) => (
                      <div key={bucket} className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">{bucket} message{bucket === '1' ? '' : 's'}</span>
                        <div className="flex items-center gap-3"><div className="w-24 h-2 rounded-full bg-muted overflow-hidden"><div className="h-2 rounded-full bg-primary" style={{ width: threadTotal > 0 ? `${Math.round((cnt / threadTotal) * 100)}%` : '0%' }} /></div><span className="text-sm font-medium tabular-nums w-8 text-right">{cnt}</span></div>
                      </div>
                    ));
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />Language Breakdown</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {msgStats.languageBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No language data yet — new messages will be detected automatically.</p>
                  ) : (
                    (() => {
                      const total = msgStats.languageBreakdown.reduce((sum, row) => sum + row.count, 0);
                      return msgStats.languageBreakdown.slice(0, 10).map((item) => (
                        <div key={item.language} className="flex justify-between items-center">
                          <span className="text-sm font-mono uppercase">{item.language}</span>
                          <div className="flex items-center gap-3"><div className="w-24 h-2 rounded-full bg-muted overflow-hidden"><div className="h-2 rounded-full bg-primary" style={{ width: total > 0 ? `${Math.round((item.count / total) * 100)}%` : '0%' }} /></div><span className="text-sm font-medium tabular-nums w-8 text-right">{item.count}</span></div>
                        </div>
                      ));
                    })()
                  )}
                </CardContent>
              </Card>
            </div>

            {msgStats.categoryTrends.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Category Trends by Week</CardTitle></CardHeader>
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
                        {[...msgStats.categoryTrends].sort((itemA, itemB) => itemB.count - itemA.count).slice(0, 30).map((row, idx) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <tr key={`${row.categoryName}-${row.week}-${idx}`} className="border-b border-border last:border-0 hover:bg-muted/30">
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
          <Card><CardContent className="py-12 text-center text-muted-foreground">No message statistics available.</CardContent></Card>
        )}

        {/* Labels Section */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" />Labels</CardTitle></CardHeader>
          <CardContent>
            {labelLoading ? (
              <div className="space-y-2 pt-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`label-skeleton-${idx}`} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : labelStats && labelStats.length > 0 ? (
              <div className="space-y-3 pt-2">
                {(() => {
                  const sorted = [...labelStats].sort((itemA, itemB) => itemB.messageCount - itemA.messageCount);
                  const max = Math.max(...labelStats.map((entry) => entry.messageCount), 1);
                  return sorted.map((entry) => (
                    <div key={entry.labelId} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="w-40 truncate text-sm font-medium">{entry.name}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(entry.messageCount / max) * 100}%`, backgroundColor: entry.color }} /></div>
                      <span className="text-sm font-semibold w-10 text-right">{entry.messageCount}</span>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="py-12 text-center text-muted-foreground">No label statistics available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
