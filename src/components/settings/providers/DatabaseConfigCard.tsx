import { Database, RefreshCw, TestTube2, Trash2, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import {
  databaseService,
  type DatabaseDisplay,
  type DatabaseMoveSummary,
  type DatabaseStatus,
  type DatabaseTestResult,
} from '@/services/database.service';
import { Permission } from '@/types/roles';

type Props = {
  /** Fired after a connect / re-verify / disconnect changed the stored state. */
  onChanged?: (display: DatabaseDisplay) => void;
  /**
   * Open on the own-database form for a workspace still on the managed database. The wizard
   * step passes this: its two cards ARE the mode choice, so the card must not ask again.
   */
  defaultMode?: 'managed' | 'own';
  hideModeToggle?: boolean;
};

const inputClass =
  'px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground';

export const STATUS_BADGE: Record<DatabaseStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  provisioning: 'warning',
  degraded: 'danger',
  suspended: 'danger',
};

export const STATUS_LABEL: Record<DatabaseStatus, string> = {
  active: 'Connected',
  provisioning: 'Setting up',
  degraded: 'Not answering',
  suspended: 'Suspended',
};

/** The move's status as a sentence the admin can act on. */
export const describeMove = (move: DatabaseMoveSummary): string => {
  switch (move.status) {
    case 'pending':
      return 'Your data is queued to move to your database. The inbox is paused until the copy finishes.';
    case 'copying':
      return `Copying your data to your database — ${move.copiedRows.toLocaleString()} of ${move.totalRows.toLocaleString()} rows. The inbox is paused until the copy finishes.`;
    case 'verifying':
      return 'Verifying the copy against your database. The inbox is paused until this finishes.';
    case 'copied':
      return 'Your workspace now runs on your database. A copy of the data still sits on the managed database until Odly confirms the cleanup.';
    case 'cleaned':
      return 'Move complete: your data lives only in your database.';
    case 'failed':
      return `The move failed and your workspace stayed on the managed database, untouched${move.error ? `: ${move.error}` : '.'}`;
    default:
      return `Move status: ${move.status}.`;
  }
};

/** Probe facts as short lines, so the admin sees WHAT was checked, not just a green box. */
export const describeProbe = (probe: DatabaseTestResult): string[] => {
  const lines: string[] = [];
  if (probe.serverVersion) lines.push(probe.serverVersion);
  if (probe.empty !== undefined) {
    lines.push(
      probe.empty
        ? 'Empty database — migrations will create the schema'
        : 'Database already has tables'
    );
  }
  if (probe.canCreate !== undefined) {
    lines.push(
      probe.canCreate ? 'CREATE privilege: yes' : 'CREATE privilege: missing (migrations need it)'
    );
  }
  if (probe.vectorAvailable !== undefined) {
    lines.push(
      probe.vectorAvailable ? 'pgvector: available' : 'pgvector: not available on this server'
    );
  }
  return lines;
};

/**
 * Settings → Integrations → Database, and the wizard's Database step (BYODB Phase 2 §3.3).
 * Same shape as the Object Storage card: managed by default, "bring your own" reveals the
 * form, Test probes without saving, Connect stores the URL encrypted, migrates the database
 * and flips the workspace over — moving its data first when it already has some.
 *
 * The URL is written once and never read back: every render works from `hostMasked`.
 */
