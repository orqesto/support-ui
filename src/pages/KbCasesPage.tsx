import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { KbCaseRowView } from '@/components/kb/KbCaseRowView';
import {
  KbCasesFindingsPanel,
  KbCasesReportView,
  type KbWorklist,
} from '@/components/kb/KbCasesReportView';
import { KbRunNow } from '@/components/kb/KbRunNow';
import { KbDepartmentFilter } from '@/components/kb/KbDepartmentFilter';
import type { KbWorkNotice } from '@/components/kb/KbWorkRows';
import { useAuthStore } from '@/stores/authStore';
import {
  kbConsolidationService,
  KbCasesNeedsDepartmentError,
  type KbCasesReport,
} from '@/services/kbConsolidation.service';

const PAGE_SIZE = 25;

// Kept importable from the page, where its tests find them.
export { KbCaseRowView, KbCasesFindingsPanel, KbCasesReportView };

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

/** `?departments=3,5` — positive integers only, each once, in the order given. */
const parseDepartments = (raw: string | null): number[] => [
  ...new Set(
    (raw ?? '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0)
  ),
];

export const KbCasesPage = () => {
  // Inactive departments too: the report's "all" counts them, so ticking every box == all.
  const { data: allDepartments = [], isLoading: deptsLoading } = useDepartments({
    includeInactive: true,
  });
  const { isOrgAdmin } = usePermissions();
  const myDepartmentIds = useAuthStore((state) => state.user?.departmentIds);
  // The report route answers 404 for a department a moderator is not in (org admins: any), so
  // offer only departments that will answer. No department list on the user (an older backend)
  // means none, not all.
  const departments = useMemo(
    () =>
      (isOrgAdmin
        ? allDepartments
        : allDepartments.filter((dept) => (myDepartmentIds ?? []).includes(dept.id))
      ).map((dept) => ({
        id: dept.id,
        name: dept.active === false ? `${dept.name} (inactive)` : dept.name,
      })),
    [allDepartments, isOrgAdmin, myDepartmentIds]
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // The ticked departments live in the URL (`?departments=3,5`). Only those the viewer can see
  // count: one that left the list (a workspace switch, a membership change) is dropped, never
  // requested. None ticked = every department the viewer can see.
  const departmentsParam = searchParams.get('departments');
  const selected = useMemo(
    () =>
      parseDepartments(departmentsParam).filter((id) => departments.some((dept) => dept.id === id)),
    [departmentsParam, departments]
  );
  const selectedKey = selected.join(',');
  // A backend before the worklist reports on ONE department and refuses anything else (400):
  // then the page falls back to a single department — the first ticked, or the first visible.
  const [legacy, setLegacy] = useState(false);
  const legacyDepartmentId = selected[0] ?? departments[0]?.id ?? null;
  const scopeKey = legacy ? `one:${legacyDepartmentId ?? ''}` : `set:${selectedKey}`;

  const [pendingSearch, setPendingSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'conversations' | 'lastSeen'>('conversations');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<KbCasesReport | null>(null);
  // The departments each report was asked for: a report for the departments the viewer just
  // left is never shown under the new choice while it loads.
  const [reportScope, setReportScope] = useState<string | null>(null);
  // The search each report was ASKED with: while a new search loads, the report on screen still
  // belongs to the old one, and its empty text must speak of that one.
  const [reportSearch, setReportSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<KbWorkNotice | null>(null);

  const setDepartments = (ids: number[]) => {
    const next = new URLSearchParams(searchParams);
    if (ids.length > 0) next.set('departments', ids.join(','));
    else next.delete('departments');
    setSearchParams(next, { replace: true });
    setPage(1);
    setNotice(null);
  };

  // A department moderator with no department has nothing to report on. An ORG-LEVEL viewer still
  // does: with no department asked for, the server reports org-wide entries and mailboxes linked
  // to no department (`unassignedScopes`) — so the page asks.
  const noDepartments = !deptsLoading && departments.length === 0 && !isOrgAdmin;
  // An older server reports on ONE department; with none in the workspace it has nothing to say.
  const legacyNoDepartment = legacy && legacyDepartmentId === null;

  // Only the newest request may write: a slow answer for the departments the viewer just left
  // must not land on top of the one they switched to.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    if (deptsLoading || noDepartments) return;
    if (legacyNoDepartment) return;
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const next = await kbConsolidationService.getCases({
        ...(legacy
          ? { departmentId: legacyDepartmentId ?? undefined }
          : { departmentIds: selectedKey ? selectedKey.split(',').map(Number) : [] }),
        search,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      if (requestId === latestRequest.current) {
        // A backend that now answers in the worklist's shape (it was upgraded meanwhile): back
        // to the department set; the effect re-asks.
        if (legacy && next.departmentIds !== undefined) {
          setLegacy(false);
          return;
        }
        setReport(next);
        setReportScope(scopeKey);
        setReportSearch(search);
      }
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      if (err instanceof KbCasesNeedsDepartmentError) {
        // Re-asked at once for one department (the effect re-runs on `legacy`).
        setLegacy(true);
        return;
      }
      setReport(null);
      setError(getApiErrorMessage(err) ?? 'Could not load the cases report.');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [
    deptsLoading,
    noDepartments,
    legacyNoDepartment,
    legacy,
    legacyDepartmentId,
    selectedKey,
    scopeKey,
    search,
    sort,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // A run that ended, or an entry acted on, changes the report (cases, findings, set-aside).
  // Through a ref: an action that answers after the viewer switched departments (or page, sort,
  // search) must re-read what is shown NOW — not the scope captured when it was sent.
  const loadRef = useRef(load);
  loadRef.current = load;
  const handleRunEnded = useCallback(() => void loadRef.current(), []);
  // The viewer's own choice: none ticked = all — sent as no list at all (the applied list for
  // "all" can be longer than a request may carry).
  const worklist = useMemo<KbWorklist>(
    () => ({
      onChanged: () => loadRef.current(),
      onNotice: setNotice,
      departmentIds: selectedKey ? selectedKey.split(',').map(Number) : [],
    }),
    [selectedKey]
  );
  // A line about an Unmerge outlives the case it was about: when focus went with that case,
  // it moves to the line that says what happened.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notice) return;
    const active = document.activeElement;
    if (!active || active === document.body || !document.body.contains(active))
      noticeRef.current?.focus();
  }, [notice]);

  const handleCsv = async () => {
    try {
      await kbConsolidationService.downloadCasesCsv(
        legacy
          ? { departmentId: legacyDepartmentId ?? undefined, search, sort }
          : { departmentIds: selected, search, sort }
      );
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not download the CSV.');
    }
  };

  // The findings' links are per department: offered only when the report covers exactly one.
  const oneDepartment = legacy
    ? legacyDepartmentId
    : report?.departmentIds?.length === 1
      ? report.departmentIds[0]
      : selected.length === 1
        ? selected[0]
        : null;
  const shownReport = report && reportScope === scopeKey ? report : null;

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
                disabled={noDepartments || legacyNoDepartment}
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
          {legacy ? (
            <div>
              <Label htmlFor="cases-dept">Department</Label>
              <Select
                id="cases-dept"
                value={legacyDepartmentId ?? ''}
                onChange={(event) => setDepartments([Number(event.target.value)])}
                disabled={deptsLoading || departments.length === 0}
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : departments.length === 0 ? (
            // No department to tick (an org-level viewer still gets a report): say what it covers.
            shownReport?.unassignedScopes === true && (
              <p className="text-xs text-muted-foreground" data-testid="departments-scope">
                No department in this workspace — showing everything you can see, including
                mailboxes linked to no department.
              </p>
            )
          ) : (
            departments.length > 0 && (
              <KbDepartmentFilter
                departments={departments}
                selected={selected}
                onChange={setDepartments}
                unassignedScopes={
                  shownReport && selected.length === 0
                    ? shownReport.unassignedScopes === true
                    : null
                }
              />
            )
          )}
          <div>
            <Label htmlFor="cases-sort">Sort</Label>
            <Select
              id="cases-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value === 'lastSeen' ? 'lastSeen' : 'conversations');
                setPage(1);
                setNotice(null);
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
                  setNotice(null);
                }
              }}
              onSearch={() => {
                setSearch(pendingSearch);
                setPage(1);
                setNotice(null);
              }}
              showSearchButton
              placeholder="Search questions"
            />
          </div>
        </div>
        {legacy && (
          <p className="text-xs text-muted-foreground">
            This server reports on one department at a time, and its entries cannot be acted on from
            this page yet — open them from the knowledge base.
          </p>
        )}

        {noDepartments && <Alert>You have no department to report on.</Alert>}
        {legacyNoDepartment && (
          <Alert>This server reports on one department at a time, and there is none to pick.</Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        {notice && (
          <div ref={noticeRef} tabIndex={-1} className="outline-none" data-testid="page-notice">
            <Alert variant={notice.variant}>{notice.text}</Alert>
          </div>
        )}
        {!shownReport ? (
          (loading || (!error && !noDepartments && !legacyNoDepartment)) && (
            <div className="flex justify-center py-8" role="status" aria-busy="true">
              <Spinner />
            </div>
          )
        ) : (
          <KbCasesReportView
            report={shownReport}
            search={reportSearch}
            departmentId={oneDepartment}
            worklist={worklist}
            noticeResetKey={`${sort}|${search}|${page}`}
            casesPagination={
              shownReport.pagination.totalPages > 1 ? (
                <Pagination
                  currentPage={shownReport.pagination.page}
                  totalPages={shownReport.pagination.totalPages}
                  total={shownReport.pagination.total}
                  limit={shownReport.pagination.pageSize}
                  onPageChange={(next) => {
                    setPage(next);
                    setNotice(null);
                  }}
                  loading={loading}
                />
              ) : null
            }
          />
        )}
      </div>
    </Layout>
  );
};
