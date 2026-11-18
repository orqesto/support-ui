import { apiClient } from '@/lib/api-client';
import {
  GMAIL_OAUTH_PAYLOAD_KEY,
  GMAIL_OAUTH_PENDING_CONFIG_KEY,
  isPendingRedirect,
  listenForGmailOAuthCode,
  oauthErrorText,
} from './gmailOAuthHandoff';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

export type GmailOAuthConfig = {
  hasConfig: boolean;
  redirectUri: string;
  /**
   * Whether Gmail OAuth is available to this org. Gmail OAuth (restricted scopes) is
   * Enterprise-only pre-CASA — the BE gates the connect flow and reports this so the FE
   * can hide the Add-Gmail card for regular clients (who use IMAP). Absent on older BE →
   * treat as available (the BE 403 is the real enforcement).
   */
  available?: boolean;
};

export type GmailOAuthInitResponse = {
  authUrl: string;
};

export type GmailOAuthCallbackRequest = {
  code: string;
  state: string;
  redirectUri: string;
  searchQuery?: string;
  maxResults?: number;
  pollingMaxPages?: number;
  bulkImportDays?: number;
  bulkImportMaxResults?: number;
  isKnowledgeBase?: boolean;
  /** Save a NEW source disabled so its message count can be checked before it syncs. */
  startPaused?: boolean;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  /** Gmail callback: this connect switched the knowledge base on but nothing is mined (no active plan). */
  kbMiningDeferred?: 'plan_inactive';
  /** Gmail callback: this was the mark-imported grant and the server switched the setting on. */
  markImportedGranted?: true;
};

export interface ConnectWithPopupConfig {
  searchQuery?: string;
  maxResults?: number;
  pollingMaxPages?: number;
  bulkImportDays?: number;
  bulkImportMaxResults?: number;
  isKnowledgeBase?: boolean;
  startPaused?: boolean;
  /**
   * The mark-imported switch on an existing Gmail source: ask Google only for the permission to
   * change messages; the server turns the setting on when it is given (support-service#1229).
   */
  grant?: MarkImportedGrant;
}

export type MarkImportedGrant = { sourceId: number; label?: string };

/** The CSRF state in Google's authorize URL; null when the URL does not parse or carries none. */
const oauthStateOf = (authUrl: string): string | null => {
  try {
    const state = new URL(authUrl).searchParams.get('state');
    // An empty state is no state.
    if (!state) return null;
    return state;
  } catch {
    return null;
  }
};

/**
 * Each pop-up flow gets its own window name: a shared name let a second flow from the same tab
 * (Reconnect, then Mark imported; a second mailbox card) take over the first flow's pop-up, and the
 * first then waited out its timeout with its card stuck saving.
 */
let popupFlowSeq = 0;
const nextPopupName = (): string => {
  popupFlowSeq += 1;
  return `gmail_oauth_${Date.now()}_${popupFlowSeq}`;
};

/** The readable reason of a refused request (the server's words), else the raw text. */
const failureText = (error: unknown): string => getApiErrorMessage(error) ?? String(error);

