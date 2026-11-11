import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { apiErrorMessage } from '@/lib/apiError';
import maintenanceService, {
  type ListedRepairResult,
  type ListedRepairRow as ResultRow,
} from '@/services/maintenance.service';

/**
 * Console → Maintenance: a repair that lists every row it would change (2026-11-11). Check is a
 * dry run of one page; Apply writes the page that was checked — the first time only its first
 * 20 rows, so the result can be looked at before the rest — then checks again to show what is
 * left. The backend re-selects under its own rules on Apply, so the outcome per row is shown.
 */

export const CHECK_LIMIT = 200;
export const FIRST_APPLY_LIMIT = 20;

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'secondary';

export interface ListedRepairDef {
  id: string;
  label: string;
  does: string;
  /** The route under `/api/system/`. */
  path: string;
  /** "message" / "thread" — what one row is. */
  noun: string;
  /** What Apply does to a row, for the confirm ("removed", "moved to Pending"). */
  applyVerb: string;
  caution?: string;
  outcomes: Record<string, { label: string; variant: BadgeVariant }>;
  columns: (result: ListedRepairResult) => ColumnDef<ResultRow>[];
}

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const labelText: Record<string, string> = {
  DRAFT: 'Draft',
  TRASH: 'Trash',
  SPAM: 'Spam',
  SENT: 'Sent',
};

const LabelBadges = ({ labels }: { labels: string[] }) => {
  const shown = labels.filter((label) => labelText[label]);
  if (shown.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((label) => (
        <Badge key={label} size="sm" variant={label === 'SENT' ? 'success' : 'secondary'}>
          {labelText[label]}
        </Badge>
      ))}
    </span>
  );
};

const dateColumn: ColumnDef<ResultRow> = {
  id: 'date',
  header: 'Date',
  cell: (row) => formatDate(row.createdAt),
};

const outcomeColumn = (def: Pick<ListedRepairDef, 'outcomes'>): ColumnDef<ResultRow> => ({
  id: 'outcome',
  header: 'Result',
  cell: (row) => {
    const outcome = def.outcomes[row.outcome] ?? { label: row.outcome, variant: 'default' };
    return (
      <span className="flex flex-col gap-0.5 items-start">
        <Badge size="sm" variant={outcome.variant}>
          {outcome.label}
        </Badge>
        {row.detail && <span className="text-xs text-muted-foreground">{row.detail}</span>}
      </span>
    );
  },
});

const WRONG_LABEL_OUTCOMES: ListedRepairDef['outcomes'] = {
  selected: { label: 'Would be removed', variant: 'warning' },
  removed: { label: 'Removed', variant: 'success' },
  left_empty_thread: { label: 'Removed — thread now empty', variant: 'success' },
  skipped_sent: { label: 'Kept — it was sent', variant: 'secondary' },
  skipped_changed: { label: 'Skipped — changed since the check', variant: 'secondary' },
  skipped_gone: { label: 'Skipped — already gone', variant: 'secondary' },
  skipped_odly_sent: { label: 'Kept — sent from Odly', variant: 'secondary' },
  skipped_has_copies: { label: 'Kept — other copies point to it', variant: 'secondary' },
  error: { label: 'Failed', variant: 'danger' },
};

const OUTBOUND_ONLY_OUTCOMES: ListedRepairDef['outcomes'] = {
  selected: { label: 'Would move to Pending', variant: 'warning' },
  updated: { label: 'Moved to Pending', variant: 'success' },
  skipped_changed: { label: 'Skipped — changed since the check', variant: 'secondary' },
  error: { label: 'Failed', variant: 'danger' },
};

