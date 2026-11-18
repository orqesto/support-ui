/**
 * The Gmail OAuth pop-up hands its code to the app window. Google's pages sever `window.opener`
 * (COOP), so postMessage cannot reach the app, and sessionStorage is per tab: the flow timed out
 * ("OAuth flow timed out"). A BroadcastChannel reaches every same-origin tab without storing the
 * code anywhere; the app window accepts only the message carrying ITS flow's `state` (the BE
 * consumes the state on first use; a code is single-use) and acknowledges it, so the pop-up knows a
 * window took the code before it closes.
 */
export const GMAIL_OAUTH_CHANNEL = 'gmail_oauth';
/** sessionStorage key of the full-page redirect flow's pending config (one name for every reader). */
export const GMAIL_OAUTH_PENDING_CONFIG_KEY = 'gmail_oauth_pending_config';
/**
 * sessionStorage key connectWithPopup sets in the POP-UP's own copy before it navigates: the
 * callback page there is a pop-up, whatever else its copy holds and whether or not Google severed
 * the opener.
 */
export const GMAIL_OAUTH_POPUP_KEY = 'gmail_oauth_popup';
/** sessionStorage key the callback page hands the redirect flow's code+state over in. */
export const GMAIL_OAUTH_PAYLOAD_KEY = 'gmail_oauth_payload';

export type GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS'; code: string; state: string };
/** Google refused or the user declined (`error=` on the callback): the flow fails at once. */
export type GmailOAuthFailure = { type: 'GMAIL_OAUTH_ERROR'; state: string; error: string };
type GmailOAuthAck = { type: 'GMAIL_OAUTH_ACK'; state: string };

/** The words for Google's `error=` codes — the callback page and the app window show the same. */
const OAUTH_ERROR_TEXT: Record<string, string> = {
  access_denied: 'Access was denied. Please try again.',
  invalid_request: 'The authorization request was invalid.',
  invalid_client: 'OAuth client configuration error.',
  server_error: 'The authorization server encountered an error.',
  temporarily_unavailable: 'The service is temporarily unavailable. Please try again.',
};
export const oauthErrorText = (error: string): string =>
  OAUTH_ERROR_TEXT[error] ?? 'Authorization failed. Please try again.';

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
 * Callback page: Google sent `error=` for this flow's state — tell the app window now, so it fails
 * the flow instead of waiting out its timeout. No channel: the opener's postMessage is the only way.
 */
export const announceGmailOAuthError = (state: string, error: string): void => {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  const message: GmailOAuthFailure = { type: 'GMAIL_OAUTH_ERROR', state, error };
  channel.postMessage(message);
  channel.close();
};

/**
 * App window: listen on the channel for codes and errors. Every message is handed on — the caller's
 * flow is THE one place that checks the state (its own flow only) and acknowledges, once, on this
 * same channel (`acknowledge`), whichever path delivered the code. No channel: nothing is listened
 * for and nothing is acknowledged.
 */
export const listenForGmailOAuthCode = (
  onCode: (handoff: GmailOAuthHandoff) => void,
  onError: (failure: GmailOAuthFailure) => void
): { stop: () => void; acknowledge: (state: string) => void } => {
  if (typeof BroadcastChannel === 'undefined') {
    return { stop: () => undefined, acknowledge: () => undefined };
  }
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<GmailOAuthHandoff> | Partial<GmailOAuthFailure> | null;
    if (typeof data?.state !== 'string') return;
    if (data.type === 'GMAIL_OAUTH_ERROR' && 'error' in data && typeof data.error === 'string') {
      onError({ type: 'GMAIL_OAUTH_ERROR', state: data.state, error: data.error });
    } else if (
      data.type === 'GMAIL_OAUTH_SUCCESS' &&
      'code' in data &&
      typeof data.code === 'string'
    ) {
      onCode({ type: 'GMAIL_OAUTH_SUCCESS', code: data.code, state: data.state });
    }
  };
  return {
    stop: () => channel.close(),
    acknowledge: (state: string) => {
      const ack: GmailOAuthAck = { type: 'GMAIL_OAUTH_ACK', state };
      channel.postMessage(ack);
    },
  };
};

/**
 * Callback page: is THIS tab the full-page redirect flow? redirectToOAuth stores a pending config
 * (never the state, nor anything derived from it) before it leaves for Google. Not a redirect:
 *  - a pop-up this bundle opened (its own copy is marked GMAIL_OAUTH_POPUP_KEY and holds no config);
 *  - a window with a live opener — a redirect tab has none; this covers a pop-up opened by a tab
 *    still on the bundle before the mark, whose copy may hold a stale config.
 * The backend checks the state itself (single use) when the code is exchanged.
 */
export const isPendingRedirect = (hasLiveOpener: boolean): boolean =>
  !hasLiveOpener &&
  sessionStorage.getItem(GMAIL_OAUTH_POPUP_KEY) === null &&
  sessionStorage.getItem(GMAIL_OAUTH_PENDING_CONFIG_KEY) !== null;
