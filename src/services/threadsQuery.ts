/**
 * How the inbox list is fetched, and why it is not a GET.
 *
 * 🔒 The filter set is not safe to put in a request line. `receivedAt` is a
 * CORRESPONDENT'S email address and `search` is whatever the agent typed — routinely a
 * customer's name, order number or address. In a query string both end up in the browser
 * address bar, in history, in every shared or saved link, in the `Referer` of the next
 * click, and in the standard access log, which records the full request line. A POST body
 * is in none of those.
 */
import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';

/**
 * Whether this backend has `POST /api/messages/threads/search`.
 *
 * `null` until the first attempt, then latched. Without the memo every list read on an
 * older backend would pay a failed POST before its GET, which is the inbox's hottest
 * path. Reset per page load, which is also when a deploy could have changed the answer.
 */
let threadsSearchSupported: boolean | null = null;

/** Test seam — the memo is module state, and a suite must be able to start clean. */
export const resetThreadsSearchSupport = (): void => {
  threadsSearchSupported = null;
};

export type ThreadsRequest = {
  filters: Record<string, string>;
  page: number;
  limit: number;
  sortOrder?: 'asc' | 'desc';
  sortBy: string;
};

export const fetchThreads = async <T>({
  filters,
  page,
  limit,
  sortOrder,
  sortBy,
}: ThreadsRequest): Promise<T> => {
  if (threadsSearchSupported !== false) {
    try {
      const response = await apiClient.post<T>('/api/messages/threads/search', {
        ...filters,
        page,
        limit,
        ...(sortOrder ? { sortOrder } : {}),
        ...(sortBy !== 'time' ? { sortBy } : {}),
      });
      threadsSearchSupported = true;
      return response.data;
    } catch (err) {
      // Only a MISSING route falls back. Anything else — a 400, a 500, a dropped
      // connection — is a real failure and must surface, or a broken query quietly
      // reruns as a different one and the agent is shown a plausible wrong list.
      const status = getErrorStatus(err);
      if (status !== 404 && status !== 405) throw err;
      threadsSearchSupported = false;
    }
  }

  // Fallback for a backend that predates the route. This repo deploys on merge while the
  // backend ships on a tag, so that window is real and the inbox must not depend on
  // deploy ordering.
  //
  // ⚠️ `receivedAt` goes back into the query string here, deliberately. A backend without
  // this route also cannot read the header, so withholding the value would not protect
  // anything — it would silently drop the filter and show a WIDER list as though it were
  // filtered. A wrong answer presented as right is worse than the exposure this avoids,
  // and the exposure ends when the tag ships.
  const params = new URLSearchParams({
    ...filters,
    page: page.toString(),
    limit: limit.toString(),
  });
  if (sortOrder) params.append('sortOrder', sortOrder);
  if (sortBy !== 'time') params.append('sortBy', sortBy);

  const response = await apiClient.get<T>(
    `/api/messages/threads?${params.toString()}`,
    filters.receivedAt ? { headers: { 'X-Filter-Received-At': filters.receivedAt } } : undefined
  );
  return response.data;
};
