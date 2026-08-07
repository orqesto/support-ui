import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/stores/authStore';
import { useScopeStore } from '@/stores/scopeStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

/**
 * Request-context interceptor (exported for unit testing — see api-client.scope.test.ts).
 *
 * D-ADM-1 scope contract: requests to the Alliance console API (`/api/alliances`) carry
 * `X-Alliance-Context` (from the URL-derived scopeStore) and MUST NOT carry
 * `X-Organization-Context` — the two scopes are mutually exclusive. Both headers are
 * transport-only; the backend authorizes from the route param, never from these headers.
 * All other requests keep the existing org-context behavior verbatim.
 */
export const applyRequestContext = (
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig => {
  // For FormData (file uploads), remove the default Content-Type so the browser
  // can set multipart/form-data with the correct boundary automatically.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const { scope, allianceId } = useScopeStore.getState();
  if (config.url?.startsWith('/api/alliances')) {
    // Alliance-scoped: never leak the org context onto a cross-org console call.
    delete config.headers['X-Organization-Context'];
    if (allianceId !== null) {
      config.headers['X-Alliance-Context'] = String(allianceId);
    }
  } else if (scope === 'platform') {
    // Platform (global-admin) console: cross-org by definition (D-ADM-1) — never attach
    // an org context onto a platform call. The BE authorizes the global admin from the
    // role, not a header; a stale org context could scope a reused handler to one org.
    delete config.headers['X-Organization-Context'];
  } else {
    // Add selected organization context — read directly from Zustand store to avoid
    // JSON.parse(localStorage) on every request (avoids parsing cost and stale-parse issues).
    const selectedOrgId = useAuthStore.getState().selectedOrganizationId;
    if (selectedOrgId) {
      config.headers['X-Organization-Context'] = String(selectedOrgId);
      logger.debug(
        `🏢 [API] Organization Context set | ${config.method?.toUpperCase()} ${config.url}`
      );
    } else {
      logger.warn(
        '⚠️ [API] No organization context set!',
        config.method?.toUpperCase(),
        config.url
      );
    }
  }

  // Add department context filter — attach CSV header when user has narrowed their view
  const selectedDeptIds = useDepartmentContextStore.getState().getSelectedDeptIds();
  if (selectedDeptIds.length > 0) {
    config.headers['X-Department-Context'] = selectedDeptIds.join(',');
  }

  return config;
};

// Request interceptor to add auth token and organization/alliance context
apiClient.interceptors.request.use(
  applyRequestContext,
  (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error)))
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // Type guard for axios error
    const isAxiosError = (
      err: unknown
    ): err is { response?: { status?: number; data?: unknown } } =>
      typeof err === 'object' && err !== null && 'response' in err;

    if (isAxiosError(error) && error.response?.status === 401) {
      // Only redirect to login if not already there
      const currentPath = window.location.pathname;
      const isOnAuthPage =
        currentPath === '/login' ||
        currentPath === '/signup' ||
        currentPath === '/forgot-password' ||
        currentPath === '/reset-password';

      if (!isOnAuthPage) {
        useAuthStore.getState().logout();
        sessionStorage.clear();
        window.location.href = '/login';
      }
    }

    // 402 = subscription inactive/expired (requireActiveSubscription). Surface a
    // global gate overlay explaining why the app is unavailable + how to renew,
    // instead of leaving the user with silently-failing blank screens. Global
    // admins never receive a 402, so this only gates regular users in an expired org.
    if (isAxiosError(error) && error.response?.status === 402) {
      const data = error.response.data as { error?: string; message?: string } | undefined;
      useSubscriptionGateStore
        .getState()
        .setGated(data?.error ?? data?.message ?? 'Your subscription is not active.');
    }

    // Extract error message from response
    if (isAxiosError(error) && error.response?.data) {
      const errorData = error.response.data as { error?: string; message?: string };
      const baseError = error as { message?: string };
      const rawMessage =
        errorData.error ?? errorData.message ?? baseError.message ?? 'Unknown error';
      const status = error.response.status ?? 0;

      // 5xx errors hide internal details; client errors pass through user-facing messages
      const errorMessage =
        status >= 500
          ? 'A server error occurred. Please try again later.'
          : rawMessage;

      const enhancedError = new Error(errorMessage) as Error & { status?: number; data?: unknown };
      enhancedError.status = status;
      enhancedError.data = errorData;

      return Promise.reject(enhancedError);
    }

    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
);
