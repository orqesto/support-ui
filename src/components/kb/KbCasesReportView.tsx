/**
 * The KB cases report as a worklist: cases (each opens to its entries, with actions), the entries
 * set aside in no case, and the findings. Rendered by KbCasesPage.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { kbRef } from '@/lib/kbConsolidation';
import { kbFindingHref } from '@/lib/kbFinding';
import {
  kbConsolidationService,
  type KbCaseRow,
  type KbCasesFindings,
  type KbCasesReport,
} from '@/services/kbConsolidation.service';
import { MOVE_SEARCH_PAGE } from './KbMoveToCaseDialog';
import {
  KbCaseRowView,
  conversationsText,
  memberCount,
  plural,
  rowEntryIds,
  rowTitle,
} from './KbCaseRowView';
import { KbSetAside } from './KbSetAside';
import { KbWorkRows, type KbWorkNotice } from './KbWorkRows';

/**
 * A finding's link opens the knowledge base narrowed to exactly the entries it counted, in the
 * department the report is for. Without a department there is no such list, so no link — never a
 * link to "all entries" worded as if it were the list.
 */
const FindingLink = ({ to, children }: { to: string | null; children: React.ReactNode }) =>
  to ? (
    <Link to={to} className="text-primary hover:underline">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );

export const KbCasesFindingsPanel = ({
  findings,
  departmentId = null,
}: {
  findings: KbCasesFindings;
  departmentId?: number | null;
}) => {
  const lines: { key: string; node: React.ReactNode }[] = [];
  if (findings.rawEmails > 0) {
    lines.push({
      key: 'raw',
      node: (
        <>
          {plural(
            findings.rawEmails,
            'learned entry is a raw email',
            'learned entries are raw emails'
          )}
          , not {findings.rawEmails === 1 ? 'a question' : 'questions'} —{' '}
          <FindingLink to={departmentId === null ? null : kbFindingHref('raw_email', departmentId)}>
            clean up
          </FindingLink>
          . Until hidden, a raw email that belongs to a real case keeps serving its old answer next
          to the merged one.
        </>
      ),
    });
  }
  if (findings.couldNotClassify > 0)
    lines.push({
      key: 'unclassified',
      node: `${findings.couldNotClassify} could not be classified`,
    });
  if (findings.awaitingKbReview > 0)
    lines.push({
      key: 'review',
      node: (
        <>
          {findings.awaitingKbReview} awaiting{' '}
          <FindingLink
            to={departmentId === null ? null : kbFindingHref('awaiting_review', departmentId)}
          >
            KB review
          </FindingLink>
        </>
      ),
    });
  if (findings.judgedCustomerSpecific > 0)
    lines.push({
      key: 'specific',
      node: `${findings.judgedCustomerSpecific} judged customer-specific (about one customer's situation, not a shared question)`,
    });
  if (findings.noClearLanguage > 0)
    lines.push({ key: 'language', node: `${findings.noClearLanguage} with no clear language` });
  if (findings.detached > 0)
    lines.push({
      key: 'detached',
      node: `${plural(findings.detached, 'entry', 'entries')} detached from a case (taken out by a moderator, or the thread moved to another mailbox)`,
    });
  for (const pair of findings.possibleDuplicates ?? []) {
    // Named as the rows name them ("Case #KB-900"), so the reader can find both.
    const ids = pair.caseIds.map((id, index) => kbRef(pair.casePublicIds?.[index], id)).join(', ');
    lines.push({
      key: `dup-${pair.caseIds.join('-')}`,
      node: `${ids} — review whether they are one case (Split one and its entries can be proposed into the other).`,
    });
  }
  if (lines.length === 0) return null;
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-2 text-sm font-medium">Findings</p>
        <ul className="space-y-1 text-sm list-disc list-inside" aria-label="Findings">
          {lines.map((line) => (
            <li key={line.key}>{line.node}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

/** Findings that count ENTRIES set aside (every finding but possible duplicates). */
const hasSetAsideCounts = (findings: KbCasesFindings) =>
  findings.rawEmails > 0 ||
  findings.judgedCustomerSpecific > 0 ||
  findings.couldNotClassify > 0 ||
  findings.awaitingKbReview > 0 ||
  findings.noClearLanguage > 0 ||
  findings.detached > 0;

/**
 * The set-aside entries are LISTED (rows with actions) only when the backend names them — a
 * backend before the worklist sends counts only, and then the findings panel shows those counts.
 */
const listsSetAside = (report: KbCasesReport): boolean => (report.setAside?.length ?? 0) > 0;

/** "this department" only when the report covers exactly one. */
const scopeWords = (report: KbCasesReport): string =>
  report.departmentIds !== undefined && report.departmentIds.length !== 1
    ? 'these departments'
    : 'this department';

const hasFindings = (findings: KbCasesFindings) =>
  findings.rawEmails > 0 ||
  findings.judgedCustomerSpecific > 0 ||
  findings.couldNotClassify > 0 ||
  findings.awaitingKbReview > 0 ||
  findings.noClearLanguage > 0 ||
  findings.detached > 0 ||
  (findings.possibleDuplicates ?? []).length > 0;

const BelowQualityBar = ({ count }: { count: number }) =>
  count > 0 ? (
    <p className="text-sm text-muted-foreground">
      {count} more learned {count === 1 ? 'answer' : 'answers'} below the quality bar
    </p>
  ) : null;

/**
 * What labels entries here. 'production': the nightly job labels this workspace. 'dry_run': the
 * owner's calibration — it labels into a trial table only, so nothing moves on this page. 'off':
 * it does not run (or has no AI provider).
 */
const NOT_RUNNING = 'consolidation is not running for this workspace';
const TRIAL_ONLY =
  'consolidation runs only as a trial here; its results are not shown on this page';

/** Entries not yet labelled live ONLY in `classifying` — not in rows, footer or findings. */
const ClassifyingStatus = ({ report }: { report: KbCasesReport }) => {
  const { settled, total } = report.classifying;
  if (settled >= total) return null;
  const mode = report.labellingMode;
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {mode === 'production'
        ? `Classifying: ${settled} of ${total}`
        : `Classified: ${settled} of ${total} — ${mode === 'dry_run' ? TRIAL_ONLY : NOT_RUNNING}.`}
    </p>
  );
};

/**
 * Unlabelled entries are not promised a case: once labelled they can land below the quality bar
 * or in a finding. `total` counts only entries the job can reach, so in production they are
 * all still being classified.
 */
const unclassifiedText = (count: number, report: KbCasesReport) => {
  const answers = plural(count, 'learned answer is', 'learned answers are');
  if (report.labellingMode === 'off') return `${answers} not classified — ${NOT_RUNNING}.`;
  if (report.labellingMode === 'dry_run')
    return `${answers} not classified here — consolidation runs for this workspace only as a trial, and its results are not shown on this page.`;
  return `${answers} still being classified — what is shown here can still change.`;
};

/**
 * The job classifies and proposes only the newest answers of each scope. `outOfReach` counts
 * EVERY answer past that bound; `beyondBound` the subset never classified. The notice speaks of
 * what the job DOES NEXT — it does not propose them as new cases — never "never proposed": one
 * already in a pending proposal (made while still within reach) shows as a "proposed" row, and a
 * pending attach member in its case row. Nor does it say they are "shown here": the view may be
 * narrowed by a search or a page, and some appear only as counts (footer, findings). In a big
 * mailbox's steady state nothing past the bound is unclassified (`beyondBound` 0 — some may have
 * FAILED classification and carry no label, so no label is claimed) and the bound still bit,
 * so the notice keys on `outOfReach`. A scope is a source, or a department with no source, so
 * the notice names neither.
 */
const BoundedNotice = ({ report }: { report: KbCasesReport }) => {
  const { outOfReach, beyondBound } = report.classifying;
  if (outOfReach <= 0) return null;
  const older = `${plural(outOfReach, 'older answer is', 'older answers are')} past the nightly job's limit`;
  return (
    <Alert variant="warning">
      {beyondBound > 0
        ? `${older}, and the nightly job does not propose ${outOfReach === 1 ? 'it' : 'them'} as new cases. ${beyondBound} of them ${beyondBound === 1 ? 'is' : 'are'} not classified.`
        : `${older}: the nightly job does not propose ${outOfReach === 1 ? 'it' : 'them'} as new cases.`}
    </Alert>
  );
};

/**
 * Why there are no case rows — true in every state. A search only narrows the rows, so with one
 * active nothing department-wide is claimed; unlabelled entries are not "no answers".
 */
const emptyText = (report: KbCasesReport, search: string, listed: boolean): string => {
  const stillClassifying = report.classifying.total - report.classifying.settled;
  if (search.trim()) return `No case matches “${search.trim()}”.`;
  if (stillClassifying > 0) return unclassifiedText(stillClassifying, report);
  // Findings are entries set aside for a reason (raw email, customer-specific…): not "no match".
  // "Listed" only where rows are: an older backend sends counts, which the panel only counts.
  if (listed)
    return 'No learned answer here forms a case yet — the entries set aside are listed below.';
  if (hasSetAsideCounts(report.findings))
    return 'No learned answer here forms a case yet — the findings below say why.';
  if (report.footer.belowQualityBar > 0)
    return 'None of the learned answers here clears the quality bar yet.';
  return 'No learned answers match here yet.';
};

/**
 * Mining off only means no MAILBOX feeds the knowledge base on its own. Resolve & Save and
 * training still add answers, and "awaiting KB review" items are current captures — so this
 * never says when anything was learned, and claims "no learned answers" only when the report
 * holds none at all, classified or not.
 */
const miningOffText = (
  report: KbCasesReport,
  learnedSomething: boolean,
  listed: boolean
): string => {
  const scope = scopeWords(report);
  const lead = `No mailbox in ${scope} feeds the knowledge base automatically`;
  const stillClassifying = report.classifying.total - report.classifying.settled;
  // "Listed" only when entries are listed as rows; counts are a summary.
  const where = listed ? 'listed below' : 'summarised below';
  if (stillClassifying > 0)
    return `${lead}. ${unclassifiedText(stillClassifying, report)}${learnedSomething ? ` What it already holds is ${where}.` : ''}`;
  if (learnedSomething) return `${lead}. What it holds for ${scope} is ${where}.`;
  if (report.classifying.total > 0)
    return `${lead}, and none of the answers it holds here forms a case yet.`;
  return `${lead}, so there are no learned answers to group into cases.`;
};

/** What the report view needs to act on entries (a backend that sends `setAside`). */
export type KbWorklist = {
  /** Re-read the report; resolves once it answered. */
  onChanged: () => Promise<void>;
  onNotice: (notice: KbWorkNotice | null) => void;
  /** The departments the report covers: where "Move into case" searches for cases. */
  departmentIds: number[];
};

const NO_SET_ASIDE_COUNTS = {
  rawEmails: 0,
  judgedCustomerSpecific: 0,
  couldNotClassify: 0,
  awaitingKbReview: 0,
  noClearLanguage: 0,
  detached: 0,
};

const pageHasCase = (report: KbCasesReport): boolean =>
  report.headers.some((header) =>
    header.rows.some((row) => row.kind === 'case' && row.caseId !== null)
  );

/** How far the existence check reads: at most this many pages of MOVE_SEARCH_PAGE topics. */
export const CASE_PROBE_MAX_PAGES = 20;

/**
 * Page through the UNSEARCHED report of these departments until a page holds a live case (true)
 * or the last page is read without one (false). Past the bound, or once `live()` turns false (the
 * scope changed meanwhile), it is not known (null).
 */
const probeCasesExist = async (
  departmentIds: number[],
  live: () => boolean
): Promise<boolean | null> => {
  for (let page = 1; page <= CASE_PROBE_MAX_PAGES; page += 1) {
    const read = await kbConsolidationService.getCases({
      departmentIds,
      page,
      pageSize: MOVE_SEARCH_PAGE,
    });
    if (!live()) return null;
    if (pageHasCase(read)) return true;
    if (page >= (read.pagination?.totalPages ?? 1)) return false;
  }
  return null;
};

/**
 * Is there a live case in the report's departments to move an entry into? A case on the page
 * answers yes; the whole scope on one unsearched page with none answers no. Otherwise (a search, or
 * more pages) the unsearched report is paged through once per scope (bounded) and the answer kept
 * for the page's lifetime. Null while not known, or when the bound bit — then "Move into case" is
 * still offered and its picker says when no case fits. A scope left before its answer came drops
 * that answer: it is never shown for the scope switched to.
 */
const useCasesExist = (
  report: KbCasesReport,
  search: string,
  departmentIds: number[] | null
): boolean | null => {
  const onPage = pageHasCase(report);
  const wholeScopeShown = !search.trim() && (report.pagination?.totalPages ?? 1) <= 1;
  const known = onPage ? true : wholeScopeShown ? false : null;
  const departmentsKey = departmentIds?.join(',') ?? null;
  // Per scope, for the page's lifetime: a re-read (every action) does not read it all again.
  const [answers, setAnswers] = useState<ReadonlyMap<string, boolean | null>>(() => new Map());
  const needsProbe = known === null && departmentsKey !== null && !answers.has(departmentsKey);
  useEffect(() => {
    if (!needsProbe || departmentsKey === null) return;
    let live = true;
    const settle = (exists: boolean | null) => {
      if (!live) return;
      setAnswers((prev) => new Map(prev).set(departmentsKey, exists));
    };
    probeCasesExist(departmentsKey ? departmentsKey.split(',').map(Number) : [], () => live)
      .then(settle)
      // Not known: the button stays offered.
      .catch(() => settle(null));
    return () => {
      live = false;
    };
  }, [needsProbe, departmentsKey]);
  if (known !== null) return known;
  return departmentsKey === null ? null : (answers.get(departmentsKey) ?? null);
};

/**
 * Which row is open survives a re-read by the row's IDENTITY — never its position: an unmerge or a
 * re-sort shifts positions, and another case would open in its place.
 */
const expansionKey = (row: KbCaseRow): string =>
  row.kind === 'case' && row.caseId !== null
    ? `case:${row.caseId}`
    : row.suggestionId !== null
      ? `proposal:${row.suggestionId}`
      : `${row.kind}:${row.entryIds.join(',')}`;

/**
 * React keys by IDENTITY, never position: a re-read that re-sorts topics or cases must not
 * remount an open case's entries (its line and focus would go with it). A topic is its scope,
 * label and language (the server groups by exactly that); a repeat gets a counter, not an index.
 */
const headerIdentity = (header: KbCasesReport['headers'][number]): string =>
  // Order-independent: a re-sort of its cases must not change the topic's identity.
  `${[...new Set(header.rows.map((row) => row.scopeKey ?? ''))].sort().join(',')}|${header.label ?? ''}|${header.language ?? ''}`;
const uniqueKeys = (keys: string[]): string[] => {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}#${count}`;
  });
};

