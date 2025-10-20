import { apiClient } from '@/lib/api-client';

export type GmailOAuthConfig = {
  hasConfig: boolean;
  redirectUri: string;
};

export type GmailOAuthInitResponse = {
  authUrl: string;
};

export type GmailOAuthCallbackRequest = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  searchQuery?: string;
  maxResults?: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export const gmailOAuthService = {
  /**
   * Get OAuth configuration
   */
  getConfig: async (): Promise<ApiResponse<GmailOAuthConfig>> => {
    const response = await apiClient.get<{ success: boolean; data: GmailOAuthConfig }>('/api/oauth/gmail/config');
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Initiate OAuth flow
   */
  initiateOAuth: async (
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<ApiResponse<GmailOAuthInitResponse>> => {
    const response = await apiClient.get<{ success: boolean; data: GmailOAuthInitResponse }>(
      `/api/oauth/gmail/authorize?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&redirectUri=${encodeURIComponent(redirectUri)}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Handle OAuth callback
   */
  handleCallback: async (request: GmailOAuthCallbackRequest): Promise<ApiResponse<{ email: string; id: number }>> => {
    const response = await apiClient.post<{ success: boolean; data: { email: string; id: number }; message: string }>(
      '/api/oauth/gmail/callback',
      request
    );
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
    clientId: string,
    clientSecret: string,
    searchQuery?: string,
    maxResults?: number
  ): Promise<ApiResponse<{ email: string; id: number }>> => {
    return new Promise(async (resolve) => {
      try {
        // Get redirect URI from config
        const configResponse = await gmailOAuthService.getConfig();
        if (!configResponse.success || !configResponse.data) {
          resolve({ success: false, error: 'Failed to get OAuth configuration' });
          return;
        }

        const redirectUri = configResponse.data.redirectUri;

        // Initiate OAuth flow
        const initResponse = await gmailOAuthService.initiateOAuth(clientId, clientSecret, redirectUri);
        if (!initResponse.success || !initResponse.data) {
          resolve({ success: false, error: 'Failed to initiate OAuth flow' });
          return;
        }

        // Open popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          initResponse.data.authUrl,
          'Gmail OAuth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          resolve({ success: false, error: 'Failed to open OAuth popup. Please allow popups.' });
          return;
        }

        // Use localStorage instead of postMessage due to CORS issues
        const storageKey = 'gmail_oauth_code';
        localStorage.removeItem(storageKey);

        // Poll for OAuth code in localStorage
        const checkAuth = setInterval(async () => {
          const code = localStorage.getItem(storageKey);

          if (code) {
            clearInterval(checkAuth);
            localStorage.removeItem(storageKey);

            try {
              // Close popup if still open
              if (popup && !popup.closed) {
                popup.close();
              }
            } catch (e) {
              // Ignore errors closing popup
            }

            // Exchange code for tokens
            const callbackResponse = await gmailOAuthService.handleCallback({
              code,
              clientId,
              clientSecret,
              redirectUri,
              searchQuery,
              maxResults,
            });

            resolve(callbackResponse);
          }
        }, 500);

        // Check if popup was closed without auth
        const checkClosed = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkClosed);
              clearInterval(checkAuth);

              const code = localStorage.getItem(storageKey);
              if (!code) {
                resolve({ success: false, error: 'OAuth popup was closed without completing authentication' });
              }
            }
          } catch (e) {
            // Can't access popup.closed due to CORS, keep checking
          }
        }, 1000);
      } catch (error) {
        console.error('OAuth error:', error);
        resolve({ success: false, error: 'An error occurred during OAuth flow' });
      }
    });
  },
};
