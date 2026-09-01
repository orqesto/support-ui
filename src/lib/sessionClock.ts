/**
 * What the app knows about how long an access token lives, and when one was last minted.
 *
 * Deliberately dependency-free. `api-client` records renewals here and `sessionRenewal`
 * reads them; if either imported the other directly the pair would be a cycle, and the
 * renewal scheduler already has to import `ensureFreshSession` from the api-client.
 *
 * The lifetime is LEARNED, never assumed: the refresh endpoint answers with the server's
 * own `expiresIn` (see the BE's sessionController), which is the only value that is right
 * for every deployment — prod, a client instance and a self-hosted operator who set
 * ACCESS_TOKEN_TTL to something else entirely all differ. It is remembered across reloads
 * so a returning tab schedules from the real number rather than the fallback.
 */

/** Only used before the server has told us anything — one cycle, then it self-corrects. */
export const FALLBACK_ACCESS_TTL_MS = 10 * 60 * 1000;

const TTL_KEY = 'session.accessTtlMs';
const ISSUED_KEY = 'session.accessIssuedAt';
/** Ignore anything outside this range: a corrupt value must not disable renewal or hot-loop it. */
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `15m`, `8h`, `7d`, `90s` → milliseconds. Mirrors the BE's own env validation
 * (`^\d+[dhms]$` in config/index.ts), so a spec it accepts is a spec we can read.
 */
export const parseDuration = (spec: unknown): number | null => {
  if (typeof spec !== 'string') return null;
  const match = /^(\d+)([dhms])$/.exec(spec.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] ?? 0;
  const ms = value * unit;
  return ms >= MIN_TTL_MS && ms <= MAX_TTL_MS ? ms : null;
};

let learnedTtlMs: number | null = null;

const readStoredTtl = (): number | null => {
  try {
    const raw = window.localStorage.getItem(TTL_KEY);
    const ms = raw === null ? NaN : Number(raw);
    return Number.isFinite(ms) && ms >= MIN_TTL_MS && ms <= MAX_TTL_MS ? ms : null;
  } catch {
    // Private mode / storage disabled — the fallback is still a working schedule.
    return null;
  }
};

/** The access-token lifetime to schedule against. */
export const getAccessTtlMs = (): number =>
  learnedTtlMs ?? readStoredTtl() ?? FALLBACK_ACCESS_TTL_MS;

let issuedAt: number | null = null;

/**
 * When the access token now in the cookie jar was minted.
 *
 * Persisted because a RELOAD is the case that needs it: the tab comes back authenticated,
 * holding a cookie of unknown age. Scheduling a full lifetime from page-load would let a
 * token that was already fourteen minutes old die first — and the 401 burst this whole
 * mechanism exists to remove would survive every refresh of the page.
 */
export const getAccessIssuedAt = (): number | null => {
  if (issuedAt !== null) return issuedAt;
  try {
    const raw = window.localStorage.getItem(ISSUED_KEY);
    const at = raw === null ? NaN : Number(raw);
    // A clock that has been moved backwards would otherwise hand out a future issue time.
    return Number.isFinite(at) && at <= Date.now() ? at : null;
  } catch {
    return null;
  }
};

const stampIssuedAt = (): void => {
  issuedAt = Date.now();
  try {
    window.localStorage.setItem(ISSUED_KEY, String(issuedAt));
  } catch {
    // Same as above: this tab still holds the value in memory.
  }
};

/**
 * A fresh access token exists that this module did not mint — a sign-in, typically.
 *
 * `expiresIn` comes from the sign-in response (`data.auth.expiresIn`, written by the BE's
 * `establishSession`), so the very first schedule of a session is exact instead of using the
 * conservative fallback until the first renewal.
 */
export const noteSessionIssued = (expiresIn?: unknown): void => {
  stampIssuedAt();
  rememberTtl(expiresIn);
  listeners.forEach((listener) => listener());
};

const rememberTtl = (expiresIn: unknown): void => {
  const ms = parseDuration(expiresIn);
  if (ms === null) return;
  learnedTtlMs = ms;
  try {
    window.localStorage.setItem(TTL_KEY, String(ms));
  } catch {
    // Nothing to do — `learnedTtlMs` still serves this tab for as long as it lives.
  }
};

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notified whenever a fresh access token has just been issued, by whichever path issued it. */
export const onSessionRenewed = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Record that the session was just renewed.
 *
 * Called for BOTH renewal paths — the scheduled one and the reactive 401 — because the
 * schedule has to move with whichever fired. `expiresIn` is absent on the 409 path (another
 * tab rotated first and holds the response), and that is fine: the cookies are just as fresh,
 * we simply learn nothing new about the lifetime.
 */
export const noteSessionRenewed = (expiresIn?: unknown): void => {
  stampIssuedAt();
  rememberTtl(expiresIn);
  listeners.forEach((listener) => listener());
};

/** Forget the learned lifetime. Sign-out only — a new session may belong to another server. */
export const clearSessionClock = (): void => {
  learnedTtlMs = null;
  issuedAt = null;
  try {
    window.localStorage.removeItem(TTL_KEY);
    window.localStorage.removeItem(ISSUED_KEY);
  } catch {
    // Ignored for the same reason as above.
  }
};
