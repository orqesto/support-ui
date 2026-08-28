import { BarChart3, TrendingUp, Activity, CheckCircle, Globe, GitBranch, Tag, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type {
  MessageStatsData,
  LabelStatEntry,
  BusinessHoursStats,
} from '@/services/statistics.service';

function formatAvgReply(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

/**
 * The open-hours figure beside a wall-clock one.
 *
 * Renders nothing when the workspace has no calendar. `null` there means "not configured",
 * NOT "zero open hours" — printing 0h would read as "answered outside hours every time" and
 * be indistinguishable from a real, terrible number.
 */
function OpenHours({ stats, pick }: { stats?: BusinessHoursStats | null; pick: 'avgHours' | 'p50Hours' | 'p90Hours' }) {
  if (!stats) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">{formatAvgReply(stats[pick])} open hours</p>
  );
}

/**
 * Why a duration panel is empty, when it is empty for a reason its own numbers cannot show.
 *
 * Both duration metrics require a conversation to carry `closed_at`. Ten of the eleven backend
 * paths that resolve a conversation never stamped it, so the panel can be blank while the team
 * resolves mail all day: framehouse has 2,936 resolved conversations, every one with a NULL
 * `closed_at`, and not one of them can appear here.
 *
 * ⚠️ The metric's OWN exclusion counters cannot explain that. `excludedUnknownActor` and
 * `excludedSystemResolved` are FILTER clauses inside a query that already requires a close time,
 * so for these rows they are zero as well — the footnote printed nothing, and six em-dashes with
 * no explanation is what sent someone asking why the feature was broken. It was not.
 *
 * Renders nothing when the count is absent (backend predating the field) or zero, so a healthy
 * workspace is never shown an apology for a problem it does not have.
 */
function Unmeasurable({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <>
      {' '}
      <span className="font-medium text-foreground">
        {count.toLocaleString()} resolved {count === 1 ? 'conversation has' : 'conversations have'}{' '}
        no recorded close time
      </span>{' '}
      and cannot be measured — most were resolved before we started recording one.
    </>
  );
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
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Avg First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.avgHours)}</p><OpenHours stats={msgStats.firstResponseTime.businessHours} pick="avgHours" /></div><Timer className="w-10 h-10 text-blue-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P50 First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.p50Hours)}</p><OpenHours stats={msgStats.firstResponseTime.businessHours} pick="p50Hours" /></div><Activity className="w-10 h-10 text-green-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P90 First Response</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.firstResponseTime.p90Hours)}</p><OpenHours stats={msgStats.firstResponseTime.businessHours} pick="p90Hours" /></div><TrendingUp className="w-10 h-10 text-orange-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Responded</p><p className="mt-2 text-3xl font-bold">{msgStats.firstResponseTime.totalResponded}</p></div><CheckCircle className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
            </div>

            <div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Avg Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.avgHours)}</p></div><Timer className="w-10 h-10 text-blue-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P50 Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.p50Hours)}</p></div><Activity className="w-10 h-10 text-green-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P90 Resolution</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.resolutionTime.p90Hours)}</p></div><TrendingUp className="w-10 h-10 text-orange-400" /></div></CardContent></Card>
              <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Closed Messages</p><p className="mt-2 text-3xl font-bold">{msgStats.resolutionTime.totalClosed}</p></div><CheckCircle className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
              </div>
              {/* ⚠️ "Closed Messages: 0" is the most misleading thing on this page — a COUNT reads
                * as a fact about the team rather than a gap in the data, and this row carried no
                * footnote at all to say otherwise. */}
              {msgStats.resolutionTime.excludedNoCloseStamp ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Counts conversations with a recorded close time.
                  <Unmeasurable count={msgStats.resolutionTime.excludedNoCloseStamp} />
                </p>
              ) : null}
            </div>

            {/* Receipt → resolution, human resolutions only.
              *
              * ⚠️ Guarded on presence, not on truthiness of a field inside it. The frontend
              * deploys on push and the backend ships on a tag, so this whole object is absent
              * in production until the release lands — reaching into it unguarded would
              * white-screen the entire Statistics page rather than hide one row. */}
            {msgStats.receiveToResolve ? (
              <div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Avg Receive → Resolve</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.receiveToResolve.avgHours)}</p><OpenHours stats={msgStats.receiveToResolve.businessHours} pick="avgHours" /></div><Timer className="w-10 h-10 text-purple-400" /></div></CardContent></Card>
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P50 Receive → Resolve</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.receiveToResolve.p50Hours)}</p><OpenHours stats={msgStats.receiveToResolve.businessHours} pick="p50Hours" /></div><Activity className="w-10 h-10 text-green-400" /></div></CardContent></Card>
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">P90 Receive → Resolve</p><p className="mt-2 text-3xl font-bold">{formatAvgReply(msgStats.receiveToResolve.p90Hours)}</p><OpenHours stats={msgStats.receiveToResolve.businessHours} pick="p90Hours" /></div><TrendingUp className="w-10 h-10 text-orange-400" /></div></CardContent></Card>
                  <Card><CardContent className="p-6"><div className="flex justify-between items-center"><div><p className="text-sm font-medium text-muted-foreground">Resolved by a person</p><p className="mt-2 text-3xl font-bold">{msgStats.receiveToResolve.totalResolved}</p></div><CheckCircle className="w-10 h-10 text-gray-400" /></div></CardContent></Card>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Measured from when the message arrived, not when it was ingested, and counting
                  only conversations a person resolved.
                  {msgStats.receiveToResolve.totalResolved === 0
                    ? ' Nothing in this window qualifies yet, so the figures are blank rather than zero.'
                    : ''}
                  <Unmeasurable count={msgStats.receiveToResolve.excludedNoCloseStamp} />
                  {msgStats.receiveToResolve.excludedUnknownActor
                    ? ` ${msgStats.receiveToResolve.excludedUnknownActor} resolved before we recorded who did it are excluded — unknown, not automated.`
                    : ''}
                  {msgStats.receiveToResolve.excludedSystemResolved
                    ? ` ${msgStats.receiveToResolve.excludedSystemResolved} resolved by automation are excluded.`
                    : ''}
                  {msgStats.firstResponseTime.estimatedRows
                    ? ` ${msgStats.firstResponseTime.estimatedRows} response times are estimated from ingestion time, having no recorded arrival time.`
                    : ''}
                  {msgStats.meta?.businessHoursTruncated
                    ? ' Open-hours figures cover the first 5,000 conversations in this window only.'
                    : ''}
                </p>
              </div>
            ) : null}


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
