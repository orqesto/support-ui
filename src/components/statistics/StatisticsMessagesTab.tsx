import { BarChart3, TrendingUp, Activity, CheckCircle, Globe, GitBranch, Tag, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { MessageStatsData, LabelStatEntry } from '@/services/statistics.service';
import { cn } from '@/lib/utils';

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

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
  onMsgDaysChange: (days: number) => void;
}

export function StatisticsMessagesTab({ msgStats, msgLoading, labelStats, labelLoading, msgDays, onMsgDaysChange }: Props) {
  return (
    <div id="panel-messages" role="tabpanel">
      <div className="space-y-6 pb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {DAYS_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => onMsgDaysChange(opt.value)} className={cn('px-3 py-1.5 text-sm font-medium transition-colors', msgDays === opt.value ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>{opt.label}</button>
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
                    const threadTotal = Object.values(msgStats.threadSizeDistribution).reduce((s, v) => s + v, 0);
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
                      const total = msgStats.languageBreakdown.reduce((s, r) => s + r.count, 0);
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
          <Card><CardContent className="py-12 text-center text-muted-foreground">No message statistics available.</CardContent></Card>
        )}

        {/* Labels Section */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" />Labels</CardTitle></CardHeader>
          <CardContent>
            <div className="pt-2">
              {labelLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={`label-skeleton-${i}`} className="h-12 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : labelStats && labelStats.length > 0 ? (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="w-5 h-5" />Label Message Counts</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(() => {
                      const sorted = [...labelStats].sort((a, b) => b.messageCount - a.messageCount);
                      const max = Math.max(...labelStats.map((e) => e.messageCount), 1);
                      return sorted.map((entry) => (
                        <div key={entry.labelId} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="w-40 truncate text-sm font-medium">{entry.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(entry.messageCount / max) * 100}%`, backgroundColor: entry.color }} /></div>
                          <span className="text-sm font-semibold w-10 text-right">{entry.messageCount}</span>
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No label statistics available.</CardContent></Card>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
