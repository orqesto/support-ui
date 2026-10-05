import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KB_MERGES_REVIEW_PATH } from '@/components/layout/KbReviewSection';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { caseHref, kbRef } from '@/lib/kbConsolidation';
import { kbFindingHref } from '@/lib/kbFinding';
import { KbRunNow } from '@/components/kb/KbRunNow';
import { useAuthStore } from '@/stores/authStore';
import {
  kbConsolidationService,
  type KbCaseRow,
  type KbCasesFindings,
  type KbCasesReport,
} from '@/services/kbConsolidation.service';

const PAGE_SIZE = 25;

/**
 * ⛔ Every line of copy on this page has to stay TRUE in every state it can be in (plan §2.8):
 * the counts are conversations whose answers were LEARNED into the KB (not all conversations);
 * grouping is automatic, so one real case can appear as two rows; a thread can raise several
 * cases, so row counts are never summed into a "conversations" total; and only a moderator-
 * approved CASE has a standard answer — every other row says it has none, never shows one.
 */
export const KB_CASES_CAPTION =
  'Counts are conversations whose answers were learned into the knowledge base — not all conversations. ' +
  'Cases are grouped automatically, so one real case can appear twice, and one conversation can appear under several cases.';

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const rowTitle = (row: KbCaseRow): string => {
  if (row.kind === 'case')
    return `Case ${row.caseId !== null ? kbRef(row.casePublicId, row.caseId) : '#?'}`;
  if (row.title) return row.title;
  return row.kind === 'single' ? 'single learned answer' : row.kind;
};

