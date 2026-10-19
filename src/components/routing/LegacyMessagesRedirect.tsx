import { Navigate, useLocation } from 'react-router-dom';

/**
 * The inbox moved from `/messages` to `/threads` (2026-10-19 rename: a client conversation is a
 * "thread" in the UI). Old URLs live on in bookmarks and in links already sent by email, Slack and
 * notifications, so `/messages`, `/messages/:id` and anything below redirect to the same place under
 * `/threads`, keeping the id, the query string (`?id=…`, filters) and the hash.
 */
export const threadsPathFor = (pathname: string): string =>
  pathname.replace(/^\/messages(?=\/|$)/, '/threads');

export function LegacyMessagesRedirect() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={{ pathname: threadsPathFor(location.pathname), search: location.search, hash: location.hash }}
      state={location.state as unknown}
    />
  );
}
