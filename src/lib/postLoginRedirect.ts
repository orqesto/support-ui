/**
 * Where to go after signing in. A ticket link opened while signed out (a phone, an expired
 * session) used to land on /login with the address dropped, and every login path then went to
 * /dashboard — the link "failed to open" (2026-11). The asked-for address now rides along as
 * `/login?next=<path>` and every login path returns there.
 *
 * It travels in the URL, not sessionStorage: the 401 handler in api-client clears sessionStorage
 * on its way to /login. SSO leaves the site, so the SSO buttons park it in sessionStorage just
 * before the jump (after any clear) and the SSO callback takes it back.
 *
 * Only a same-site path is accepted (`/x`, never `//host` or `/\host`), so `next` can never send
 * a user to another site.
 */

const DEFAULT_AFTER_LOGIN = '/dashboard';
const SSO_NEXT_KEY = 'odly:post-login-next';
// Pages that are not worth returning to: the auth pages themselves and the default landing.
const NOT_WORTH_RETURNING = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

type PathLike = { pathname: string; search?: string; hash?: string };

/** A same-site path to return to, or null when the value is missing or unsafe. */
export const safeNextPath = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  const pathname = raw.split(/[?#]/)[0] ?? '';
  if (NOT_WORTH_RETURNING.includes(pathname)) return null;
  return raw;
};

/** The login URL for a signed-out visitor at `where`, carrying where to come back to. */
export const loginPathFor = (where: PathLike): string => {
  const next = safeNextPath(`${where.pathname}${where.search ?? ''}${where.hash ?? ''}`);
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
};

/** Where a just-signed-in user goes, given the login page's query string. */
export const afterLoginPath = (search: string): string =>
  safeNextPath(new URLSearchParams(search).get('next')) ?? DEFAULT_AFTER_LOGIN;

/** Before leaving for SSO: keep the return address across the identity provider round trip. */
export const rememberNextForSso = (search: string): void => {
  const next = safeNextPath(new URLSearchParams(search).get('next'));
  try {
    if (next) sessionStorage.setItem(SSO_NEXT_KEY, next);
    else sessionStorage.removeItem(SSO_NEXT_KEY);
  } catch {
    // Storage blocked (private mode): SSO still signs in, it just lands on the dashboard.
  }
};

/** After SSO: where to go (read once, then forgotten). */
export const takeSsoNextPath = (): string => {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SSO_NEXT_KEY);
    sessionStorage.removeItem(SSO_NEXT_KEY);
  } catch {
    // Storage blocked: fall back to the default below.
  }
  return safeNextPath(raw) ?? DEFAULT_AFTER_LOGIN;
};
