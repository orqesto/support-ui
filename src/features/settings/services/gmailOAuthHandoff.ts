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
/** sessionStorage key the callback page hands the redirect flow's code+state over in. */
export const GMAIL_OAUTH_PAYLOAD_KEY = 'gmail_oauth_payload';

export type GmailOAuthHandoff = { type: 'GMAIL_OAUTH_SUCCESS'; code: string; state: string };
/** Google refused or the user declined (`error=` on the callback): the flow fails at once. */
export type GmailOAuthFailure = { type: 'GMAIL_OAUTH_ERROR'; state: string; error: string };
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
 * App window: listen for THIS flow's code (acknowledged to the pop-up on receipt) or its error;
 * returns the stop function. No state (or no channel): nothing is listened for — the caller fails
 * the flow.
 */
export const listenForGmailOAuthCode = (
  expectedState: string | null,
  onCode: (handoff: GmailOAuthHandoff) => void,
  onError: (error: string) => void = () => undefined
): (() => void) => {
  if (typeof BroadcastChannel === 'undefined' || !expectedState) return () => undefined;
  const channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<GmailOAuthHandoff> | Partial<GmailOAuthFailure> | null;
    if (
      data?.type === 'GMAIL_OAUTH_ERROR' &&
      data.state === expectedState &&
      typeof data.error === 'string'
    ) {
      onError(data.error);
      return;
    }
    if (
      data?.type === 'GMAIL_OAUTH_SUCCESS' &&
      'code' in data &&
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
 * Hex SHA-256 of a flow's `state`. The redirect flow stores only this fingerprint with its pending
 * config, never the state itself (no OAuth secret in clear text in storage).
 */
export const oauthStateFingerprint = async (state: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The pending config's state fingerprint: null when no config is pending; `{ stateHash: null }` when
 * a config is there without one (stored by the bundle before the fingerprint).
 */
export const pendingRedirectStateHash = (): { stateHash: string | null } | null => {
  const raw = sessionStorage.getItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);
  if (!raw) return null;
  try {
    const stored = (JSON.parse(raw) as { stateHash?: unknown } | null)?.stateHash;
    return { stateHash: typeof stored === 'string' && stored ? stored : null };
  } catch {
    return { stateHash: null };
  }
};

/**
 * Callback page: did THIS tab start the full-page redirect flow for `state`? The redirect flow
 * stores its state's fingerprint with the pending config (redirectToOAuth). A pop-up inherits a COPY
 * of the opener tab's sessionStorage, so a leftover config with another fingerprint is not this
 * flow. A config with NO fingerprint was stored by the bundle before it (a redirect begun before the
 * deploy): it is this flow only when no opener is there — a pop-up whose opener survived is not.
 */
export const isPendingRedirectFor = async (state: string, hasOpener: boolean): Promise<boolean> => {
  const pending = pendingRedirectStateHash();
  if (pending === null) return false;
  if (pending.stateHash === null) return !hasOpener;
  return pending.stateHash === (await oauthStateFingerprint(state));
};