export const LISTED_REPAIRS: ListedRepairDef[] = [
  {
    id: 'repair-wrong-label-replies',
    label: 'Remove drafts and binned mail shown as our reply',
    does: 'Messages shown in a thread as our reply that Gmail holds only as a draft, in Trash or in Spam — never sent — are removed, and the thread’s last reply and response time are recalculated. Mail that was sent is never removed, even if it was binned later. Status, hold and assignee stay as they are.',
    path: 'repair-wrong-label-replies',
    noun: 'message',
    applyVerb: 'removed from their threads',
    caution: 'Removed messages and their attachments cannot be brought back.',
    outcomes: WRONG_LABEL_OUTCOMES,
    columns: (result) => [
      { id: 'message', header: 'Message', cell: (row) => `#${row.id}` },
      {
        id: 'thread',
        header: 'Thread',
        cell: (row) => (row.threadId === null ? '—' : `#${row.threadId}`),
      },
      { id: 'labels', header: 'Gmail labels', cell: (row) => <LabelBadges labels={row.labels} /> },
      dateColumn,
      ...(result.rows.some((row) => (row.kbEntries ?? 0) > 0)
        ? [
            {
              id: 'kb',
              header: 'KB entries',
              cell: (row: ResultRow) =>
                row.kbEntriesFlagged !== null && row.kbEntriesFlagged > 0
                  ? `${row.kbEntries ?? 0} (${row.kbEntriesFlagged} sent back for review)`
                  : String(row.kbEntries ?? 0),
            },
          ]
        : []),
      outcomeColumn({ outcomes: WRONG_LABEL_OUTCOMES }),
    ],
  },
  {
    id: 'repair-outbound-only-new-threads',
    label: 'Move threads we started to Pending',
    does: 'Email threads still marked New that hold only mail we sent — the customer has not written yet — move to Pending, waiting on the customer, and their response time is recalculated. Assignee and hold stay as they are.',
    path: 'repair-outbound-only-new-threads',
    noun: 'thread',
    applyVerb: 'moved from New to Pending',
    outcomes: OUTBOUND_ONLY_OUTCOMES,
    columns: () => [
      {
        id: 'thread',
        header: 'Thread',
        cell: (row) => row.publicId ?? `#${row.id}`,
      },
      dateColumn,
      { id: 'status', header: 'Status now', cell: () => 'New' },
      outcomeColumn({ outcomes: OUTBOUND_ONLY_OUTCOMES }),
    ],
  },
];

const ResultView = ({
  def,
  title,
  result,
  startedAfter,
}: {
  def: ListedRepairDef;
  title: string;
  result: ListedRepairResult;
  /** Where the checked page started (null = from the beginning). */
  startedAfter: number | null;
}) => {
  const kbTotal = result.rows.reduce((sum, row) => sum + (row.kbEntries ?? 0), 0);
  const outcomeCounts = Object.entries(result.counts).filter(
    ([key, count]) => count > 0 && (!result.dryRun || key !== 'selected')
  );
  const testid = `${def.id}-${result.dryRun ? 'check' : 'applied'}`;
  return (
    <div className="p-3 mt-2 space-y-2 text-sm rounded-md bg-muted/40" data-testid={testid}>
      <p className="font-medium text-foreground">{title}</p>
      {result.dryRun ? (
        <>
          <p data-testid={`${testid}-total`}>
            {result.totalInScope === 0
              ? `No ${def.noun}s to change in this workspace.`
              : `${plural(result.totalInScope, def.noun)} to change in this workspace.`}
          </p>
          {result.selected > 0 && (
            <p>
              {result.nextAfterId !== null
                ? `This list shows ${plural(result.selected, def.noun)}${startedAfter !== null ? ' from where the last batch stopped' : ''}.`
                : startedAfter !== null
                  ? `This list shows the last ${plural(result.selected, def.noun)} (earlier ones were in previous batches).`
                  : `All ${plural(result.selected, def.noun)} are listed.`}
            </p>
          )}
          {result.nextAfterId !== null && (
            <div data-testid={`${testid}-more`}>
              <Alert variant="warning">
                The list stops at {result.limit.toLocaleString()} — more remain after it. Use
                &ldquo;Check next batch&rdquo; to see them.
              </Alert>
            </div>
          )}
        </>
      ) : (
        <p>
          Applied to {plural(result.selected, def.noun)}
          {outcomeCounts.length > 0 &&
            `: ${outcomeCounts
              .map(([key, count]) => `${(def.outcomes[key]?.label ?? key).toLowerCase()} ${count}`)
              .join(' · ')}`}
          .
        </p>
      )}
      {result.dryRun && kbTotal > 0 && (
        <p data-testid={`${testid}-kb`}>
          {kbTotal === 1
            ? '1 knowledge-base entry was made from these messages. It is never deleted.'
            : `${kbTotal.toLocaleString()} knowledge-base entries were made from these messages. They are never deleted.`}
        </p>
      )}
      {!result.dryRun && result.kbEntriesFlagged !== null && result.kbEntriesFlagged > 0 && (
        <p data-testid={`${testid}-kb-flagged`}>
          {result.kbEntriesFlagged === 1
            ? '1 knowledge-base entry sent back for review (Needs your decision). It was not deleted.'
            : `${result.kbEntriesFlagged.toLocaleString()} knowledge-base entries sent back for review (Needs your decision). They were not deleted.`}
        </p>
      )}
      {result.skippedSent && result.skippedSent.count > 0 && (
        <div data-testid={`${testid}-sent`}>
          <p>
            {plural(result.skippedSent.count, 'sent message')} also{' '}
            {result.skippedSent.count === 1 ? 'carries' : 'carry'} Trash, Spam or Draft. Sent mail
            was our real reply and is never removed.
            {result.skippedSent.truncated &&
              ` The first ${result.skippedSent.rows.length} are listed.`}
          </p>
          {result.skippedSent.rows.length > 0 && (
            <DataTable
              rows={result.skippedSent.rows.map((row) => ({
                ...row,
                publicId: null,
                outcome: 'skipped_sent',
                kbEntries: null,
                kbEntriesFlagged: null,
                attachmentsRemoved: null,
                detail: null,
              }))}
              rowKey={(row) => row.id}
              columns={def.columns({ ...result, rows: [] })}
              pagination={{ mode: 'client', pageSize: 10 }}
            />
          )}
        </div>
      )}
      {result.rows.length > 0 && (
        <DataTable
          rows={result.rows}
          rowKey={(row) => row.id}
          columns={def.columns(result)}
          pagination={{ mode: 'client', pageSize: 25 }}
        />
      )}
    </div>
  );
};

