import axios from 'axios';
import { API_BASE_URL, getAuthToken } from './config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and organization context
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add selected organization context for admin
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage) as {
          state?: { selectedOrganizationId?: number };
        };
        const selectedOrgId = parsed.state?.selectedOrganizationId;
        if (selectedOrgId) {
          config.headers['X-Organization-Context'] = String(selectedOrgId);
          // eslint-disable-next-line no-console
          console.log(
            `🏢 [API] Organization Context: ${selectedOrgId} | ${config.method?.toUpperCase()} ${config.url}`
          );
        } else {
          console.warn(
            '⚠️ [API] No organization context set!',
            config.method?.toUpperCase(),
            config.url
          );
        }
      } catch (e) {
        console.error('❌ [API] Failed to parse auth storage:', e);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // Type guard for axios error
    const isAxiosError = (err: unknown): err is { response?: { status?: number; data?: unknown } } =>
      typeof err === 'object' && err !== null && 'response' in err;

    if (isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    // Extract error message from response
    if (isAxiosError(error) && error.response?.data) {
      const errorData = error.response.data as { error?: string; message?: string };
      const baseError = error as { message?: string };
      const errorMessage = errorData.error ?? errorData.message ?? baseError.message ?? 'Unknown error';

      // Create a more detailed error with status and message
      const enhancedError = new Error(errorMessage) as Error & { status?: number; data?: unknown };
      enhancedError.status = error.response.status;
      enhancedError.data = errorData;

      return Promise.reject(enhancedError);
    }

    return Promise.reject(error);
  }
);
