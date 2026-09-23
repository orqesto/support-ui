import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatDuration } from '@/components/console/failureAnalysis.format';
import { usePlatformQueueHistory } from '@/hooks/usePlatformAdmin';
import type { QueueHistorySample, QueueRow } from '@/services/platform.service';

const RANGES = [1, 6, 24] as const;
type Range = (typeof RANGES)[number];

/** The metrics charted, one small chart each: different units never share an axis. */
export const HISTORY_METRICS = [
  { key: 'queued', title: 'Jobs waiting', value: (sample: QueueHistorySample) => sample.queued },
  { key: 'rate', title: 'Finished per minute', value: (sample: QueueHistorySample) => sample.finishesPerMinute },
  {
    key: 'oldest',
    title: 'Oldest waiting (min)',
    value: (sample: QueueHistorySample) =>
      sample.oldestWaitingMs === null ? null : Math.round((sample.oldestWaitingMs / 60_000) * 10) / 10,
  },
] as const;

/** The queue to open on: the one with the most jobs waiting — that is why someone opens this. */
export const defaultHistoryQueue = (queues: Array<Pick<QueueRow, 'name' | 'waiting' | 'prioritized'>>): string | null => {
  if (queues.length === 0) return null;
  const queued = (queue: Pick<QueueRow, 'waiting' | 'prioritized'>) => queue.waiting + (queue.prioritized ?? 0);
  return [...queues].sort((left, right) => queued(right) - queued(left))[0].name;
};

/** Every 15th minute for the table view: a readable sample of the same points the charts draw. */
export const tableRows = (samples: QueueHistorySample[], every = 15): QueueHistorySample[] =>
  samples.filter((_, index) => index % every === 0 || index === samples.length - 1);

const time = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

/**
 * Console → System: the last 1/6/24 hours of one queue, from the samples the queue-health monitor
 * keeps (one a minute, in Redis, 24 h). Three small charts over one time axis — jobs waiting, the
 * finish rate, the oldest wait — so "is it moving?" reads as a shape, not a snapshot.
 */
export const QueueHistoryPanel = ({ queues }: { queues: QueueRow[] }) => {
  const [chosen, setChosen] = useState<string | null>(null);
  const [hours, setHours] = useState<Range>(6);
  const queue = chosen ?? defaultHistoryQueue(queues);
  const history = usePlatformQueueHistory(queue, hours);
  const samples = useMemo(() => history.data ?? [], [history.data]);
  const status = (history.error as { status?: number } | null)?.status;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex gap-2 items-center text-sm text-muted-foreground">
          History
          <select
            className="px-2 py-1 text-sm rounded-md border border-border bg-card text-foreground"
            value={queue ?? ''}
            onChange={(event) => setChosen(event.target.value)}
            aria-label="Queue to show history for"
          >
            {queues.map((row) => (
              <option key={row.name} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={range === hours ? 'secondary' : 'ghost'}
              aria-pressed={range === hours}
              onClick={() => setHours(range)}
            >
              {range} h
            </Button>
          ))}
        </div>
      </div>

      {history.isLoading ? (
        <Spinner size={20} />
      ) : status === 404 ? (
        <p className="text-sm text-muted-foreground">
          Queue history needs a newer backend — this one does not record it yet.
        </p>
      ) : history.isError ? (
        <Alert variant="danger">Couldn&apos;t load the history for {queue}.</Alert>
      ) : samples.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No history for {queue} yet. A point is recorded every minute and kept for 24 hours.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {HISTORY_METRICS.map((metric) => (
              <figure key={metric.key} className="min-w-0">
                <figcaption className="mb-1 text-xs font-medium text-muted-foreground">{metric.title}</figcaption>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={samples.map((sample) => ({ at: sample.at, value: metric.value(sample) }))}>
                    <XAxis
                      dataKey="at"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={time}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                      minTickGap={40}
                    />
                    <YAxis
                      width={36}
                      allowDecimals={metric.key !== 'queued'}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                      labelFormatter={(at) => time(Number(at))}
                      formatter={(value) => [value ?? '—', metric.title]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </figure>
            ))}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Show as table</summary>
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-3 font-medium">Time</th>
                  <th className="py-1 pr-3 font-medium">Jobs waiting</th>
                  <th className="py-1 pr-3 font-medium">Finished / min</th>
                  <th className="py-1 pr-3 font-medium">Oldest waiting</th>
                </tr>
              </thead>
              <tbody>
                {tableRows(samples).map((sample) => (
                  <tr key={sample.at} className="border-t border-border">
                    <td className="py-1 pr-3">{time(sample.at)}</td>
                    <td className="py-1 pr-3">{sample.queued}</td>
                    <td className="py-1 pr-3">{sample.finishesPerMinute ?? '—'}</td>
                    <td className="py-1 pr-3">{formatDuration(sample.oldestWaitingMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
};
