/**
 * The Gmail OAuth pop-up hands its code to the app window. Google's pages sever `window.opener`
 * (COOP), so postMessage cannot reach the app, and the per-tab sessionStorage fallback is invisible
 * to it: the flow timed out ("OAuth flow timed out"). A BroadcastChannel reaches every same-origin
 * tab without storing the code anywhere; the app window accepts only the message carrying ITS
 * flow's `state` (the BE consumes the state on first use; a code is single-use).
 */
export const GMAIL_OAUTH_CHANNEL = 'gmail_oauth';

export type GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS'; code: string; state: string };

/** Callback page: announce the code to the app window. False when the browser has no channel. */
export const announceGmailOAuthCode = (code: string, state: string): boolean => {
  if (typeof BroadcastChannel === 'undefined') return false;
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  const message: GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS', code, state };
  channel.postMessage(message);
  channel.close();
  return true;
};

/** App window: listen for THIS flow's code; returns the stop function. */
export const listenForGmailOAuthCode = (
  expectedState: string | null,
  onCode: (handoff: GmailOAuthHandoff) => void
): (() => void) => {
  if (typeof BroadcastChannel === 'undefined' || !expectedState) return () => undefined;
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<GmailOAuthHandoff> | null;
    if (
      data?.type === 'GMAIL_OAUTH_SUCCESS' &&
      typeof data.code === 'string' &&
      data.state === expectedState
    ) {
      onCode({ type: 'GMAIL_OAUTH_SUCCESS', code: data.code, state: data.state });
    }
  };
  return () => channel.close();
};
