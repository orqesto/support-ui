import { Users, MessageSquare, Clock, Ticket, StickyNote, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { UserStatEntry } from '@/services/statistics.service';
import { cn } from '@/lib/utils';

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
];

function fullName(entry: UserStatEntry): string {
  return entry.lastName ? `${entry.firstName} ${entry.lastName}` : entry.firstName;
}

function formatAvgReply(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

interface Props {
  teamData: UserStatEntry[] | null;
  teamLoading: boolean;
  teamError: string | null;
  teamDays: number;
  onTeamDaysChange: (days: number) => void;
}

export function StatisticsTeamTab({ teamData, teamLoading, teamError, teamDays, onTeamDaysChange }: Props) {
  return (
    <div id="panel-team" role="tabpanel">
      <div className="space-y-6 pb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {DAYS_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => onTeamDaysChange(opt.value)} className={cn('px-3 py-1.5 text-sm font-medium transition-colors', teamDays === opt.value ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>{opt.label}</button>
            ))}
          </div>
        </div>

        {teamError && <Card><CardContent className="py-4 text-sm text-destructive">{teamError}</CardContent></Card>}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium"><Users className="w-4 h-4" />Agent Stats — last {teamDays} days</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Agent</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Role</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"><span className="flex items-center justify-end gap-1"><MessageSquare className="w-3.5 h-3.5" />Assigned</span></th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Processed</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Replied</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"><span className="flex items-center justify-end gap-1"><Clock className="w-3.5 h-3.5" />Avg Reply</span></th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"><span className="flex items-center justify-end gap-1"><Ticket className="w-3.5 h-3.5" />Tkts Assigned</span></th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Tkts Resolved</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"><span className="flex items-center justify-end gap-1"><StickyNote className="w-3.5 h-3.5" />Notes</span></th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Unresolved</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Outgoing</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Confidence</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"><span className="flex items-center justify-end gap-1"><Globe className="w-3.5 h-3.5" />Top Lang</span></th>
                  </tr>
                </thead>
                <tbody>
                  {teamLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <tr key={idx} className="border-b border-border">
                        {Array.from({ length: 13 }).map((__, jdx) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <td key={jdx} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: jdx === 0 ? '120px' : '60px' }} /></td>
                        ))}
                      </tr>
                    ))
                  ) : !teamData || teamData.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">No agents found for this organisation.</td></tr>
                  ) : (
                    teamData.map((entry) => {
                      const topLang = Object.entries(entry.stats.languageBreakdown ?? {}).sort(([, itemA], [, itemB]) => itemB - itemA)[0]?.[0] ?? '—';
                      return (
                        <tr key={entry.userId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3"><div className="font-medium text-foreground">{fullName(entry)}</div><div className="text-xs text-muted-foreground">{entry.email}</div></td>
                          <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground capitalize">{entry.orgRole.replaceAll('_', ' ')}</span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesAssigned}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesProcessed}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.messagesReplied}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatAvgReply(entry.stats.avgReplyTimeHours)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.ticketsAssigned}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.ticketsResolved}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.notesAdded}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-orange-600">{entry.stats.unresolvedMessages}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{entry.stats.outgoingMessages}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{entry.stats.avgConfidence !== null ? `${Math.min(Math.max(entry.stats.avgConfidence * 100, 0), 100).toFixed(0)}%` : '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums uppercase text-xs font-mono">{topLang}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
