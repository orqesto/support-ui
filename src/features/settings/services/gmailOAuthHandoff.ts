/**
 * The Gmail OAuth pop-up hands its code to the app window. Google's pages sever `window.opener`
 * (COOP), so postMessage cannot reach the app and the per-tab sessionStorage fallback is invisible
 * to it: the flow timed out ("OAuth flow timed out"). localStorage is shared by same-origin tabs —
 * the callback page writes `{code, state}` here, the app window takes the one carrying ITS state
 * and removes it at once (the BE consumes the state on first use; a code is single-use).
 */
export const GMAIL_OAUTH_HANDOFF_KEY = 'gmail_oauth_handoff';

/** The hand-off for this flow's `state`, removed as it is read; null when absent or another's. */
export const takeGmailOAuthHandoff = (
  expectedState: string | null
): { code: string; state: string } | null => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw || !expectedState) return null;
  let parsed: { code?: unknown; state?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw) as { code?: unknown; state?: unknown };
  } catch {
    localStorage.removeItem(GMAIL_OAUTH_HANDOFF_KEY);
    return null;
  }
  if (typeof parsed?.code !== 'string' || parsed.state !== expectedState) return null;
  localStorage.removeItem(GMAIL_OAUTH_HANDOFF_KEY);
  return { code: parsed.code, state: parsed.state };
};
