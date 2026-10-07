import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import type { ColumnDef } from '@/components/ui/DataTable/dataTable.types';
import { Label } from '@/components/ui/Label';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { apiErrorMessage, isRouteAbsent } from '@/lib/apiError';
import { organizationService } from '@/services/organization.service';
import systemService, {
  type KbQuestionTextResult,
  type KbQuestionTextRow,
  type KbQuestionTextTotals,
} from '@/services/system.service';

import {
  ACTION_LABEL,
  ACTION_VARIANT,
  ALL,
  FILTER_LABEL,
  MAX_APPLY_CALLS,
  PAGE_SIZE,
  applyConfirmText,
  countFor,
  defaultFilter,
  entries,
  fmt,
  mergeTotals,
  reasonText,
  sumTotals,
  type Filter,
  type Scope,
} from './kbQuestionTextRepairModel';

export {
  MAX_APPLY_CALLS,
  PAGE_SIZE,
  applyConfirmText,
  defaultFilter,
  mergeTotals,
  reasonText,
  sumTotals,
} from './kbQuestionTextRepairModel';

/**
 * Settings → System → Knowledge base repair → Clean captured questions.
 *
 * Captured Q&A stored the customer's raw email as the question (quoted chains, greetings,
 * signatures, contact-form HTML). The backend repair cleans them; this block is its two steps:
 * a Check that writes nothing and lists what would change, and an Apply that only a confirm
 * naming the counts sends — and only for the scope that was just checked.
 *
 * Text from the rows is customer email: it is rendered as text (React escapes it), never as HTML.
 */

export const QUESTION_TEXT_NOT_DEPLOYED =
  'This server does not have this repair yet — it arrives with the next backend release.';

const workspaceName = (row: KbQuestionTextTotals): string =>
  row.organizationName ??
  (row.organizationId === null ? 'All workspaces' : `Workspace #${row.organizationId}`);

type TotalsRow = KbQuestionTextTotals & { key: string };

const totalsColumns = (applied: boolean): ColumnDef<TotalsRow>[] => [
  { id: 'workspace', header: 'Workspace', cell: (row) => workspaceName(row), card: 'title' },
  { id: 'checked', header: 'Checked', cell: (row) => fmt(row.checked), align: 'right' },
  {
    id: 'cleaned',
    header: applied ? 'Cleaned' : 'Will clean',
    cell: (row) => fmt(row.cleaned),
    align: 'right',
  },
  {
    id: 'unchanged',
    header: 'Unchanged',
    // Rows a person edited stay as they are — say how many, so "unchanged" never reads as "clean".
    cell: (row) =>
      row.keptAsEdited > 0
        ? `${fmt(row.unchanged)} (${fmt(row.keptAsEdited)} kept as edited)`
        : fmt(row.unchanged),
    align: 'right',
  },
  { id: 'uncertain', header: 'Uncertain', cell: (row) => fmt(row.uncertain), align: 'right' },
  {
    id: 'rejected',
    header: applied ? 'Rejected' : 'Will reject',
    cell: (row) => fmt(row.rejected),
    align: 'right',
  },
  {
    id: 'ai',
    header: applied ? 'AI rewritten' : 'AI rewrites (sample)',
    cell: (row) => fmt(row.aiRewritten),
    align: 'right',
  },
  {
    id: 'failed',
    header: 'Failed',
    cell: (row) => fmt(row.failed),
    align: 'right',
  },
  {
    id: 'raw',
    header: 'Raw email before → after',
    cell: (row) => `${fmt(row.rawEmailBefore)} → ${fmt(row.rawEmailAfter)}`,
    align: 'right',
  },
];

const TotalsTable = ({ totals, applied }: { totals: KbQuestionTextTotals[]; applied: boolean }) => {
  const rows: TotalsRow[] = totals.map((row, index) => ({
    ...row,
    key: `${row.organizationId ?? 'all'}-${index}`,
  }));
  if (totals.length > 1) {
    rows.push({
      ...sumTotals(totals),
      organizationId: null,
      organizationName: 'Total',
      key: 'total',
    });
  }
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.key}
      columns={totalsColumns(applied)}
      pagination={{ mode: 'client', pageSize: Math.max(rows.length, 1) }}
      empty={{ message: 'No captured entries in this scope.' }}
    />
  );
};

