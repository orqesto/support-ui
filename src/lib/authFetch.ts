import { logger } from '@/lib/logger';

type AuthStorageState = {
  state?: {
    token?: string;
  };
};

/**
 * Authenticated fetch wrapper that automatically includes the JWT token
 * from localStorage in the request headers.
 */
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  // Read token from Zustand's persisted storage
  const authStorage = localStorage.getItem('auth-storage');
  let token: string | null = null;

  if (authStorage) {
    try {
      const parsed = JSON.parse(authStorage) as AuthStorageState;
      token = parsed.state?.token ?? null;
    } catch (error) {
      logger.error('Error parsing auth storage:', error);
    }
  }

  // Merge headers with authorization token
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Make the fetch request with the merged options
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 unauthorized responses
  if (response.status === 401) {
    localStorage.removeItem('auth-storage');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
};
