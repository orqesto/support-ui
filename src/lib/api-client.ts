import axios from 'axios';
import { API_BASE_URL } from './config';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/stores/authStore';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

// Request interceptor to add auth token and organization context
apiClient.interceptors.request.use(
  (config) => {
    // For FormData (file uploads), remove the default Content-Type so the browser
    // can set multipart/form-data with the correct boundary automatically.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

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

    return config;
  },
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