export const KbCasesReportView = ({
  report,
  search = '',
  departmentId = null,
  worklist,
  casesPagination = null,
  noticeResetKey = '',
}: {
  report: KbCasesReport;
  /** The ONE department the report is for, if one: the findings' lists are per department. */
  departmentId?: number | null;
  /** The search the report was asked for; an empty result then means "nothing matches it". */
  search?: string;
  /** Row actions; only used when the backend names the entries (`setAside` present). */
  worklist?: KbWorklist;
  /** The cases' page control — right under the cases, not under the set-aside list. */
  casesPagination?: React.ReactNode;
  /** Changes when the viewer re-asks the report (sort, search, page): the set-aside line clears. */
  noticeResetKey?: string;
}) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const headerKeys = uniqueKeys(report.headers.map(headerIdentity));
  const learnedSomething = report.footer.belowQualityBar > 0 || hasFindings(report.findings);
  // Rows can be opened and acted on only against a backend that has the worklist routes — the
  // one that sends `setAside`. An older one gets today's read-only report.
  const active = worklist && report.setAside !== undefined ? worklist : null;
  // The set-aside list's line lives here (it must outlive that list emptying), and clears on the
  // next action anywhere on the page (every action first clears the page's line) or a re-ask.
  const [setAsideNotice, setSetAsideNotice] = useState<KbWorkNotice | null>(null);
  useEffect(() => setSetAsideNotice(null), [noticeResetKey]);
  const pageNotice = active?.onNotice;
  const onNotice = useCallback(
    (notice: KbWorkNotice | null) => {
      if (notice === null) setSetAsideNotice(null);
      pageNotice?.(notice);
    },
    [pageNotice]
  );
  const listed = active !== null && listsSetAside(report);
  const casesExist = useCasesExist(report, search, active ? active.departmentIds : null);
  // Entries that are listed as rows are not counted again in the panel; possible duplicates
  // (pairs of cases, not entries) stay there.
  const panelFindings = listed ? { ...report.findings, ...NO_SET_ASIDE_COUNTS } : report.findings;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Kept on screen while it still has a line to say — moving the LAST entry out empties
  // `setAside`, and the line (and the heading focus goes to) must not vanish with it.
  const setAside =
    active && (listed || setAsideNotice !== null) ? (
      <KbSetAside
        items={report.setAside ?? []}
        departmentIds={active.departmentIds}
        casesExist={casesExist}
        notice={setAsideNotice}
        onListNotice={setSetAsideNotice}
        onChanged={active.onChanged}
        onNotice={onNotice}
        searchActive={search.trim().length > 0}
      />
    ) : null;

  if (report.miningOff) {
    return (
      <div className="space-y-4">
        <Alert>{miningOffText(report, learnedSomething, listed)}</Alert>
        <BoundedNotice report={report} />
        <ClassifyingStatus report={report} />
        <BelowQualityBar count={report.footer.belowQualityBar} />
        {setAside}
        <KbCasesFindingsPanel findings={panelFindings} departmentId={departmentId} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <BoundedNotice report={report} />
      <ClassifyingStatus report={report} />
      {report.headers.length === 0 ? (
        <p className="py-6 text-sm text-center text-muted-foreground">
          {emptyText(report, search, listed)}
        </p>
      ) : (
        <ul className="space-y-4" aria-label="Cases">
          {report.headers.map((header, index) => (
            <li key={headerKeys[index]}>
              <div className="flex flex-wrap gap-2 items-baseline mb-2">
                <span className="font-display font-semibold">{header.label ?? '(no label)'}</span>
                {header.language && <Badge variant="secondary">{header.language}</Badge>}
                {/* The UNION of its rows' conversations — each once (plan §2.8). Never worded as
                    a total: the row counts below overlap and must not be added up. Same noun
                    as the rows and the caption, so nobody reads two different things. */}
                <span className="text-xs text-muted-foreground">
                  {header.rows.length === 1 && memberCount(header.rows[0]) > header.conversations
                    ? // More answers than conversations: name both, as the row does.
                      conversationsText(memberCount(header.rows[0]), header.conversations)
                    : `${plural(header.conversations, 'conversation', 'conversations')} ${
                        header.rows.length === 1
                          ? 'in this case'
                          : 'across these cases, each counted once'
                      }`}
                </span>
              </div>
              <ul className="space-y-2">
                {header.rows.map((row, rowIndex) => {
                  const key = expansionKey(row);
                  const open = expanded.has(key);
                  return (
                    <KbCaseRowView
                      key={uniqueKeys(header.rows.map(expansionKey))[rowIndex]}
                      row={row}
                      expansion={
                        active
                          ? {
                              open,
                              onToggle: () => toggle(key),
                              panel: open ? (
                                <KbWorkRows
                                  ids={rowEntryIds(row)}
                                  caseContext={
                                    row.kind === 'case' && row.caseId !== null
                                      ? {
                                          caseId: row.caseId,
                                          casePublicId: row.casePublicId,
                                          ...(Number.isInteger(row.memberCount)
                                            ? { memberCount: row.memberCount }
                                            : {}),
                                          proposals: new Map(
                                            (row.pendingAttach ?? []).map((item) => [
                                              item.entryId,
                                              item.suggestionId,
                                            ])
                                          ),
                                        }
                                      : null
                                  }
                                  departmentIds={active.departmentIds}
                                  casesExist={casesExist}
                                  onChanged={active.onChanged}
                                  onNotice={onNotice}
                                  label={`Entries of ${rowTitle(row)}`}
                                />
                              ) : null,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {casesPagination}
      <BelowQualityBar count={report.footer.belowQualityBar} />
      {setAside}
      <KbCasesFindingsPanel findings={panelFindings} departmentId={departmentId} />
    </div>
  );
};