export const KbCaseRowView = ({ row }: { row: KbCaseRow }) => {
  const isCase = row.kind === 'case';
  const questions = isCase ? (row.question ? [row.question] : []) : (row.questions ?? []);
  return (
    <li
      className="p-3 space-y-2 rounded-lg border border-border"
      data-testid={`case-row-${row.kind}`}
    >
      <div className="flex flex-wrap gap-2 items-center">
        {isCase && row.caseId !== null ? (
          <Link to={caseHref(row.caseId)} className="font-medium text-primary hover:underline">
            {rowTitle(row)}
          </Link>
        ) : (
          <span className="font-medium">{rowTitle(row)}</span>
        )}
        {row.kind === 'proposed' && (
          <Link to={KB_MERGES_REVIEW_PATH} className="text-xs text-primary hover:underline">
            Review
          </Link>
        )}
        {row.source && <Badge variant="secondary">{row.source}</Badge>}
      </div>
      {questions.length > 0 && (
        <ul className="space-y-0.5 text-sm list-disc list-inside" aria-label="Questions">
          {questions.map((question, index) => (
            <li key={index} className="break-words">
              {question}
            </li>
          ))}
        </ul>
      )}
      {isCase ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Standard answer: </span>
          <span className="whitespace-pre-wrap break-words">{row.standardAnswer ?? '—'}</span>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">no standard answer yet</p>
      )}
      <p className="text-xs text-muted-foreground">
        {plural(row.conversations, 'conversation', 'conversations')} ·{' '}
        {plural(row.customers, 'customer', 'customers')} · first seen {formatDate(row.firstSeen)} ·
        last seen {formatDate(row.lastSeen)}
      </p>
    </li>
  );
};

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
      node: `${plural(findings.detached, 'entry', 'entries')} detached from a case (the thread moved to another mailbox)`,
    });
  for (const pair of findings.possibleDuplicates ?? []) {
    // Named as the rows name them ("Case #KB-900"), so the reader can find both.
    const ids = pair.caseIds.map((id, index) => kbRef(pair.casePublicIds?.[index], id)).join(', ');
    lines.push({
      key: `dup-${pair.caseIds.join('-')}`,
      node: `${ids} — review whether they are one case (Unmerge one and its entries can be proposed into the other).`,
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
const emptyText = (report: KbCasesReport, search: string): string => {
  const stillClassifying = report.classifying.total - report.classifying.settled;
  if (search.trim()) return `No case matches “${search.trim()}”.`;
  if (stillClassifying > 0) return unclassifiedText(stillClassifying, report);
  // Findings are entries set aside for a reason (raw email, customer-specific…): not "no match".
  if (hasFindings(report.findings))
    return 'No learned answer here forms a case yet — what there is is listed below.';
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
const miningOffText = (report: KbCasesReport, learnedSomething: boolean): string => {
  const lead = 'No mailbox in this department feeds the knowledge base automatically';
  const stillClassifying = report.classifying.total - report.classifying.settled;
  if (stillClassifying > 0)
    return `${lead}. ${unclassifiedText(stillClassifying, report)}${learnedSomething ? ' What it already holds is listed below.' : ''}`;
  if (learnedSomething) return `${lead}. What it holds for this department is listed below.`;
  if (report.classifying.total > 0)
    return `${lead}, and none of the answers it holds here forms a case yet.`;
  return `${lead}, so there are no learned answers to group into cases.`;
};

export const KbCasesReportView = ({
  report,
  search = '',
  departmentId = null,
}: {
  report: KbCasesReport;
  /** The department the report is for: the findings' lists are per department. */
  departmentId?: number | null;
  /** The search the report was asked for; an empty result then means "nothing matches it". */
  search?: string;
}) => {
  const learnedSomething = report.footer.belowQualityBar > 0 || hasFindings(report.findings);
  if (report.miningOff) {
    return (
      <div className="space-y-4">
        <Alert>{miningOffText(report, learnedSomething)}</Alert>
        <BoundedNotice report={report} />
        <ClassifyingStatus report={report} />
        <BelowQualityBar count={report.footer.belowQualityBar} />
        <KbCasesFindingsPanel findings={report.findings} departmentId={departmentId} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <BoundedNotice report={report} />
      <ClassifyingStatus report={report} />
      {report.headers.length === 0 ? (
        <p className="py-6 text-sm text-center text-muted-foreground">
          {emptyText(report, search)}
        </p>
      ) : (
        <ul className="space-y-4" aria-label="Cases">
          {report.headers.map((header, index) => (
            <li key={`${header.label ?? ''}-${header.language ?? ''}-${index}`}>
              <div className="flex flex-wrap gap-2 items-baseline mb-2">
                <span className="font-display font-semibold">{header.label ?? '(no label)'}</span>
                {header.language && <Badge variant="secondary">{header.language}</Badge>}
                {/* The UNION of its rows' conversations — each once (plan §2.8). Never worded as
                    a total: the row counts below overlap and must not be added up. Same noun
                    as the rows and the caption, so nobody reads two different things. */}
                <span className="text-xs text-muted-foreground">
                  {plural(header.conversations, 'conversation', 'conversations')}{' '}
                  {header.rows.length === 1
                    ? 'in this case'
                    : 'across these cases, each counted once'}
                </span>
              </div>
              <ul className="space-y-2">
                {header.rows.map((row, rowIndex) => (
                  <KbCaseRowView
                    key={`${row.kind}-${row.caseId ?? row.suggestionId ?? rowIndex}-${rowIndex}`}
                    row={row}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <BelowQualityBar count={report.footer.belowQualityBar} />
      <KbCasesFindingsPanel findings={report.findings} departmentId={departmentId} />
    </div>
  );
};

export const KbCasesPage = () => {
  const { data: allDepartments = [], isLoading: deptsLoading } = useDepartments();
  const { isOrgAdmin } = usePermissions();
  const myDepartmentIds = useAuthStore((state) => state.user?.departmentIds);
  // The report route answers 404 for a department a moderator is not in (org admins: any), so
  // offer — and preselect — only departments that will answer. No department list on the user
  // (an older backend) means none, not all.
  const departments = useMemo(
    () =>
      isOrgAdmin
        ? allDepartments
        : allDepartments.filter((dept) => (myDepartmentIds ?? []).includes(dept.id)),
    [allDepartments, isOrgAdmin, myDepartmentIds]
  );
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [pendingSearch, setPendingSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'conversations' | 'lastSeen'>('conversations');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<KbCasesReport | null>(null);
  // The search each report was ASKED with: while a new search loads, the report on screen still
  // belongs to the old one, and its empty text must speak of that one.
  const [reportSearch, setReportSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the choice inside the list: after a workspace switch (or a membership change) the old
  // department would 404 — fall back to the first one the viewer can see, or to none.
  useEffect(() => {
    if (departmentId !== null && departments.some((dept) => dept.id === departmentId)) return;
    const next = departments[0]?.id ?? null;
    if (next !== departmentId) {
      setDepartmentId(next);
      setPage(1);
      setReport(null);
    }
  }, [departments, departmentId]);

  // Only the newest request may write: a slow answer for the department the viewer just left
  // must not land on top of the one they switched to.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    if (departmentId === null) return;
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const next = await kbConsolidationService.getCases({
        departmentId,
        search,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      if (requestId === latestRequest.current) {
        setReport(next);
        setReportSearch(search);
      }
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setReport(null);
      setError(getApiErrorMessage(err) ?? 'Could not load the cases report.');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [departmentId, search, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // A run that ended changes the report (classified counts, cases, findings).
  const handleRunEnded = useCallback(() => void load(), [load]);

  const handleCsv = async () => {
    if (departmentId === null) return;
    try {
      await kbConsolidationService.downloadCasesCsv({ departmentId, search, sort });
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not download the CSV.');
    }
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full">
        <PageHeader
          title="Knowledge base cases"
          description="The questions customers keep asking, grouped from learned answers"
          actions={
            <div className="flex flex-wrap gap-3 items-start">
              <KbRunNow onRunEnded={handleRunEnded} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCsv()}
                disabled={departmentId === null}
              >
                <Download className="mr-1 w-4 h-4" />
                Download CSV
              </Button>
            </div>
          }
        />
        <p className="text-sm text-muted-foreground" data-testid="cases-caption">
          {KB_CASES_CAPTION}
        </p>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label htmlFor="cases-dept">Department</Label>
            <Select
              id="cases-dept"
              value={departmentId ?? ''}
              onChange={(event) => {
                setDepartmentId(Number(event.target.value));
                setPage(1);
                // The report on screen belongs to the department just left — never show it
                // under the new one's name while the new one loads.
                setReport(null);
              }}
              disabled={deptsLoading || departments.length === 0}
            >
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cases-sort">Sort</Label>
            <Select
              id="cases-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value === 'lastSeen' ? 'lastSeen' : 'conversations');
                setPage(1);
              }}
            >
              <option value="conversations">Most conversations</option>
              <option value="lastSeen">Most recently seen</option>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={pendingSearch}
              onChange={(value) => {
                setPendingSearch(value);
                // The X (or deleting every letter) clears the APPLIED search too, as on the KB
                // page — else the list and the CSV keep the old filter (FE pass 19 LOW-2).
                if (!value.trim() && search) {
                  setSearch('');
                  setPage(1);
                }
              }}
              onSearch={() => {
                setSearch(pendingSearch);
                setPage(1);
              }}
              showSearchButton
              placeholder="Search questions"
            />
          </div>
        </div>

        {!deptsLoading && departments.length === 0 && (
          <Alert>You have no department to report on.</Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        {loading && !report ? (
          <div className="flex justify-center py-8" role="status" aria-busy="true">
            <Spinner />
          </div>
        ) : (
          report && (
            <KbCasesReportView report={report} search={reportSearch} departmentId={departmentId} />
          )
        )}
        {report && !report.miningOff && report.pagination.totalPages > 1 && (
          <Pagination
            currentPage={report.pagination.page}
            totalPages={report.pagination.totalPages}
            total={report.pagination.total}
            limit={report.pagination.pageSize}
            onPageChange={setPage}
            loading={loading}
          />
        )}
      </div>
    </Layout>
  );
};
