import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export type GmailOAuthConfig = {
  hasConfig: boolean;
  redirectUri: string;
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
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export interface ConnectWithPopupConfig {
  searchQuery?: string;
  maxResults?: number;
  pollingMaxPages?: number;
  bulkImportDays?: number;
  bulkImportMaxResults?: number;
  isKnowledgeBase?: boolean;
}

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
  initiateOAuth: async (): Promise<ApiResponse<GmailOAuthInitResponse>> => {
    const response = await apiClient.post<{ success: boolean; data: GmailOAuthInitResponse }>(
      '/api/oauth/gmail/authorize',
      {}
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
    }>('/api/oauth/gmail/callback', request);
    return {
      success: response.data.success,
      data: response.data.data,
      message: response.data.message,
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
      } = config;
      // Open the popup synchronously while the user gesture is still active —
      // browsers block window.open() if it runs after awaits, even with valid intent.
      // We point it at about:blank, then navigate once we have the auth URL below.
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        'about:blank',
        'Gmail OAuth',
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
          const initResponse = await gmailOAuthService.initiateOAuth();
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

          // Navigate the already-open popup to Google's consent screen.
          popup.location.href = authUrl;

          // Use sessionStorage and postMessage for communication.
          // Stores `{code, state}` JSON so the CSRF state survives the new-tab path.
          const storageKey = 'gmail_oauth_payload';
          sessionStorage.removeItem(storageKey);

          // Guard against double-resolution from concurrent checkAuth/timeout/messageHandler paths.
          // Note: we deliberately do NOT poll `popup.closed` — Google's COOP headers isolate
          // the popup, making `popup.closed` return spurious `true` values that would falsely
          // resolve the flow before postMessage has a chance to fire. A hard timeout below
          // acts as the backstop instead.
          let resolved = false;
          const safeResolve = (result: Parameters<typeof resolve>[0]) => {
            if (resolved) return;
            resolved = true;
            clearInterval(checkAuth);
            clearTimeout(authTimeout);
            window.removeEventListener('message', messageHandler);
            resolve(result);
          };

          // Listen for postMessage from popup/tab.
          // Ignore subsequent messages once we've dispatched the BE call — the state is
          // single-use server-side, so a duplicate POST would race and falsely report failure.
          let dispatched = false;
          const messageHandler = (event: MessageEvent) => {
            // Verify origin for security
            if (event.origin !== window.location.origin) {
              return;
            }

            // Type guard for event data
            const eventData = event.data as
              | { type?: string; code?: string; state?: string }
              | undefined;
            if (
              !dispatched &&
              eventData?.type === 'GMAIL_OAUTH_SUCCESS' &&
              eventData?.code &&
              eventData?.state
            ) {
              dispatched = true;
              // Popup closes itself via window.close() in OAuthCallbackPage; opener-side
              // popup.close() is COOP-blocked under Google's cross-origin headers, so skip it.
              const oauthCode = eventData.code;
              const oauthState = eventData.state;
              gmailOAuthService
                .handleCallback({
                  code: oauthCode,
                  state: oauthState,
                  redirectUri,
                  searchQuery,
                  maxResults,
                  pollingMaxPages,
                  bulkImportDays,
                  bulkImportMaxResults,
                  isKnowledgeBase,
                })
                .then((callbackResponse) => {
                  safeResolve(callbackResponse);
                })
                .catch((error) => {
                  safeResolve({ success: false, error: String(error) });
                });
            }
          };

          window.addEventListener('message', messageHandler);

          // Poll for OAuth payload in sessionStorage (fallback for new tabs)
          const checkAuth = setInterval(() => {
            const raw = sessionStorage.getItem(storageKey);
            if (!raw) return;

            let parsed: { code?: string; state?: string } | null = null;
            try {
              parsed = JSON.parse(raw) as { code?: string; state?: string };
            } catch (error) {
              logger.error('Failed to parse OAuth payload from sessionStorage:', error);
              sessionStorage.removeItem(storageKey);
              return;
            }
            if (!parsed?.code || !parsed?.state) return;

            const { code, state } = parsed as { code: string; state: string };
            logger.info('📥 Received OAuth payload via sessionStorage');
            sessionStorage.removeItem(storageKey);

            // Popup/tab closes itself via OAuthCallbackPage's window.close(); opener-side
            // close is COOP-blocked anyway.

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
              })
              .then((callbackResponse) => {
                safeResolve(callbackResponse);
              })
              .catch((error) => {
                safeResolve({ success: false, error: String(error) });
              });
          }, 500);

          // Backstop: if the flow hasn't resolved within 5 minutes, give up.
          // (Replaces the previous popup.closed polling, which COOP breaks.)
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
          resolve({ success: false, error: 'An error occurred during OAuth flow' });
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
    const initResponse = await gmailOAuthService.initiateOAuth();
    if (!initResponse.success || !initResponse.data) {
      return { success: false, error: 'Failed to initiate OAuth flow' };
    }

    const authUrl = initResponse.data.authUrl;
    if (!authUrl.startsWith('https://')) {
      return { success: false, error: 'Invalid OAuth URL received from server' };
    }

    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({ config, redirectUri: configResponse.data.redirectUri })
    );

    window.location.href = authUrl;
    return { success: true, data: { authUrl } };
  },

  /**
   * Called on integrations page mount to finish a redirect-flow OAuth. Reads the
   * code+state OAuthCallbackPage stored and the config redirectToOAuth stashed,
   * then dispatches the BE callback. Returns null if no redirect-flow result is
   * pending.
   */
  consumePendingRedirectResult: async (): Promise<
    ApiResponse<{ email: string; id: number }> | null
  > => {
    const payloadRaw = sessionStorage.getItem('gmail_oauth_payload');
    const configRaw = sessionStorage.getItem('gmail_oauth_pending_config');
    if (!payloadRaw || !configRaw) return null;

    sessionStorage.removeItem('gmail_oauth_payload');
    sessionStorage.removeItem('gmail_oauth_pending_config');

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
    });
  },
};
