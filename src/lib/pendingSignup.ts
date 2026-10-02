/**
 * The check-inbox screen must survive a reload: on a phone, switching to the mail app often
 * discards the tab, and coming back to an empty form would lose the only place to correct a
 * mistyped address. Per tab (sessionStorage), and only as long as the same-browser cookie it
 * relies on lives (24 h from signup or the last resend/correction). It is forgotten when the
 * waiting screen stops meaning anything: verified (the verified screen, or verifying this signup
 * in this tab), or nothing left to continue (signup gone, cookie gone, a newer signup took over —
 * the end screen), or "Start a different sign-up".
 */
export const PENDING_SIGNUP_KEY = 'odly.pendingSignup';
const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingSignup = {
  email: string;
  mailLeft: boolean;
  removedAfterDays: number | null;
  workspaceName: string;
  renewedAt: number;
};

export const readPendingSignup = (): PendingSignup | null => {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (typeof parsed.email !== 'string' || typeof parsed.renewedAt !== 'number') return null;
    if (Date.now() - parsed.renewedAt > PENDING_SIGNUP_TTL_MS) return null;
    return {
      email: parsed.email,
      mailLeft: parsed.mailLeft !== false,
      removedAfterDays:
        typeof parsed.removedAfterDays === 'number' ? parsed.removedAfterDays : null,
      workspaceName: typeof parsed.workspaceName === 'string' ? parsed.workspaceName : '',
      renewedAt: parsed.renewedAt,
    };
  } catch {
    return null; // storage blocked or corrupt: the screen simply does not survive a reload
  }
};

export const writePendingSignup = (value: PendingSignup | null) => {
  try {
    if (value) window.sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Best effort only.
  }
};
