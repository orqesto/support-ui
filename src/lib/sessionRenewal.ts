/**
 * Renew the session BEFORE the access token dies, instead of after something trips over it.
 *
 * Until this existed, renewal was purely reactive: `ensureFreshSession` ran only from the
 * 401 handler in api-client or a rejected socket handshake. With a 15-minute access token
 * and four background pollers (learning notifications, learning suggestions, notification
 * counts, ticket metadata), that guaranteed a burst of 401s in every console every fifteen
 * minutes, for as long as a tab stayed open — each one a request spent to discover something
 * the clock already knew. The reactive path REMAINS the backstop: this is a way to avoid the
 * 401, not a replacement for handling it.
 *
 * Two properties this has to have, both learned from the reactive path's comments:
 * · Single-flight — renewal goes through `ensureFreshSession`, so a scheduled renewal and a
 *   401 arriving in the same instant share one rotation. Two rotations of one refresh token
 *   read as REUSE at the backend and revoke the whole family.
 * · Silent failure — if the renewal is refused we do NOT sign the user out here. The 401 path
 *   owns that decision, because it knows a real request just failed; a background timer
 *   bouncing someone to /login mid-sentence is exactly the outcome refresh tokens exist to
 *   prevent.
 */

import { ensureFreshSession } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  clearSessionClock,
  getAccessIssuedAt,
  getAccessTtlMs,
  noteSessionIssued,
  onSessionRenewed,
} from '@/lib/sessionClock';
import { useAuthStore } from '@/stores/authStore';

/** Renew this long before expiry, so a slow round-trip still lands inside the old token. */
const SKEW_MS = 60 * 1000;
/** Never schedule tighter than this, whatever the server says the lifetime is. */
const MIN_DELAY_MS = 30 * 1000;
/**
 * Spread across tabs. Every open tab holds the same cookies and the same clock, so without
 * jitter they all wake in the same instant and rotate the same token; the backend answers 409
 * to the losers (handled as success), but there is no reason to manufacture the race.
 */
const JITTER = 0.1;

let timer: ReturnType<typeof setTimeout> | null = null;
/** When the current timer is meant to fire — used to catch up after a tab was suspended. */
let dueAt: number | null = null;
let started = false;
let teardown: (() => void)[] = [];

const cancel = (): void => {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  dueAt = null;
};

const renewNow = (): void => {
  cancel();
  void ensureFreshSession()
    .then(() => {
      // `noteSessionRenewed` fires from the api-client, which reschedules us. Nothing to do.
    })
    .catch((err: unknown) => {
      // Deliberately terminal for the SCHEDULE only: stop renewing on a timer, let the next
      // real request's 401 decide whether the session is actually over. See the header.
      logger.warn('Scheduled session renewal was refused; falling back to renew-on-401', err);
    });
};

/**
 * Schedule the next renewal from the current access-token lifetime.
 *
 * Called on sign-in, after every renewal (whichever path performed it) and at start-up, so
 * "when does the token die" is answered by one clock rather than by each caller's memory.
 */
const schedule = (): void => {
  cancel();
  if (!useAuthStore.getState().isAuthenticated) return;

  const ttl = getAccessTtlMs();
  const jittered = SKEW_MS * (1 + (Math.random() * 2 - 1) * JITTER);
  // Age the schedule from when the token was ISSUED, not from now. After a reload those are
  // minutes apart, and the difference is the whole point: a page refreshed at minute fourteen
  // of a fifteen-minute token must renew in one minute, not in fifteen.
  const expiresAt = (getAccessIssuedAt() ?? Date.now()) + ttl;
  const target = expiresAt - jittered;
  const overdue = target <= Date.now();

  // Overdue cannot loop: a renewal stamps a new issue time, and a refused one stops the
  // schedule outright rather than retrying.
  const delay = overdue ? 0 : Math.max(MIN_DELAY_MS, target - Date.now());

  dueAt = Date.now() + delay;
  timer = setTimeout(renewNow, delay);
};

/**
 * A backgrounded tab has its timers throttled — Chrome allows roughly one wake per minute,
 * and a machine that slept does not run them at all. So on return to the foreground, renew
 * immediately if the moment we picked has already passed, rather than waiting for a timer
 * that the browser was never going to honour on time.
 */
const onVisibilityChange = (): void => {
  if (document.visibilityState !== 'visible') return;
  if (!useAuthStore.getState().isAuthenticated) return;
  if (dueAt !== null && Date.now() >= dueAt) renewNow();
};

/**
 * Wire the scheduler to the session lifecycle. Idempotent — safe under StrictMode's double
 * effect and HMR.
 */
export const startSessionRenewal = (): void => {
  if (started) return;
  started = true;

  teardown = [
    onSessionRenewed(schedule),
    useAuthStore.subscribe((state, previous) => {
      if (state.isAuthenticated === previous.isAuthenticated) return;
      if (state.isAuthenticated) {
        // Signing in mints a token right now; without stamping it, a stale issue time from
        // the previous session would make the first schedule fire immediately.
        noteSessionIssued();
        schedule();
      } else {
        // Sign-out: stop renewing and forget the lifetime — the next session may be issued by
        // a different deployment with a different ACCESS_TOKEN_TTL.
        cancel();
        clearSessionClock();
      }
    }),
  ];

  document.addEventListener('visibilitychange', onVisibilityChange);
  teardown.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

  // A reload lands here already authenticated, with cookies of unknown age. Schedule from the
  // remembered lifetime: worst case the token dies first and the 401 path renews it, which is
  // exactly today's behaviour.
  schedule();
};

/** Test seam: unwind everything `startSessionRenewal` wired up. */
export const stopSessionRenewal = (): void => {
  cancel();
  teardown.forEach((undo) => undo());
  teardown = [];
  started = false;
};

/** Test seam: when the next renewal is due, or null when nothing is scheduled. */
export const nextRenewalAt = (): number | null => dueAt;