export const gmailOAuthService = {
  /**
   * Get OAuth configuration
   */
  getConfig: async (): Promise<ApiResponse<GmailOAuthConfig>> => {
    const response = await apiClient.get<{ success: boolean; data: GmailOAuthConfig }>(
      '/api/oauth/gmail/config'
    );
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Initiate OAuth flow
   */
  initiateOAuth: async (
    grant?: MarkImportedGrant
  ): Promise<ApiResponse<GmailOAuthInitResponse>> => {
    const response = await apiClient.post<{ success: boolean; data: GmailOAuthInitResponse }>(
      '/api/oauth/gmail/authorize',
      grant ? { grant: 'markImported', sourceId: grant.sourceId, label: grant.label ?? '' } : {}
    );
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Handle OAuth callback
   */
  handleCallback: async (
    request: GmailOAuthCallbackRequest
  ): Promise<ApiResponse<{ email: string; id: number }>> => {
    const response = await apiClient.post<{
      success: boolean;
      data: { email: string; id: number };
      message: string;
      kbMiningDeferred?: string;
      markImportedGranted?: boolean;
    }>('/api/oauth/gmail/callback', request);
    return {
      success: response.data.success,
      data: response.data.data,
      message: response.data.message,
      // The only value the backend sends; anything else is not guessed at.
      ...(response.data.kbMiningDeferred === 'plan_inactive'
        ? { kbMiningDeferred: 'plan_inactive' as const }
        : {}),
      ...(response.data.markImportedGranted === true ? { markImportedGranted: true as const } : {}),
    };
  },

  /**
   * Open OAuth popup and handle the flow
   */
  connectWithPopup: async (
    config: ConnectWithPopupConfig
  ): Promise<ApiResponse<{ email: string; id: number }>> =>
    new Promise((resolve) => {
      const {
        searchQuery,
        maxResults,
        pollingMaxPages,
        bulkImportDays,
        bulkImportMaxResults,
        isKnowledgeBase,
        startPaused,
        grant,
      } = config;
      // Open the popup synchronously while the user gesture is still active —
      // browsers block window.open() if it runs after awaits, even with valid intent.
      // We point it at about:blank, then navigate once we have the auth URL below.
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      // A pop-up inherits a copy of this tab's sessionStorage: a leftover redirect config (an
      // abandoned redirect, or one stored by the bundle before this one) must not make the pop-up's
      // callback page take the redirect path. A pop-up flow starting means no redirect is pending.
      sessionStorage.removeItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);
      sessionStorage.removeItem(GMAIL_OAUTH_PAYLOAD_KEY);
      const popup = window.open(
        'about:blank',
        nextPopupName(),
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        resolve({
          success: false,
          error: 'POPUP_BLOCKED',
          message: 'Browser blocked the OAuth popup.',
        });
        return;
      }

      const executeOAuth = async () => {
        try {
          // Get redirect URI from config
          const configResponse = await gmailOAuthService.getConfig();
          if (!configResponse.success || !configResponse.data) {
            popup.close();
            resolve({ success: false, error: 'Failed to get OAuth configuration' });
            return;
          }

          const redirectUri = configResponse.data.redirectUri;

          // Initiate OAuth flow
          const initResponse = await gmailOAuthService.initiateOAuth(grant);
          if (!initResponse.success || !initResponse.data) {
            popup.close();
            resolve({ success: false, error: 'Failed to initiate OAuth flow' });
            return;
          }

          const authUrl = initResponse.data.authUrl;
          if (!authUrl.startsWith('https://')) {
            popup.close();
            resolve({ success: false, error: 'Invalid OAuth URL received from server' });
            return;
          }

          // This flow's own CSRF state (in the Google URL): every delivery path takes only a code
          // carrying it — never a stale one, nor another Reconnect's. Without it no code can be
          // matched: fail now, visibly, instead of waiting out the timeout.
          const flowState = oauthStateOf(authUrl);
          if (!flowState) {
            popup.close();
            resolve({ success: false, error: 'Invalid OAuth URL received from server' });
            return;
          }

          // Navigate the already-open popup to Google's consent screen.
          popup.location.href = authUrl;

          // Guard against double-resolution from the delivery paths and the timeout.
          // Note: we deliberately do NOT poll `popup.closed` — Google's COOP headers isolate
          // the popup, making `popup.closed` return spurious `true` values that would falsely
          // resolve the flow before the code arrives. A hard timeout below is the backstop.
          let resolved = false;
          let dispatched = false;
          let stopListening: () => void = () => undefined;
          const messageHandler = (event: MessageEvent) => {
            // Verify origin for security
            if (event.origin !== window.location.origin) return;
            const eventData = event.data as
              | { type?: string; code?: string; state?: string; error?: string }
              | undefined;
            if (eventData?.type === 'GMAIL_OAUTH_SUCCESS' && eventData.code && eventData.state) {
              dispatchCode(eventData.code, eventData.state);
            } else if (
              eventData?.type === 'GMAIL_OAUTH_ERROR' &&
              eventData.state === flowState &&
              typeof eventData.error === 'string'
            ) {
              failFromPopup(eventData.error);
            }
          };
          const safeResolve = (result: Parameters<typeof resolve>[0]) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(authTimeout);
            window.removeEventListener('message', messageHandler);
            stopListening();
            resolve(result);
          };
          // The one delivery: the pop-up's postMessage (opener kept) and the BroadcastChannel (opener
          // severed by Google) both land here. Only THIS flow's state; once — the state is
          // single-use server-side, so a second POST would race and falsely report failure.
          const dispatchCode = (code: string, state: string) => {
            if (dispatched || resolved || state !== flowState) return;
            dispatched = true;
            // The pop-up closes itself (OAuthCallbackPage); opener-side popup.close() is
            // COOP-blocked under Google's cross-origin headers, so it is skipped.
            gmailOAuthService
              .handleCallback({
                code,
                state,
                redirectUri,
                searchQuery,
                maxResults,
                pollingMaxPages,
                bulkImportDays,
                bulkImportMaxResults,
                isKnowledgeBase,
                startPaused,
              })
              .then((callbackResponse) => safeResolve(callbackResponse))
              .catch((error) => safeResolve({ success: false, error: failureText(error) }));
          };

          // Google refused / the user declined in the pop-up: fail now, not after the timeout.
          const failFromPopup = (error: string) => {
            if (dispatched) return;
            safeResolve({ success: false, error: oauthErrorText(error) });
          };

          window.addEventListener('message', messageHandler);
          stopListening = listenForGmailOAuthCode(
            flowState,
            (handoff) => dispatchCode(handoff.code, handoff.state),
            failFromPopup
          );

          // Backstop: if the flow hasn't resolved within 5 minutes, give up.
          const authTimeout = setTimeout(
            () => {
              safeResolve({
                success: false,
                error: 'OAuth flow timed out. Please try again.',
              });
            },
            5 * 60 * 1000
          );
        } catch (error) {
          logger.error('OAuth error:', error);
          // A refused authorize (no permission, source gone) leaves the blank window open otherwise.
          popup.close();
          resolve({
            success: false,
            error: getApiErrorMessage(error) ?? 'An error occurred during OAuth flow',
          });
        }
      };

      executeOAuth().catch((error) => {
        logger.error('OAuth error:', error);
        resolve({ success: false, error: 'An error occurred during OAuth flow' });
      });
    }),

  /**
   * Fallback path when the popup is hard-blocked. Persists the in-flight config to
   * sessionStorage, then navigates the whole page to Google's consent screen. After
   * Google redirects back, OAuthCallbackPage stores the code+state and routes to
   * /settings/integrations, where consumePendingRedirectResult finishes the flow.
   */
  redirectToOAuth: async (
    config: ConnectWithPopupConfig
  ): Promise<ApiResponse<{ authUrl: string }>> => {
    const configResponse = await gmailOAuthService.getConfig();
    if (!configResponse.success || !configResponse.data) {
      return { success: false, error: 'Failed to get OAuth configuration' };
    }
    const initResponse = await gmailOAuthService.initiateOAuth(config.grant);
    if (!initResponse.success || !initResponse.data) {
      return { success: false, error: 'Failed to initiate OAuth flow' };
    }

    const authUrl = initResponse.data.authUrl;
    if (!authUrl.startsWith('https://')) {
      return { success: false, error: 'Invalid OAuth URL received from server' };
    }

    // The config only (never the state): its presence tells the callback page this tab is the
    // redirect flow (a pop-up flow clears these keys before it opens).
    sessionStorage.setItem(
      GMAIL_OAUTH_PENDING_CONFIG_KEY,
      JSON.stringify({ config, redirectUri: configResponse.data.redirectUri })
    );

    window.location.href = authUrl;
    return { success: true, data: { authUrl } };
  },

  /**
   * Synchronous check for whether a redirect-flow OAuth is waiting to be finished
   * on this mount (redirectToOAuth stashed a pending config before leaving for
   * Google, and we've now landed back). Lets the card show a "finishing…" loader
   * immediately instead of rendering the form while consumePendingRedirectResult
   * runs. Must be read BEFORE consumePendingRedirectResult, which clears the keys.
   */
  hasPendingRedirectResult: (): boolean => isPendingRedirect(),

  /**
   * Called on integrations page mount to finish a redirect-flow OAuth. Reads the
   * code+state OAuthCallbackPage stored and the config redirectToOAuth stashed,
   * then dispatches the BE callback. Returns null if no redirect-flow result is
   * pending.
   */
  consumePendingRedirectResult: async (): Promise<ApiResponse<{
    email: string;
    id: number;
  }> | null> => {
    const payloadRaw = sessionStorage.getItem(GMAIL_OAUTH_PAYLOAD_KEY);
    const configRaw = sessionStorage.getItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);
    if (!configRaw) return null;

    // Clear the redirect-flow keys as soon as a pending config is seen — even if
    // no code came back (user denied/abandoned at Google). Otherwise a stale
    // config lingers and a later POPUP flow (which inherits this sessionStorage)
    // would misdetect itself as a redirect flow.
    sessionStorage.removeItem(GMAIL_OAUTH_PAYLOAD_KEY);
    sessionStorage.removeItem(GMAIL_OAUTH_PENDING_CONFIG_KEY);
    if (!payloadRaw) return null;

    let payloadParsed: unknown;
    let pendingParsed: unknown;
    try {
      payloadParsed = JSON.parse(payloadRaw);
      pendingParsed = JSON.parse(configRaw);
    } catch (error) {
      logger.error('Failed to parse pending OAuth redirect state:', error);
      return { success: false, error: 'Corrupted OAuth redirect state' };
    }

    const payload =
      payloadParsed && typeof payloadParsed === 'object'
        ? (payloadParsed as { code?: string; state?: string })
        : null;
    const pending =
      pendingParsed && typeof pendingParsed === 'object'
        ? (pendingParsed as { config?: ConnectWithPopupConfig; redirectUri?: string })
        : null;

    if (!payload?.code || !payload?.state || !pending?.redirectUri) {
      return { success: false, error: 'Incomplete OAuth redirect state' };
    }

    const cfg: ConnectWithPopupConfig = pending.config ?? {};
    return gmailOAuthService.handleCallback({
      code: payload.code,
      state: payload.state,
      redirectUri: pending.redirectUri,
      searchQuery: cfg.searchQuery,
      maxResults: cfg.maxResults,
      pollingMaxPages: cfg.pollingMaxPages,
      bulkImportDays: cfg.bulkImportDays,
      bulkImportMaxResults: cfg.bulkImportMaxResults,
      isKnowledgeBase: cfg.isKnowledgeBase,
      startPaused: cfg.startPaused,
    });
  },
};
