import { Database } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { DatabaseStatus } from '@/services/systemStatus';

/** At this share of `max_connections` new connections are close to being refused. */
const CONNECTIONS_WARN_PCT = 85;
/** An idle-in-transaction connection older than this holds locks and blocks vacuum. */
const IDLE_TX_WARN_SECONDS = 60;

const seconds = (value: number | null): string => {
  if (value === null) return '—';
  if (value < 60) return `${value.toFixed(1)} s`;
  return `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;
};

const sizeLabel = (mb: number): string =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

/** What is wrong right now, in words — empty when nothing is. */
export const databaseWarnings = (database: DatabaseStatus): string[] => {
  const warnings: string[] = [];
  const { connections } = database;
  if (connections.utilizationPct >= CONNECTIONS_WARN_PCT) {
    warnings.push(`${connections.utilizationPct}% of the connection limit in use`);
  }
  if (connections.waitingOnLock > 0) {
    warnings.push(`${connections.waitingOnLock} waiting on a lock`);
  }
  if ((database.longestIdleInTransactionSeconds ?? 0) >= IDLE_TX_WARN_SECONDS) {
    warnings.push(`a transaction idle for ${seconds(database.longestIdleInTransactionSeconds)}`);
  }
  if ((database.rates?.deadlocks ?? 0) > 0) {
    warnings.push(`${database.rates?.deadlocks} deadlocks`);
  }
  return warnings;
};

/**
 * Database load, next to CPU and memory on Console → System. `undefined` = an older backend that
 * does not report it (render nothing); `null` = it could not be read this time.
 */
export const DatabaseStatusPanel = ({
  database,
}: {
  database: DatabaseStatus | null | undefined;
}) => {
  if (database === undefined) return null;
  if (database === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Database: could not be read just now (the sample timed out or failed).
      </p>
    );
  }
  const { connections, rates } = database;
  const warnings = databaseWarnings(database);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-6 items-center text-sm">
        <div className="flex gap-2 items-center">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Database connections</span>
          <span className="font-medium text-foreground">
            {connections.total} of {connections.max}
          </span>
          <span className="text-xs text-muted-foreground">
            {connections.active} running · {connections.idle} idle · {connections.idleInTransaction}{' '}
            idle in transaction · {connections.waitingOnLock} waiting on a lock
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground">Size</span>
          <span className="font-medium text-foreground">{sizeLabel(database.sizeMB)}</span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground">Longest running query</span>
          <span className="font-medium text-foreground">
            {seconds(database.longestActiveSeconds)}
          </span>
        </div>
        <Badge variant={warnings.length > 0 ? 'warning' : 'success'}>
          {warnings.length > 0 ? 'under load' : 'healthy'}
        </Badge>
      </div>
      {warnings.length > 0 ? (
        <p className="text-xs text-warning">Database: {warnings.join(' · ')}.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {rates
          ? `Last ${rates.windowSeconds} s: ${rates.commitsPerSecond} commits/s · ${rates.rollbacksPerSecond} rollbacks/s · cache hits ${
              rates.cacheHitPct === null ? '—' : `${rates.cacheHitPct}%`
            } · ${rates.tempMBWritten} MB written to temp files · ${rates.deadlocks} deadlocks.`
          : 'Rates appear from the next refresh (they compare two samples).'}{' '}
        Shared database only; a workspace with its own database is not included, and a managed
        database&apos;s own CPU (e.g. Aurora capacity) is not visible from here.
      </p>
      {database.longestQueries.length > 0 ? (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Running for</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Waiting on</th>
                <th className="px-3 py-2 font-medium">Statement</th>
              </tr>
            </thead>
            <tbody>
              {database.longestQueries.map((query) => (
                <tr key={query.pid} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{seconds(query.seconds)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{query.state ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{query.waitEvent ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">{query.query}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
};
