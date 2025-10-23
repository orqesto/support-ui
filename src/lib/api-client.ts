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
        const parsed = JSON.parse(authStorage);
        const selectedOrgId = parsed.state?.selectedOrganizationId;
        if (selectedOrgId) {
          config.headers['X-Organization-Context'] = selectedOrgId.toString();
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
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    // Extract error message from response
    if (error.response?.data) {
      const errorData = error.response.data;
      const errorMessage = errorData.error || errorData.message || error.message;

      // Create a more detailed error with status and message
      const enhancedError = new Error(errorMessage);
      (enhancedError as Error & { status: number; data: unknown }).status = error.response.status;
      (enhancedError as Error & { status: number; data: unknown }).data = errorData;

      return Promise.reject(enhancedError);
    }

    return Promise.reject(error);
  }
);
