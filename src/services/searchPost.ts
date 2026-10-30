/**
 * The other searched lists, read the way the inbox list is (threadsQuery.ts): the filters —
 * the typed search among them — in a POST body, not the query string. In a request line a
 * typed customer name, order number or address ends up in the address bar, history, shared
 * links, the next click's `Referer` and the access log.
 *
 * Backend: POST /api/messages/search, /api/messages/contacts/search, /api/tickets/search and
 * /api/tickets/metadata/search answer exactly as their GETs. This repo deploys on merge while
 * the backend ships on a tag, so a backend without the route falls back to the GET — on a 404
 * or 405 only; any other failure is a real one and surfaces.
 */
import { getErrorStatus } from '@/lib/errorMessages';

/** Per POST path: null until tried, then latched for this page load (a deploy reloads it). */
const supported = new Map<string, boolean>();

/** Test seam — module state, so a suite can start clean. */
export const resetSearchPostSupport = (): void => {
  supported.clear();
};

/**
 * `post` — the POST with the filters in its body; `get` — the same read as a GET, for a backend
 * without the route. Each written with its literal path at the caller, so every path stays one
 * the path check reads (servicePathsCarryApiPrefix). `route` keys the memo.
 */
export const postOrGet = async <T>(
  route: string,
  post: () => Promise<{ data: T }>,
  get: () => Promise<{ data: T }>
): Promise<T> => {
  if (supported.get(route) !== false) {
    try {
      const response = await post();
      supported.set(route, true);
      return response.data;
    } catch (err) {
      const status = getErrorStatus(err);
      if (status !== 404 && status !== 405) throw err;
      supported.set(route, false);
    }
  }
  return (await get()).data;
};
