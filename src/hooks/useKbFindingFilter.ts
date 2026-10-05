import { useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { kbFindingFromSearch, withoutKbFinding, type KbFindingFilter } from '@/lib/kbFinding';
import { kbService } from '@/services/kb.service';

/**
 * What the last list request did with the finding: `applied` (the server narrowed the list to it),
 * `unsupported` (a server without the filter answered with EVERY entry — must never be presented
 * as the finding), `failed` (no list), or null while nothing has answered yet.
 */
export type KbFindingListResult = 'applied' | 'unsupported' | 'failed' | null;

export type KbFindingBannerProps = {
  filter: KbFindingFilter | null;
  result: KbFindingListResult;
  /** Status, source or search filters narrow the list further than the finding. */
  otherFilters: boolean;
  onShowAll: () => void;
};

type ListParams = Omit<
  NonNullable<Parameters<typeof kbService.getAll>[0]>,
  'finding' | 'departmentId'
>;

/**
 * The KB cases finding the knowledge base list is narrowed to, if any (`?finding=…&departmentId=…`):
 * a key for fetch dependencies (with the department context), the list request that carries the
 * finding and records what the server did with it, the banner's props, and the way out of it.
 */
export const useKbFindingFilter = (departmentKey: string) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const filter = kbFindingFromSearch(searchParams);
  const [result, setResult] = useState<{ result: KbFindingListResult; otherFilters: boolean }>({
    result: null,
    otherFilters: false,
  });
  const latest = useRef(0);
  // The request that settled last: the page's `finally` asks whether it was overtaken.
  const settled = useRef(0);
  /** `hash`: the tab to land on (Clear All goes to every type, not the finding's Q&A tab). */
  const showAllEntries = (hash: string = location.hash) =>
    navigate({ search: withoutKbFinding(searchParams), hash });

  const fetchList = async (params: ListParams) => {
    const requestId = ++latest.current;
    // Every finding entry is a Q&A pair: another tab is a filter that hides them too.
    const otherFilters =
      (params.type !== undefined && params.type !== 'qa_pair') ||
      params.status !== undefined ||
      (params.search ?? '') !== '' ||
      params.messageSourceId !== undefined;
    try {
      const response = await kbService.getAll({ ...params, ...(filter ?? {}) });
      settled.current = requestId;
      const echoed = (response.data as { filters?: { finding?: unknown } }).filters?.finding;
      // A response overtaken by a newer request (a slow finding list after "Show all entries")
      // must not reach the page: it would replace the newer list. Null tells the caller to drop it.
      if (requestId !== latest.current) return null;
      setResult({
        result: filter && echoed !== filter.finding ? 'unsupported' : 'applied',
        otherFilters,
      });
      return response;
    } catch (err) {
      settled.current = requestId;
      if (requestId !== latest.current) return null;
      setResult({ result: 'failed', otherFilters });
      throw err;
    }
  };

  /**
   * True when the request that just settled was overtaken by a newer one: that newer request
   * owns the loading state, so the overtaken one must not switch the spinner off.
   */
  const overtaken = () => settled.current !== latest.current;

  /**
   * The page to re-read after an entry left the finding's list (hide / reject): the list shrank
   * on the server, so the last row of a page past the first leaves that page empty — read the
   * one before it instead.
   */
  const pageAfter = (rowsOnPage: number, page: number) =>
    rowsOnPage <= 1 && page > 1 ? page - 1 : page;

  const banner: KbFindingBannerProps = { filter, ...result, onShowAll: showAllEntries };
  return {
    filter,
    listScopeKey: `${departmentKey}|${filter ? `${filter.finding}:${filter.departmentId}` : ''}`,
    fetchList,
    overtaken,
    pageAfter,
    banner,
    showAllEntries,
  };
};
