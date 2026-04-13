import axios from 'axios';
import { API_BASE_URL, getAuthToken } from './config';
import { logger } from '@/lib/logger';

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
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      logger.warn('⚠️ [API] No auth token found!');
    }

    // Add selected organization and department context
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage) as {
          state?: {
            selectedOrganizationId?: number;
            selectedDepartmentRole?: string;
          };
        };
        const selectedOrgId = parsed.state?.selectedOrganizationId;
        const selectedDept = parsed.state?.selectedDepartmentRole;

        if (selectedOrgId) {
          config.headers['X-Organization-Context'] = String(selectedOrgId);
          logger.info(
            `🏢 [API] Organization Context: ${selectedOrgId} | ${config.method?.toUpperCase()} ${config.url}`
          );
        } else {
          logger.warn(
            '⚠️ [API] No organization context set!',
            config.method?.toUpperCase(),
            config.url
          );
        }

        // Add department context if selected
        if (selectedDept) {
          config.headers['X-Department-Context'] = selectedDept;
          logger.info(
            `🏷️ [API] Department Context: ${selectedDept} | ${config.method?.toUpperCase()} ${config.url}`
          );
        }
      } catch (e) {
        logger.error('❌ [API] Failed to parse auth storage:', e);
      }
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
        // Clear all authentication data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('auth-storage');
        sessionStorage.clear();

        // Redirect to login
        window.location.href = '/login';
      }
    }

    // Extract error message from response
    if (isAxiosError(error) && error.response?.data) {
      const errorData = error.response.data as { error?: string; message?: string };
      const baseError = error as { message?: string };
      const errorMessage =
        errorData.error ?? errorData.message ?? baseError.message ?? 'Unknown error';

      // Create a more detailed error with status and message
      const enhancedError = new Error(errorMessage) as Error & { status?: number; data?: unknown };
      enhancedError.status = error.response.status;
      enhancedError.data = errorData;

      return Promise.reject(enhancedError);
    }

    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
);