const QuestionText = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm">
      {value.length > 0 ? value : '(empty)'}
    </p>
  </div>
);

const RowItem = ({ row, workspace }: { row: KbQuestionTextRow; workspace: string | null }) => {
  const questionChanged = row.after.question !== row.before.question;
  const answerChanged = row.after.answer !== row.before.answer;
  return (
    <li className="space-y-2 px-3 py-3 border-t border-border first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ACTION_VARIANT[row.action]} size="sm">
          {ACTION_LABEL[row.action]}
        </Badge>
        {row.kind && (
          <Badge variant="secondary" size="sm">
            {row.kind === 'automatic' ? 'Automatic' : 'Captured'}
          </Badge>
        )}
        {row.approved && (
          <Badge variant="secondary" size="sm">
            Approved — no AI
          </Badge>
        )}
        {workspace && <span className="text-xs text-muted-foreground">{workspace}</span>}
        <span className="text-xs text-muted-foreground">Entry #{row.id}</span>
        {row.reasons.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {row.reasons.map(reasonText).join(', ')}
          </span>
        )}
      </div>
      <QuestionText label="Question before" value={row.before.question} />
      {row.action === 'clean' && questionChanged && (
        <QuestionText label="Question after" value={row.after.question} />
      )}
      {row.aiQuestion && <QuestionText label="AI question" value={row.aiQuestion} />}
      {!row.aiQuestion && row.aiFallbackReason && (
        <p className="text-xs text-muted-foreground">
          AI question not used: {reasonText(row.aiFallbackReason)}
        </p>
      )}
      {row.action === 'clean' && answerChanged && (
        <QuestionText label="Answer after" value={row.after.answer} />
      )}
    </li>
  );
};

