/**
 * The Gmail OAuth pop-up hands its code to the app window. Google's pages sever `window.opener`
 * (COOP), so postMessage cannot reach the app, and sessionStorage is per tab: the flow timed out
 * ("OAuth flow timed out"). A BroadcastChannel reaches every same-origin tab without storing the
 * code anywhere; the app window accepts only the message carrying ITS flow's `state` (the BE
 * consumes the state on first use; a code is single-use) and acknowledges it, so the pop-up knows a
 * window took the code before it closes.
 */
export const GMAIL_OAUTH_CHANNEL = 'gmail_oauth';

export type GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS'; code: string; state: string };
type GmailOAuthAck = { type: 'GMAIL_OAUTH_ACK'; state: string };

/**
 * Callback page: announce the code and wait for the app window's acknowledgement of THIS state.
 * Returns the stop function, or null when the browser has no channel.
 */
export const announceGmailOAuthCode = (
  code: string,
  state: string,
  onAck: () => void
): (() => void) | null => {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<GmailOAuthAck> | null;
    if (data?.type === 'GMAIL_OAUTH_ACK' && data.state === state) onAck();
  };
  const message: GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS', code, state };
  channel.postMessage(message);
  return () => channel.close();
};

/**
 * App window: listen for THIS flow's code (acknowledged to the pop-up on receipt); returns the stop
 * function. No state (or no channel): nothing is listened for — the caller fails the flow.
 */
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
      const ack: GmailOAuthAck = { type: 'GMAIL_OAUTH_ACK', state: expectedState };
      channel.postMessage(ack);
      onCode({ type: 'GMAIL_OAUTH_SUCCESS', code: data.code, state: data.state });
    }
  };
  return () => channel.close();
};

/**
 * Callback page: did THIS tab start the full-page redirect flow for `state`? The redirect flow
 * stores its state with the pending config (redirectToOAuth). A pop-up inherits a COPY of the
 * opener tab's sessionStorage, so a leftover config (another or no state) is not this flow.
 */
export const isPendingRedirectFor = (state: string): boolean => {
  const raw = sessionStorage.getItem('gmail_oauth_pending_config');
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { state?: unknown } | null;
    return parsed?.state === state;
  } catch {
    return false;
  }
};
