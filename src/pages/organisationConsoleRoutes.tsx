import { Navigate, useLocation } from 'react-router-dom';

/**
 * The organisation admin console lives at `/console/organisation/:allianceId` (the UI calls an
 * alliance an "organisation"; code, API and the param name keep `alliance`). The console used to
 * live at `/console/alliance/:allianceId`, and bookmarks, shared links and `?from=` values still
 * carry that address — so the old prefix redirects, keeping the id, any section sub-path, the
 * query string and the hash.
 */
export const ORGANISATION_CONSOLE_PREFIX = '/console/organisation';
export const LEGACY_ALLIANCE_CONSOLE_PREFIX = '/console/alliance';
/** Route patterns, mounted in App.tsx. */
export const ROUTE = `${ORGANISATION_CONSOLE_PREFIX}/:allianceId`;
export const LEGACY_ROUTE = `${LEGACY_ALLIANCE_CONSOLE_PREFIX}/:allianceId/*`;

export const organisationConsolePath = (allianceId: number | string | undefined): string =>
  `${ORGANISATION_CONSOLE_PREFIX}/${allianceId}`;

/** True for a console address of either shape (new or legacy), e.g. a `?from=` back link. */
export const isOrganisationConsolePath = (path: string): boolean =>
  path.startsWith(`${ORGANISATION_CONSOLE_PREFIX}/`) ||
  path.startsWith(`${LEGACY_ALLIANCE_CONSOLE_PREFIX}/`);

/** Mounted at `/console/alliance/:allianceId/*`. */
export const LegacyAllianceConsoleRedirect = () => {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.slice(LEGACY_ALLIANCE_CONSOLE_PREFIX.length);
  return <Navigate to={`${ORGANISATION_CONSOLE_PREFIX}${rest}${search}${hash}`} replace />;
};
