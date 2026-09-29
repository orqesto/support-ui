import { useCallback, useEffect, useState } from 'react';
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
import { getApiErrorMessage } from '@/lib/errorMessages';
import { caseHref } from '@/lib/kbConsolidation';
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
  if (row.kind === 'case') return `Case #${row.casePublicId ?? row.caseId ?? '?'}`;
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

export const KbCasesFindingsPanel = ({ findings }: { findings: KbCasesFindings }) => {
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
          <Link to="/knowledge-base#qa_pair" className="text-primary hover:underline">
            clean up
          </Link>
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
          <Link to="/knowledge-base?status=pending" className="text-primary hover:underline">
            KB review
          </Link>
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
    const ids = pair.caseIds.map((id) => `#${id}`).join(', ');
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

export const KbCasesReportView = ({ report }: { report: KbCasesReport }) => {
  if (report.miningOff) {
    return (
      <Alert>
        Learning from conversations is off for this department — no mailbox here feeds the knowledge
        base, so there are no learned answers to group into cases.
      </Alert>
    );
  }
  const { settled, total } = report.classifying;
  return (
    <div className="space-y-4">
      {report.bounded && (
        <Alert variant="warning">
          A mailbox here has more learned answers than the nightly grouping reads. Only the newest
          are grouped, so older answers are missing and the counts can be low.
        </Alert>
      )}
      {settled < total && (
        <p className="text-sm text-muted-foreground" role="status">
          Classifying: {settled} of {total}
        </p>
      )}
      {report.headers.length === 0 ? (
        <p className="py-6 text-sm text-center text-muted-foreground">
          No learned answers match here yet.
        </p>
      ) : (
        <ul className="space-y-4" aria-label="Cases">
          {report.headers.map((header, index) => (
            <li key={`${header.label ?? ''}-${header.language ?? ''}-${index}`}>
              <div className="flex flex-wrap gap-2 items-baseline mb-2">
                <span className="font-display font-semibold">{header.label ?? '(no label)'}</span>
                {header.language && <Badge variant="secondary">{header.language}</Badge>}
                {/* The UNION of its rows' threads — each thread once. Deliberately not worded
                    as a "conversations" total: row counts below overlap and must not be added. */}
                <span className="text-xs text-muted-foreground">
                  {plural(header.conversations, 'thread', 'threads')} in total, each counted once
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
      {report.footer.belowQualityBar > 0 && (
        <p className="text-sm text-muted-foreground">
          {report.footer.belowQualityBar} more learned{' '}
          {report.footer.belowQualityBar === 1 ? 'answer' : 'answers'} below the quality bar
        </p>
      )}
      <KbCasesFindingsPanel findings={report.findings} />
    </div>
  );
};

export const KbCasesPage = () => {
  const { data: departments = [], isLoading: deptsLoading } = useDepartments();
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [pendingSearch, setPendingSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'conversations' | 'lastSeen'>('conversations');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<KbCasesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (departmentId === null && departments.length > 0) setDepartmentId(departments[0].id);
  }, [departments, departmentId]);

  const load = useCallback(async () => {
    if (departmentId === null) return;
    setLoading(true);
    setError(null);
    try {
      setReport(
        await kbConsolidationService.getCases({
          departmentId,
          search,
          sort,
          page,
          pageSize: PAGE_SIZE,
        })
      );
    } catch (err) {
      setReport(null);
      setError(getApiErrorMessage(err) ?? 'Could not load the cases report.');
    } finally {
      setLoading(false);
    }
  }, [departmentId, search, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCsv()}
              disabled={departmentId === null}
            >
              <Download className="mr-1 w-4 h-4" />
              Download CSV
            </Button>
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
              onChange={setPendingSearch}
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
          report && <KbCasesReportView report={report} />
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
