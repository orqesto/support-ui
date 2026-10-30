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
import { isRouteAbsent } from '@/lib/apiError';
import { getErrorStatus } from '@/lib/errorMessages';

/**
 * The backend has no such route: Express's own 404 page (not a JSON "not found" from a route that
 * exists — `Workspace not found` is one) or a 405. Only this falls back to the GET; a 404 from a
 * route that exists latched every later search of the page onto the GET, back in the request line
 * (review of #774).
 */
export const routeIsMissing = (err: unknown): boolean =>
  isRouteAbsent(err) || getErrorStatus(err) === 405;

/** Per POST path: null until tried, then latched for this page load (a deploy reloads it). */
const supported = new Map<string, boolean>();
/**
 * The first POST of a path while its support is unknown. Calls made meanwhile (the board's
 * columns, the tickets list and its counts — sent together) wait for it instead of each trying
 * the POST: against a backend without the route every one of them paid a 404 and then the GET.
 */
const probing = new Map<string, Promise<unknown>>();

/** Test seam — module state, so a suite can start clean. */
export const resetSearchPostSupport = (): void => {
  supported.clear();
  probing.clear();
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
  const pending = probing.get(route);
  if (pending) await pending.catch(() => undefined);
  if (supported.get(route) !== false) {
    const attempt = post();
    const probe = !supported.has(route);
    if (probe) probing.set(route, attempt);
    try {
      const response = await attempt;
      supported.set(route, true);
      return response.data;
    } catch (err) {
      if (!routeIsMissing(err)) throw err;
      supported.set(route, false);
    } finally {
      if (probe && probing.get(route) === attempt) probing.delete(route);
    }
  }
  return (await get()).data;
};
