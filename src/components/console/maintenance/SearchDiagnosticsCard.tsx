import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select, type Option } from '@/components/ui/Select';
import { usePlatformWorkspaces } from '@/hooks/usePlatformAdmin';
import { apiErrorMessage } from '@/lib/apiError';
import searchDiagnosticsService, {
  type DiagnosticsOutcome,
  type ExplainedStatement,
  type SearchExplain,
  type WorkspaceSizes,
} from '@/services/searchDiagnostics.service';

/**
 * Console → Maintenance: why is a workspace's search slow? (2026-11-04: on a large self-hosted
 * install common words hit the 3 s limit with the database idle, and nobody held database access.)
 * "Explain search" runs the real search once and shows each statement's plan and time; "Workspace sizes" shows the data shape.
 * Both read-only on the backend, global admins only.
 */

const VIEWS: Option[] = [
  { value: 'needs_us', label: 'Needs us' },
  { value: 'all', label: 'All' },
  { value: 'resolved', label: 'Resolved' },
];

const formatMs = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? '—' : `${ms.toLocaleString()} ms`;
const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : Math.round(value).toLocaleString();
const formatBytes = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
};

/** "Execution Time: 37.694 ms" from a plan, or null. */
export const executionTimeOf = (plan: string | undefined): string | null =>
  plan?.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? null;

const StatementRow = ({ statement, index }: { statement: ExplainedStatement; index: number }) => {
  const [open, setOpen] = useState(false);
  const head = statement.query.replace(/\s+/g, ' ').trim().slice(0, 90);
  const time = executionTimeOf(statement.plan);
  return (
    <li className="py-2 border-b last:border-b-0" data-testid="explained-statement">
      <div className="flex gap-3 items-center text-sm">
        <span className="w-24 shrink-0 font-mono tabular-nums">
          {time ? `${time} ms` : statement.error ? 'error' : 'skipped'}
        </span>
        <span className="min-w-0 font-mono text-xs truncate text-muted-foreground">{head}</span>
        {(statement.plan ?? statement.error) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide' : statement.plan ? 'Plan' : 'Error'}
          </Button>
        )}
      </div>
      {open && (
        <pre
          className="overflow-auto p-2 mt-2 max-h-96 text-xs whitespace-pre rounded-md bg-muted/40"
          aria-label={`Plan of statement ${index + 1}`}
        >
          {statement.plan ?? statement.error}
        </pre>
      )}
    </li>
  );
};