export const DatabaseConfigCard = ({
  onChanged,
  defaultMode = 'managed',
  hideModeToggle = false,
}: Props) => {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_INTEGRATIONS);

  const [display, setDisplay] = useState<DatabaseDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'managed' | 'own'>(defaultMode);
  const [url, setUrl] = useState('');
  const [region, setRegion] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DatabaseTestResult | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await databaseService.get();
      setDisplay(next);
      setMode(next.mode === 'own' ? 'own' : defaultMode);
      setRegion(next.region ?? '');
      return next;
    } catch (err) {
      toast.failure('Load database config', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [defaultMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await databaseService.test(url));
    } catch (err) {
      setTestResult({ ok: false, latencyMs: 0, error: apiErrorMessage(err, 'Request failed') });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await databaseService.connect({ url, region: region.trim() || null });
      toast.success(
        result.display.move
          ? 'Connected. Your data is being moved to your database — the inbox is paused until the copy finishes.'
          : `Connected — ${result.migrationsApplied ?? 0} migration${result.migrationsApplied === 1 ? '' : 's'} applied.`
      );
      setUrl('');
      setTestResult(null);
      const next = await load();
      onChanged?.(next ?? result.display);
    } catch (err) {
      toast.failure('Connect database', err);
    } finally {
      setConnecting(false);
    }
  };

  const handleReverify = async () => {
    setReverifying(true);
    try {
      const result = await databaseService.reverify();
      if (result.probe?.ok) {
        toast.success(`Your database answered in ${result.probe.latencyMs}ms.`);
      } else {
        toast.error(`Your database did not answer: ${result.probe?.error ?? 'connection failed'}`);
      }
      const next = await load();
      onChanged?.(next ?? result.display);
    } catch (err) {
      toast.failure('Verify database', err);
    } finally {
      setReverifying(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const next = await databaseService.disconnect();
      toast.success('Database connection removed');
      setDisplay(next);
      setMode(next.mode);
      onChanged?.(next);
    } catch (err) {
      toast.failure('Remove database connection', err);
    } finally {
      setRemoving(false);
    }
  };

  const own = display?.mode === 'own';
  const deadline = display?.sharedRetentionUntil ? new Date(display.sharedRetentionUntil) : null;
  const daysLeft = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))
    : null;
  const canSubmit = url.trim().length > 0 && canManage;
  /** The BE refuses to drop an own database that ever went live; only a never-activated row can go. */
  const canRemove = own && display?.status === 'provisioning' && !display.move;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Database className="w-5 h-5" />
          Database
          {own && display && (
            <Badge variant={STATUS_BADGE[display.status]} size="sm">
              {STATUS_LABEL[display.status]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Where this workspace's conversations, contacts, tickets and knowledge live. Bring your own
          Postgres (16+, with the pgvector extension available) and your data is read and written
          there; Odly keeps only sign-in, billing and platform audit metadata. Encrypted at rest,
          the connection string is never shown again.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : own && display ? (
          <div className="space-y-4 rounded-lg border bg-muted/50 p-4 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">Host</dt>
              <dd className="font-mono text-xs text-foreground break-all">
                {display.hostMasked ?? '—'}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-foreground">{STATUS_LABEL[display.status]}</dd>
              <dt className="text-muted-foreground">Region</dt>
              <dd className="text-foreground">{display.region ?? 'Not set'}</dd>
              <dt className="text-muted-foreground">Schema version</dt>
              <dd className="text-foreground">{display.schemaVersion ?? 'Not migrated yet'}</dd>
              <dt className="text-muted-foreground">Last verified</dt>
              <dd className="text-foreground">
                {display.verifiedAt ? formatDate(display.verifiedAt) : 'Never'}
              </dd>
              <dt className="text-muted-foreground">Set up via</dt>
              <dd className="text-foreground">
                {display.provenance === 'env'
                  ? 'Odly operations (environment reference)'
                  : 'This card'}
              </dd>
            </dl>

            {display.move && (
              <div
                className={`rounded-md border p-3 text-xs ${
                  display.move.status === 'failed'
                    ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                    : 'border-primary/30 bg-primary/5 text-foreground'
                }`}
                data-testid="database-move-status"
              >
                {describeMove(display.move)}
              </div>
            )}

            {display.status === 'degraded' && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                Your database is not answering. Ingestion and the inbox are paused — nothing is
                written to Odly's database in the meantime. Once it answers again the workspace
                resumes by itself; use Re-verify to check now.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleReverify()}
                isLoading={reverifying}
                disabled={!canManage}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-verify
              </Button>
              {canRemove && canManage && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleRemove()}
                  isLoading={removing}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Moving back to the managed database is not self-serve — contact Odly.
            </p>
          </div>
        ) : (
          <>
            {!hideModeToggle && (
              <div
                className="inline-flex rounded-lg border p-0.5 bg-muted/40"
                role="group"
                aria-label="Database mode"
              >
                <button
                  type="button"
                  onClick={() => setMode('managed')}
                  className={`rounded-md px-3 py-1.5 text-sm ${mode === 'managed' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                >
                  Odly-managed
                </button>
                <button
                  type="button"
                  onClick={() => setMode('own')}
                  className={`rounded-md px-3 py-1.5 text-sm ${mode === 'own' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                >
                  Bring your own Postgres
                </button>
              </div>
            )}

            {mode === 'managed' ? (
              <div className="space-y-3 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>
                  This workspace's data is on Odly's managed database. Switch to “Bring your own
                  Postgres” to move it to a database you run.
                </p>
                {deadline && (
                  <p
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
                    data-testid="database-retention-note"
                  >
                    Free runs on your own Postgres. Connect yours before{' '}
                    <span className="font-medium">{deadline.toLocaleDateString()}</span>
                    {daysLeft !== null && ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`} or
                    this workspace's data will be deleted from the managed database. Upgrading to a
                    paid plan also clears the deadline.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
                <div>
                  <label htmlFor="database-url" className="text-sm font-medium">
                    Connection string *
                  </label>
                  <PasswordInput
                    id="database-url"
                    autoComplete="off"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setTestResult(null);
                    }}
                    disabled={!canManage}
                    className={`${inputClass} font-mono text-xs`}
                    placeholder="postgres://user:password@host:5432/database?sslmode=require"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    A dedicated, empty database whose user can CREATE objects. Stored encrypted;
                    never shown again. Odly's servers must be able to reach the host.
                  </p>
                </div>

                <div>
                  <label htmlFor="database-region" className="text-sm font-medium">
                    Region label (Optional)
                  </label>
                  <input
                    id="database-region"
                    type="text"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                    disabled={!canManage}
                    className={inputClass}
                    placeholder="eu-central-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    For your records only — the data lives wherever the host is.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleTest()}
                    isLoading={testing}
                    disabled={!canSubmit}
                  >
                    <TestTube2 className="mr-2 w-4 h-4" />
                    Test connection
                  </Button>
                  {testResult && (
                    <div
                      className={`p-3 text-xs rounded border ${
                        testResult.ok
                          ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                          : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                      }`}
                      data-testid="database-test-result"
                    >
                      <p>
                        {testResult.ok ? 'Connection OK' : 'Cannot use this database'} ·{' '}
                        {testResult.latencyMs}ms
                      </p>
                      {describeProbe(testResult).map((line) => (
                        <p key={line} className="mt-1">
                          {line}
                        </p>
                      ))}
                      {testResult.error && <p className="mt-1">{testResult.error}</p>}
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Connecting migrates the schema into your database. If this workspace already has
                  data, it is copied there first — ids preserved, every table's row count verified —
                  and the inbox pauses for the copy. Nothing is deleted from the managed database
                  until Odly confirms the move.
                </p>

                {canManage && (
                  <Button
                    onClick={() => void handleConnect()}
                    isLoading={connecting}
                    disabled={!canSubmit}
                  >
                    <Unplug className="mr-2 w-4 h-4" />
                    Connect
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