/** One listed repair, run in the workspace picked on the page. */
export const ListedRepairRow = ({
  def,
  organizationId,
  allowed,
}: {
  def: ListedRepairDef;
  organizationId: number | null;
  allowed: boolean;
}) => {
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [checked, setChecked] = useState<ListedRepairResult | null>(null);
  // Where the shown Check started: Apply writes that same page, not the one after it.
  const [checkedFrom, setCheckedFrom] = useState<number | null>(null);
  const [applied, setApplied] = useState<ListedRepairResult | null>(null);
  const [appliedOnce, setAppliedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const check = async (workspaceId: number, from: number | null) => {
    try {
      const result = await maintenanceService.runListedRepair(def.path, workspaceId, {
        dryRun: true,
        limit: CHECK_LIMIT,
        afterId: from,
      });
      setChecked(result);
      setCheckedFrom(from);
    } catch (err) {
      setError(apiErrorMessage(err, 'The check failed.'));
      // A failed Check must not leave an older Check arming Apply.
      setChecked(null);
    }
  };

  const runCheck = async (from: number | null) => {
    if (organizationId === null) return;
    setBusy('check');
    setError(null);
    setApplied(null);
    await check(organizationId, from);
    setBusy(null);
  };

  const applyCount = checked
    ? appliedOnce
      ? checked.selected
      : Math.min(FIRST_APPLY_LIMIT, checked.selected)
    : 0;

  const runApply = async () => {
    if (organizationId === null || checked === null) return;
    setBusy('apply');
    setError(null);
    const from = checkedFrom;
    try {
      const result = await maintenanceService.runListedRepair(def.path, organizationId, {
        dryRun: false,
        limit: applyCount,
        afterId: from,
      });
      setApplied(result);
      setAppliedOnce(true);
      // An Apply spends its Check; check the same page again to show what is left.
      setChecked(null);
      await check(organizationId, from);
    } catch (err) {
      setError(apiErrorMessage(err, 'The repair failed.'));
    } finally {
      setBusy(null);
    }
  };

  const nextBatchFrom = checked?.nextAfterId ?? null;
  const disabled = !allowed || organizationId === null || busy !== null;
  const applyLabel = appliedOnce
    ? `Apply the rest (${applyCount})`
    : `Apply first ${applyCount || FIRST_APPLY_LIMIT}`;

  return (
    <li className="py-3 border-b border-border last:border-b-0" data-testid={`repair-${def.id}`}>
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium text-foreground">{def.label}</p>
          <p className="text-sm text-muted-foreground">{def.does}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            isLoading={busy === 'check'}
            disabled={disabled}
            onClick={() => void runCheck(null)}
          >
            Check
          </Button>
          {nextBatchFrom !== null && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void runCheck(nextBatchFrom)}
            >
              Check next batch
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            isLoading={busy === 'apply'}
            disabled={disabled || checked === null || applyCount === 0}
            onClick={() => setConfirming(true)}
          >
            {applyLabel}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      )}
      {applied && (
        <ResultView def={def} title="Applied" result={applied} startedAfter={checkedFrom} />
      )}
      {checked && (
        <ResultView
          def={def}
          title={
            applied ? 'Checked again: what is left (nothing changed)' : 'Check (nothing changed)'
          }
          result={checked}
          startedAfter={checkedFrom}
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        variant="danger"
        title={`Apply to ${plural(applyCount, def.noun)}?`}
        description={
          <span className="block space-y-2">
            <span className="block">
              {appliedOnce
                ? `The ${plural(applyCount, def.noun)} in this list will be ${def.applyVerb}.`
                : `The first ${plural(applyCount, def.noun)} in this list will be ${def.applyVerb}, so you can look at the result before the rest.`}{' '}
              This writes in the selected workspace and is audit-logged.
            </span>
            {def.caution && <span className="block font-medium">{def.caution}</span>}
          </span>
        }
        confirmText={`Apply to ${plural(applyCount, def.noun)}`}
        onConfirm={() => {
          setConfirming(false);
          void runApply();
        }}
      />
    </li>
  );
};