const ExplainView = ({ result }: { result: SearchExplain }) => {
  const { search } = result;
  const explained = result.statements.filter(
    (statement) => statement.plan !== undefined || statement.error !== undefined
  );
  return (
    <div className="space-y-2" data-testid="search-explain-result">
      <p className="text-sm">
        The search took <strong>{formatMs(search.ms)}</strong>: {formatNumber(search.rows)} rows,
        total{' '}
        {search.countTimedOut
          ? 'unknown (timed out)'
          : `${formatNumber(search.total)}${search.totalCapped ? '+' : ''}`}
        {search.timedOut ? ', page timed out' : ''}, &ldquo;Not shown&rdquo;{' '}
        {search.scopeKnown ? 'known' : 'unknown'}
        {search.walk ? `, path: ${search.walk}` : ''}.
      </p>
      {explained.length === 0 ? (
        <Alert variant="warning">
          No search statement was captured — the answer may have come from a recent search of the
          same words. Try a word not searched in the last minute.
        </Alert>
      ) : (
        <ul>
          {explained.map((statement, index) => (
            <StatementRow key={statement.position} statement={statement} index={index} />
          ))}
        </ul>
      )}
      {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
    </div>
  );
};

const SizesView = ({ sizes }: { sizes: WorkspaceSizes }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" data-testid="workspace-sizes-result">
    <dt className="text-muted-foreground">Threads / messages</dt>
    <dd>
      {formatNumber(sizes.threads)} / {formatNumber(sizes.messages)}
    </dd>
    <dt className="text-muted-foreground">Messages per thread (median · p95 · max)</dt>
    <dd>
      {formatNumber(sizes.messagesPerThread?.p50)} · {formatNumber(sizes.messagesPerThread?.p95)} ·{' '}
      {formatNumber(sizes.messagesPerThread?.max)}
    </dd>
    <dt className="text-muted-foreground">Message body (median · p95 · max)</dt>
    <dd>
      {formatBytes(sizes.bodyBytes?.p50)} · {formatBytes(sizes.bodyBytes?.p95)} ·{' '}
      {formatBytes(sizes.bodyBytes?.max)}
    </dd>
    <dt className="text-muted-foreground">Stored word list (median · p95 · max)</dt>
    <dd>
      {formatBytes(sizes.wordListBytes?.p50)} · {formatBytes(sizes.wordListBytes?.p95)} ·{' '}
      {formatBytes(sizes.wordListBytes?.max)}
    </dd>
    <dt className="text-muted-foreground">Resolved over 90 days ago</dt>
    <dd>
      {sizes.resolvedOver90DaysShare === null
        ? '—'
        : `${Math.round(sizes.resolvedOver90DaysShare * 100)}%`}
    </dd>
    <dt className="text-muted-foreground">Tables (all workspaces): threads · messages</dt>
    <dd>
      {formatBytes(sizes.tables.conversations?.bytes)} ·{' '}
      {formatBytes(sizes.tables.messageEvents?.bytes)}
    </dd>
  </dl>
);

type Shown =
  | { kind: 'explain'; result: SearchExplain }
  | { kind: 'sizes'; result: WorkspaceSizes }
  | { kind: 'notice'; message: string; variant: 'warning' | 'danger' };

export const SearchDiagnosticsCard = () => {
  const workspacesQuery = usePlatformWorkspaces();
  const [workspace, setWorkspace] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('needs_us');
  const [busy, setBusy] = useState<'explain' | 'sizes' | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const workspaceOptions = useMemo<Option[]>(
    () =>
      (workspacesQuery.data?.data ?? []).map((ws) => ({ value: String(ws.id), label: ws.name })),
    [workspacesQuery.data]
  );
  const organizationId = Number(workspace) || null;

  const run = async <T,>(
    which: 'explain' | 'sizes',
    read: () => Promise<DiagnosticsOutcome<T>>,
    show: (data: T) => Shown
  ) => {
    setBusy(which);
    setShown(null);
    try {
      const outcome = await read();
      if (outcome.kind === 'ok') setShown(show(outcome.data));
      else if (outcome.kind === 'busy')
        setShown({ kind: 'notice', message: outcome.message, variant: 'warning' });
      else
        setShown({
          kind: 'notice',
          message: 'This backend has no search diagnostics yet (it comes with the next release).',
          variant: 'warning',
        });
    } catch (error) {
      setShown({
        kind: 'notice',
        message: apiErrorMessage(error, 'Could not run the diagnostics.'),
        variant: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Gauge className="w-5 h-5 text-muted-foreground" />
          Search diagnostics
        </CardTitle>
        <CardDescription>
          Runs one search in a workspace and shows how long each database statement took, with its
          plan — read-only, about the cost of one agent&rsquo;s search. One run per minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-full max-w-xs">
            <Select
              inputId="search-diagnostics-workspace"
              aria-label="Workspace to diagnose"
              value={workspace}
              onChange={setWorkspace}
              options={workspaceOptions}
              isLoading={workspacesQuery.isLoading}
              placeholder="Pick a workspace"
              searchable
            />
          </div>
          <div className="w-48">
            <Select
              inputId="search-diagnostics-view"
              aria-label="View searched"
              value={view}
              onChange={setView}
              options={VIEWS}
            />
          </div>
          <div className="w-56">
            <Input
              aria-label="Search words"
              placeholder="Search words, e.g. tracking"
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            isLoading={busy === 'explain'}
            disabled={organizationId === null || search.trim() === '' || busy !== null}
            onClick={() =>
              organizationId !== null &&
              void run(
                'explain',
                () =>
                  searchDiagnosticsService.explainSearch({
                    organizationId,
                    search: search.trim(),
                    lifecycle: view,
                  }),
                (result) => ({ kind: 'explain', result })
              )
            }
          >
            Explain search
          </Button>
          <Button
            variant="outline"
            isLoading={busy === 'sizes'}
            disabled={organizationId === null || busy !== null}
            onClick={() =>
              organizationId !== null &&
              void run(
                'sizes',
                () => searchDiagnosticsService.workspaceSizes(organizationId),
                (result) => ({ kind: 'sizes', result })
              )
            }
          >
            Workspace sizes
          </Button>
        </div>
        {shown?.kind === 'notice' && <Alert variant={shown.variant}>{shown.message}</Alert>}
        {shown?.kind === 'explain' && <ExplainView result={shown.result} />}
        {shown?.kind === 'sizes' && <SizesView sizes={shown.result} />}
      </CardContent>
    </Card>
  );
};
