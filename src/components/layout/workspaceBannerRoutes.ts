/**
 * Where the "You are editing <workspace>" banner stays hidden (owner, 2026-09-22: "settings
 * screens only").
 *
 * ⛔ A DENYLIST of the daily work surfaces, not an allowlist of settings screens. The banner exists
 * because 52 screens write per-workspace rows, and an allowlist is the list someone forgets to
 * extend: the next screen written would ship with no banner. Here a new screen gets the banner
 * until someone decides otherwise. Hidden only where the work itself shows whose data it is
 * (the queues, the dashboard) and on read-only reports.
 */
const HIDDEN_PREFIXES = [
  '/dashboard',
  '/messages',
  '/tickets',
  '/needs-routing',
  '/statistics',
  '/usage-stats',
];

export const showsWorkspaceBanner = (pathname: string): boolean =>
  pathname !== '/' &&
  !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