export const KbQuestionTextRepair = ({ workspace }: { workspace: number | null }) => {
  const [workspaces, setWorkspaces] = useState<{ id: number; name: string }[] | null>(null);
  const [workspacesFailed, setWorkspacesFailed] = useState(false);
  const [scope, setScope] = useState<Scope>(workspace !== null ? String(workspace) : ALL);
  const [check, setCheck] = useState<KbQuestionTextResult | null>(null);
  const [checkedScope, setCheckedScope] = useState<Scope | null>(null);
  const [filter, setFilter] = useState<Filter>(ALL);
  const [applied, setApplied] = useState<KbQuestionTextResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'page' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [aiSamples, setAiSamples] = useState<KbQuestionTextRow[]>([]);
  const [applyProgress, setApplyProgress] = useState<number | null>(null);
  /** Apply stopped before the end of the scope: why, in words. Null when it finished. */
  const [applyStopped, setApplyStopped] = useState<string | null>(null);
  // Every request takes a ticket; an answer whose ticket is no longer the latest (the scope
  // changed, a newer page was asked for) is dropped instead of painting over the newer state.
  const ticket = useRef(0);
  /** Set by Stop: the running apply loop ends after the round in flight and reports what it did. */
  const stopRequested = useRef(false);
  // Leaving the section ends a running apply loop: no calls nobody sees (audit pass 2).
  useEffect(
    () => () => {
      ticket.current += 1;
    },
    []
  );
  const stopApply = () => {
    stopRequested.current = true;
  };

  useEffect(() => {
    let alive = true;
    organizationService
      .getAllPages()
      .then((res) => {
        if (!alive) return;
        setWorkspaces(
          (res?.data ?? []).map((org) => ({ id: Number(org.id), name: String(org.name) }))
        );
      })
      .catch(() => {
        if (alive) setWorkspacesFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const organizationId = (value: Scope): number | null => (value === ALL ? null : Number(value));

  const fail = (err: unknown, fallback: string) =>
    setError(isRouteAbsent(err) ? QUESTION_TEXT_NOT_DEPLOYED : apiErrorMessage(err, fallback));

  const fetchList = async (
    forScope: Scope,
    nextFilter: Filter,
    nextOffset: number,
    withAiSample = false
  ) => {
    const res = await systemService.repairKbQuestionText({
      organizationId: organizationId(forScope),
      dryRun: true,
      offset: nextOffset,
      limit: PAGE_SIZE,
      // The AI sample costs model calls: taken once per Check, never again for a page or filter.
      ...(withAiSample ? {} : { aiSample: 0 }),
      ...(nextFilter === ALL ? {} : { action: nextFilter }),
    });
    if (!res?.success || !res.data) throw new Error(res?.message ?? 'The check failed.');
    return res.data;
  };

  const runCheck = async () => {
    const mine = ++ticket.current;
    const forScope = scope;
    setBusy('check');
    setError(null);
    setApplied(null);
    setCheck(null);
    setCheckedScope(null);
    setAiSamples([]);
    setApplyStopped(null);
    try {
      let data = await fetchList(forScope, 'reject', 0, true);
      const samples = data.aiSamples;
      let chosen: Filter = 'reject';
      const preferred = defaultFilter(data.totals);
      if (preferred !== 'reject') {
        chosen = preferred;
        data = await fetchList(forScope, chosen, 0);
      }
      if (mine !== ticket.current) return;
      setFilter(chosen);
      setCheck(data);
      setAiSamples(samples);
      setCheckedScope(forScope);
    } catch (err) {
      if (mine === ticket.current) fail(err, 'The check failed.');
    } finally {
      if (mine === ticket.current) setBusy(null);
    }
  };

  const showPage = async (nextFilter: Filter, nextOffset: number) => {
    if (checkedScope === null) return;
    const mine = ++ticket.current;
    setBusy('page');
    setError(null);
    try {
      const data = await fetchList(checkedScope, nextFilter, nextOffset);
      if (mine !== ticket.current) return;
      setFilter(nextFilter);
      setCheck(data);
    } catch (err) {
      if (mine === ticket.current) fail(err, 'Could not load that page.');
    } finally {
      if (mine === ticket.current) setBusy(null);
    }
  };

  const runApply = async () => {
    if (!check || checkedScope === null || checkedScope !== scope) return;
    const mine = ++ticket.current;
    setBusy('apply');
    setError(null);
    setApplyStopped(null);
    setApplyProgress(0);
    stopRequested.current = false;
    // The server stops each call at its time budget and says where to go on (`nextOffset`): call
    // again until it reaches the end, adding the totals up (audit H3 — one call used to stop after
    // a few rows and show its partial totals as the whole result).
    let totals: KbQuestionTextTotals[] = [];
    let cursor: string | undefined;
    let last: KbQuestionTextResult | null = null;
    let stopped: string | null = null;
    try {
      for (let call = 0; ; call++) {
        if (call >= MAX_APPLY_CALLS) {
          stopped = `Stopped after ${fmt(call)} rounds — run Check and Apply again to continue.`;
          break;
        }
        const res = await systemService.repairKbQuestionText({
          organizationId: organizationId(checkedScope),
          dryRun: false,
          ...(cursor ? { cursor } : {}),
        });
        if (!res?.success || !res.data) throw new Error(res?.message ?? 'The repair failed.');
        // An answer still marked as a dry run wrote nothing — never report it as applied.
        if (res.data.dryRun) {
          throw new Error('The server answered with a check, not an apply — nothing was written.');
        }
        last = res.data;
        totals = mergeTotals(totals, res.data.totals);
        // The section was left or a new Check started: this run is no longer shown — stop calling.
        if (mine !== ticket.current) return;
        setApplyProgress(sumTotals(totals).checked);
        if (res.data.error) {
          stopped = `The repair stopped on an error: ${res.data.error}. What it did is counted below.`;
          break;
        }
        const next = res.data.pagination?.nextCursor ?? null;
        if (!res.data.pagination?.truncated || next === null) break;
        if (next === cursor) {
          stopped = 'The repair stopped making progress — what it did is counted below.';
          break;
        }
        // Stop: end after the round in flight, through the normal path below, so the section is
        // usable again and what was done is shown (audit pass 3 — bumping the ticket here left the
        // section stuck in "applying").
        // (After the error and end checks: an error is reported as one, and a run that has just
        // finished is not called stopped.)
        if (stopRequested.current) {
          stopped = 'Stopped — what was done so far is counted below. Apply again to continue.';
          break;
        }
        cursor = next;
      }
      if (mine !== ticket.current) return;
      setApplied(last ? { ...last, totals } : null);
      setApplyStopped(stopped);
      // The check described the entries BEFORE this write; showing it now would be stale.
      setCheck(null);
      setCheckedScope(null);
      setAiSamples([]);
    } catch (err) {
      if (mine !== ticket.current) return;
      // Earlier rounds DID write: keep what they reported beside the error.
      if (totals.length > 0 && last) {
        setApplied({ ...last, totals });
        setApplyStopped('The repair stopped part-way — what it did is counted below.');
        setCheck(null);
        setCheckedScope(null);
      }
      fail(err, 'The repair failed.');
    } finally {
      if (mine === ticket.current) {
        setBusy(null);
        setApplyProgress(null);
      }
    }
  };

  const changeScope = (next: Scope) => {
    // A check of another scope must not sit next to an Apply that now targets this one.
    ticket.current += 1;
    setScope(next);
    setCheck(null);
    setCheckedScope(null);
    setApplied(null);
    setError(null);
    setBusy(null);
    setAiSamples([]);
    setApplyStopped(null);
  };

  const sum = check ? sumTotals(check.totals) : null;
  const toApply = sum ? sum.cleaned + sum.rejected : 0;
  const canApply =
    check !== null && checkedScope !== null && checkedScope === scope && busy === null;

  // A backend that does not know the `action` filter returns every action: filter this page
  // here, and say that the page is a page of everything.
  const serverIgnoredFilter =
    check !== null && filter !== ALL && check.rows.some((row) => row.action !== filter);
  const shownRows = check
    ? filter === ALL
      ? check.rows
      : check.rows.filter((row) => row.action === filter)
    : [];
  const pagination = check?.pagination ?? null;
  // Checking every workspace lists entries from all of them: say whose each one is.
  const rowWorkspace = (id: number | null): string | null => {
    if (id === null) return null;
    const known = check?.totals.find((entry) => entry.organizationId === id);
    return known ? workspaceName(known) : `Workspace #${id}`;
  };

  const workspaceOptions = workspaces ?? [];
  const scopeKnown =
    scope === ALL || workspaceOptions.some((option) => String(option.id) === scope);

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div>
        <p className="font-medium">Clean captured questions</p>
        <p className="text-sm text-muted-foreground">
          Questions captured from email kept the raw message — quoted replies, greetings,
          signatures, form HTML. Check lists what cleaning would change and what it would reject.
          Checking changes nothing.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem]">
          <Label htmlFor="kb-question-text-scope">Workspace</Label>
          <Select
            id="kb-question-text-scope"
            value={scope}
            disabled={busy === 'apply'}
            onChange={(event) => changeScope(event.target.value)}
          >
            <option value={ALL}>All workspaces</option>
            {!scopeKnown && <option value={scope}>Workspace #{scope}</option>}
            {workspaceOptions.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Check captured questions"
          onClick={() => void runCheck()}
          isLoading={busy === 'check'}
          disabled={busy !== null}
        >
          Check
        </Button>
        <Button
          variant="destructive"
          size="sm"
          aria-label="Apply question cleaning"
          onClick={() => setConfirming(true)}
          isLoading={busy === 'apply'}
          disabled={!canApply || toApply === 0}
        >
          Apply
        </Button>
      </div>
      {workspacesFailed && (
        <p className="text-xs text-muted-foreground">
          Could not list workspaces — only “All workspaces” and the current one can be chosen.
        </p>
      )}
      {!check && !applied && busy === null && !error && (
        <p className="text-xs text-muted-foreground">Apply is available after a Check.</p>
      )}

      {error && (
        <Alert variant="danger">
          <span className="text-sm">{error}</span>
        </Alert>
      )}

      {check && sum && (
        <div className="space-y-3">
          <TotalsTable totals={check.totals} applied={false} />
          {check.pagination?.truncated && (
            <Alert variant="warning">
              <span className="text-sm">
                The check stopped at the server's time limit — these counts cover only part of the
                entries. Apply still goes through all of them.
              </span>
            </Alert>
          )}
          {check.error && (
            <Alert variant="warning">
              <span className="text-sm">
                The check stopped on an error ({check.error}) — these counts are partial.
              </span>
            </Alert>
          )}
          {!check.aiAvailable && (
            <p className="text-xs text-muted-foreground">
              No AI rewriting in this check — questions are cleaned by rules only.
            </p>
          )}
          {sum.checked > 0 && toApply === 0 && (
            <Alert variant="success">
              <span className="text-sm">
                Nothing to apply — {entries(sum.checked)} checked, none would be cleaned or
                rejected.
              </span>
            </Alert>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem]">
              <Label htmlFor="kb-question-text-filter">Show</Label>
              <Select
                id="kb-question-text-filter"
                value={filter}
                disabled={busy !== null}
                onChange={(event) => void showPage(event.target.value as Filter, 0)}
              >
                <option value={ALL}>All ({fmt(sum.checked)})</option>
                {(['reject', 'uncertain', 'clean', 'unchanged'] as const).map((action) => (
                  <option key={action} value={action}>
                    {FILTER_LABEL[action]} ({fmt(countFor(sum, action))})
                  </option>
                ))}
              </Select>
            </div>
            {filter === 'reject' && (
              <p className="text-xs text-muted-foreground">
                Rejected entries are hidden, not deleted — restorable for 90 days.
              </p>
            )}
            {filter === 'uncertain' && (
              <p className="text-xs text-muted-foreground">
                Uncertain entries keep their text as it is and are left for a person to review.
              </p>
            )}
          </div>

          {serverIgnoredFilter && (
            <p className="text-xs text-warning">
              This server does not filter the list yet — showing the matching entries of this page
              only.
            </p>
          )}

          {shownRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {busy === 'page' ? 'Loading…' : 'No entries to show here.'}
            </p>
          ) : (
            <ul className="rounded-md border border-border" aria-label="Entries before and after">
              {shownRows.map((row) => (
                <RowItem
                  key={row.id}
                  row={row}
                  workspace={checkedScope === ALL ? rowWorkspace(row.organizationId) : null}
                />
              ))}
            </ul>
          )}

          {aiSamples.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">AI question — sample</p>
              <p className="text-xs text-muted-foreground">
                What Apply would write for a few entries. Apply does this for every unapproved entry
                it cleans.
              </p>
              <ul className="rounded-md border border-border" aria-label="AI question sample">
                {aiSamples.map((row) => (
                  <RowItem
                    key={`ai-${row.id}`}
                    row={row}
                    workspace={checkedScope === ALL ? rowWorkspace(row.organizationId) : null}
                  />
                ))}
              </ul>
            </div>
          )}

          {pagination && pagination.total > PAGE_SIZE && (
            <Pagination
              currentPage={Math.floor(pagination.offset / PAGE_SIZE) + 1}
              totalPages={Math.ceil(pagination.total / PAGE_SIZE)}
              total={pagination.total}
              limit={PAGE_SIZE}
              loading={busy === 'page'}
              onPageChange={(page) => void showPage(filter, (page - 1) * PAGE_SIZE)}
            />
          )}
        </div>
      )}

      {busy === 'apply' && applyProgress !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground" role="status">
            Applying… {entries(applyProgress)} done so far. This can take a while with AI on; keep
            this page open.
          </p>
          <Button variant="outline" size="sm" onClick={stopApply}>
            Stop
          </Button>
        </div>
      )}

      {applied && (
        <div className="space-y-2">
          {applyStopped && (
            <Alert variant="warning">
              <span className="text-sm">{applyStopped}</span>
            </Alert>
          )}
          {sumTotals(applied.totals).failed > 0 && (
            <Alert variant="warning">
              <span className="text-sm">
                {entries(sumTotals(applied.totals).failed)} could not be written (changed meanwhile
                or a write failed) — Check again to see them.
              </span>
            </Alert>
          )}
          <Alert variant={applyStopped ? 'warning' : 'success'}>
            <span className="text-sm">
              {applied.totals.length === 0
                ? 'Applied. The server did not report what it changed — check again to see the entries now.'
                : `${applyStopped ? 'Partly applied' : 'Applied'} — ${entries(sumTotals(applied.totals).cleaned)} cleaned, ${fmt(
                    sumTotals(applied.totals).rejected
                  )} rejected (restorable for 90 days), ${fmt(
                    sumTotals(applied.totals).uncertain
                  )} left for review.`}
            </span>
          </Alert>
          {applied.totals.length > 0 && <TotalsTable totals={applied.totals} applied />}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Apply the cleaning?"
        description={check ? applyConfirmText(check.totals, check.aiAvailable) : ''}
        confirmText="Apply"
        onConfirm={() => {
          if (busy === null) void runApply();
        }}
      />
    </div>
  );
};
