import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { platformService, type DataSizeDatabase } from '@/services/platform.service';

const TABLES_SHOWN = 10;

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};
const count = (value: number) => value.toLocaleString('en-US');
const percent = (share: number) => `${Math.round(share * 100)}%`;
const sampleNote = (pct: number) =>
  pct >= 100
    ? 'exact count'
    : `estimate from a ${pct < 1 ? pct.toFixed(2) : Math.round(pct)}% sample`;

const TableList = ({ database }: { database: DataSizeDatabase }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-muted-foreground">
        <th className="font-normal py-1">Table</th>
        <th className="font-normal py-1 text-right">Size</th>
        <th className="font-normal py-1 text-right">Rows (approx.)</th>
      </tr>
    </thead>
    <tbody>
      {database.tables.slice(0, TABLES_SHOWN).map((row) => (
        <tr key={row.table} className="border-t border-border">
          <td className="py-1 font-mono text-xs">{row.table}</td>
          <td className="py-1 text-right">{formatBytes(row.totalBytes)}</td>
          <td className="py-1 text-right">{count(row.rowEstimate)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * Console → Platform → System: how big the data is and how much of it is old (architecture M7
 * Z11a). The owner decides hot/cold storage (Z11b) on these numbers. Table sizes come from the
 * database catalog; the old-thread share and message-body bytes are sampled estimates, labelled.
 */
export const DataSizeCard = () => {
  const [fresh, setFresh] = useState(0);
  const query = useQuery({
    queryKey: ['platform', 'data-size', fresh],
    queryFn: () => platformService.getDataSize(fresh > 0),
    staleTime: 5 * 60_000,
  });
  const report = query.data;
  return (
    <Card data-config-card="Data size">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Database className="w-5 h-5" />
          Data size
        </CardTitle>
        <CardDescription>
          How big the stored data is, and how much of it is old resolved conversations — the numbers
          behind moving old data out of the main database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Spinner />
        ) : query.isError || !report ? (
          <Alert variant="danger">The data size could not be read.</Alert>
        ) : (
          <>
            {report.platform.error ? (
              <Alert variant="danger">Platform database: {report.platform.error}</Alert>
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Platform database — {formatBytes(report.platform.totalBytes)}
                </h3>
                <TableList database={report.platform} />
              </div>
            )}
            {!report.threads && report.threadsError && (
              <Alert variant="warning">
                Old resolved conversations could not be measured: {report.threadsError}
              </Alert>
            )}
            {report.threads && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Old resolved conversations</h3>
                <p className="text-sm">
                  {count(report.threads.estimatedOldResolved)} of{' '}
                  {count(report.threads.estimatedThreads)} conversations (
                  {percent(report.threads.oldResolvedShare)}) are resolved or closed with no
                  activity for {report.threads.days} days{' '}
                  <span className="text-muted-foreground">
                    ({sampleNote(report.threads.sampledPct)})
                  </span>
                  .
                </p>
                {report.threads.workspacesWithThreads !== undefined &&
                  report.threads.workspacesWithThreads > report.threads.topWorkspaces.length && (
                    <p className="text-xs text-muted-foreground">
                      The {report.threads.topWorkspaces.length} workspaces with the most
                      conversations, of {count(report.threads.workspacesWithThreads)}.
                    </p>
                  )}
                {report.threads.topWorkspaces.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-normal py-1">Workspace</th>
                        <th className="font-normal py-1 text-right">Conversations</th>
                        <th className="font-normal py-1 text-right">Old resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.threads.topWorkspaces.map((workspace) => (
                        <tr key={workspace.organizationId} className="border-t border-border">
                          <td className="py-1">
                            {workspace.name ?? `Workspace ${workspace.organizationId}`}
                          </td>
                          <td className="py-1 text-right">{count(workspace.estimatedThreads)}</td>
                          <td className="py-1 text-right">{percent(workspace.oldResolvedShare)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {!report.bodies && report.bodiesError && (
              <Alert variant="warning">
                Message content could not be measured: {report.bodiesError}
              </Alert>
            )}
            {report.bodies && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Message content</h3>
                <p className="text-sm">
                  Text {formatBytes(report.bodies.estimatedContentBytes)}, raw provider data{' '}
                  {formatBytes(report.bodies.estimatedRawDataBytes)}, headers{' '}
                  {formatBytes(report.bodies.estimatedHeaderBytes)} across{' '}
                  {count(report.bodies.estimatedMessages)} messages; the messages table with its
                  indexes is {formatBytes(report.bodies.messageEventsTotalBytes)}{' '}
                  <span className="text-muted-foreground">
                    ({sampleNote(report.bodies.sampledPct)})
                  </span>
                  .
                </p>
              </div>
            )}
            {report.byodbError && (
              <Alert variant="warning">
                Workspaces with their own database could not be listed: {report.byodbError}
              </Alert>
            )}
            {report.byodb.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Workspaces with their own database</h3>
                {report.byodb.map((database) => (
                  <div key={database.organizationId} className="space-y-1">
                    <p className="text-sm">
                      {database.workspaceName ?? `Workspace ${database.organizationId}`} —{' '}
                      {database.error ? (
                        <span className="text-destructive">
                          could not be read: {database.error}
                        </span>
                      ) : (
                        formatBytes(database.totalBytes)
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 items-center">
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => setFresh((value) => value + 1)}
              >
                Measure again
              </Button>
              <span className="text-xs text-muted-foreground">
                Measured {new Date(report.sampledAt).toLocaleString()}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
