import { AlertTriangle, Clock, Hourglass, Bot, User, Zap, Info } from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { SpeedToLeadData } from '@/services/statistics.service';
import { cn } from '@/lib/utils';

/** seconds → "40s" / "3m 15s" / "5h 12m" */
function formatSeconds(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    const remSecs = seconds % 60;
    return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** minutes → "2h" / "90m" / "1d" — for the threshold label */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.round(minutes / 1440)}d`;
}

function formatMoney(value: number): string {
  return `€${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  telegram: 'Telegram',
  slack: 'Slack',
  chat: 'Chat widget',
  other: 'Other',
};

interface Props {
  speedData: SpeedToLeadData | null;
  speedLoading: boolean;
  speedDays: number;
}

export function SpeedToLeadTab({ speedData, speedLoading }: Props) {
  const thresholdLabel = speedData ? formatMinutes(speedData.thresholdMinutes) : '2h';

  const bucketData = speedData
    ? [
        { label: '< 5m', count: speedData.buckets.under5m, fill: 'hsl(142 71% 45%)' },
        { label: '5–30m', count: speedData.buckets.from5to30m, fill: 'hsl(84 60% 45%)' },
        { label: `30m–${thresholdLabel}`, count: speedData.buckets.from30mToThreshold, fill: 'hsl(38 92% 50%)' },
        { label: `> ${thresholdLabel}`, count: speedData.buckets.overThreshold, fill: 'hsl(var(--destructive))' },
      ]
    : [];
  const bucketMax = Math.max(1, ...bucketData.map((bucket) => bucket.count));

  return (
    <div id="panel-speedToLead" role="tabpanel">
      <div className="space-y-6 pb-6">

        {speedLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={`speed-skeleton-${idx}`} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : !speedData ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No speed-to-lead data available.
            </CardContent>
          </Card>
        ) : speedData.totalLeads === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Zap className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="text-lg font-medium">No leads in this period</p>
              {speedData.leadQualConfigured ? (
                <p className="text-sm text-muted-foreground">
                  No conversations were flagged as leads in the selected window. Try a longer period.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Lead qualification isn&apos;t enabled yet. Turn it on for your sales department (or
                  flag conversations as leads manually) to start measuring how fast leads get a first
                  response.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Headline cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Revenue at risk — the headline */}
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Est. revenue at risk</p>
                      {speedData.estimatedLostValue !== null ? (
                        <>
                          <p className="mt-2 text-3xl font-bold text-destructive">
                            {formatMoney(speedData.estimatedLostValue)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {speedData.slowLeads} slow lead{speedData.slowLeads === 1 ? '' : 's'} ×{' '}
                            {formatMoney(speedData.avgLeadValue ?? 0)} avg value
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-2xl font-bold text-muted-foreground">—</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Set an average lead value in Lead settings to see revenue at risk.
                          </p>
                        </>
                      )}
                    </div>
                    <AlertTriangle className="w-9 h-9 text-destructive shrink-0" />
                  </div>
                </CardContent>
              </Card>

              {/* Slow leads */}
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Leads waited &gt; {thresholdLabel}
                      </p>
                      <p className="mt-2 text-3xl font-bold">{speedData.slowLeads}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        of {speedData.totalLeads} leads ({speedData.slowLeadRate}%)
                      </p>
                    </div>
                    <Clock className="w-9 h-9 text-amber-500 shrink-0" />
                  </div>
                </CardContent>
              </Card>

              {/* Median first response */}
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Median first response</p>
                      <p className="mt-2 text-3xl font-bold">
                        {formatSeconds(speedData.medianResponseSeconds)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        p90 {formatSeconds(speedData.p90ResponseSeconds)} · fastest{' '}
                        {formatSeconds(speedData.fastestSeconds)}
                      </p>
                    </div>
                    <Zap className="w-9 h-9 text-blue-500 shrink-0" />
                  </div>
                </CardContent>
              </Card>

              {/* Pending now */}
              <Card className="border-l-4 border-l-slate-400">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Awaiting first reply</p>
                      <p className="mt-2 text-3xl font-bold">{speedData.pendingLeads}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {speedData.respondedLeads} of {speedData.totalLeads} answered
                      </p>
                    </div>
                    <Hourglass className="w-9 h-9 text-slate-400 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Distribution + responder split */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    First-response time distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={bucketData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} domain={[0, bucketMax]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--popover-foreground))',
                        }}
                      />
                      <Bar dataKey="count" name="Answered leads" radius={[4, 4, 0, 0]}>
                        {bucketData.map((bucket) => (
                          <Cell key={bucket.label} fill={bucket.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Distribution over {speedData.respondedLeads} answered lead
                    {speedData.respondedLeads === 1 ? '' : 's'}. Green = fast, red = past the{' '}
                    {thresholdLabel} threshold.
                  </p>
                </CardContent>
              </Card>

              {/* AI vs human */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    Who responds first
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const total = speedData.aiResponses + speedData.humanResponses;
                    const aiPct = total > 0 ? Math.round((speedData.aiResponses / total) * 100) : 0;
                    const humanPct = total > 0 ? 100 - aiPct : 0;
                    return (
                      <>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="flex items-center gap-2 text-sm">
                              <Bot className="w-4 h-4 text-primary" /> AI / auto-reply
                            </span>
                            <span className="text-sm font-medium tabular-nums">
                              {speedData.aiResponses} ({aiPct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${aiPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="flex items-center gap-2 text-sm">
                              <User className="w-4 h-4 text-blue-500" /> Human agent
                            </span>
                            <span className="text-sm font-medium tabular-nums">
                              {speedData.humanResponses} ({humanPct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${humanPct}%` }} />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
                          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          A fast AI first-touch keeps the lead warm until an agent takes over.
                        </p>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Per-channel */}
            {speedData.byChannel.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    By channel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Channel</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">Leads</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">Answered</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                            Slow (&gt; {thresholdLabel})
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...speedData.byChannel]
                          .sort((chA, chB) => chB.totalLeads - chA.totalLeads)
                          .map((row) => (
                            <tr
                              key={row.channel}
                              className="border-b border-border last:border-0 hover:bg-muted/30"
                            >
                              <td className="px-4 py-2">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{row.totalLeads}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{row.respondedLeads}</td>
                              <td
                                className={cn(
                                  'px-4 py-2 text-right tabular-nums',
                                  row.slowLeads > 0 && 'text-destructive font-medium'
                                )}
                              >
                                {row.slowLeads}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {row.respondedLeads > 0 ? formatSeconds(row.avgResponseSeconds) : '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
