/**
 * Where a self-serve signup came from, sent once with POST /api/auth/signup and stored on the
 * new workspace.
 *
 * The marketing site (odly.ai) records the first visit in a first-party cookie `odly_src` on
 * `.odly.ai`, so this app (hub.odly.ai) can read it. The keys are a contract with the landing
 * (`lib/attribution.ts` there) and the backend's allow-list: rename one and the source silently
 * stops arriving.
 *
 * When there is no cookie (blocked cookies, a link straight to the app), the campaign
 * parameters on this page's own URL are used instead: the landing forwards `utm_*` and click ids
 * onto its signup links.
 *
 * Best-effort only: anything malformed is dropped, never thrown — signup must not fail over it.
 */

export const SIGNUP_SOURCE_COOKIE = 'odly_src';

const URL_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'li_fat_id',
] as const;

const COOKIE_ONLY_KEYS = ['landing_page', 'referrer', 'first_seen'] as const;

type SourceKey = (typeof URL_KEYS)[number] | (typeof COOKIE_ONLY_KEYS)[number];
export type SignupSource = Partial<Record<SourceKey, string>>;

const ALLOWED: readonly SourceKey[] = [...URL_KEYS, ...COOKIE_ONLY_KEYS];
const MAX_LENGTH = 200;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_LENGTH) : undefined;
}

function fromCookie(cookieHeader: string): SignupSource | null {
  const raw = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIGNUP_SOURCE_COOKIE}=`))
    ?.slice(SIGNUP_SOURCE_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const out: SignupSource = {};
    for (const key of ALLOWED) {
      const value = clean(record[key]);
      if (value) out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

function fromUrl(search: string): SignupSource {
  const params = new URLSearchParams(search);
  const out: SignupSource = {};
  for (const key of URL_KEYS) {
    const value = clean(params.get(key));
    if (value) out[key] = value;
  }
  return out;
}

/** The first-touch cookie when present, else this URL's campaign parameters; undefined if neither. */
export function readSignupSource(cookieHeader: string, search: string): SignupSource | undefined {
  const source = fromCookie(cookieHeader) ?? fromUrl(search);
  return Object.keys(source).length > 0 ? source : undefined;
}

/** Browser wrapper: reads document.cookie and the current URL, never throws. */
export function currentSignupSource(): SignupSource | undefined {
  try {
    return readSignupSource(document.cookie, window.location.search);
  } catch {
    return undefined;
  }
}
