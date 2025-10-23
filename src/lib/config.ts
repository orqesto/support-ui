/**
 * Central configuration for API and app settings
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Get the authentication token from Zustand's persisted storage
 */
export const getAuthToken = (): string | null => {
  const authStorage = localStorage.getItem('auth-storage');
  if (!authStorage) {
    return null;
  }

  try {
    const { state } = JSON.parse(authStorage) as { state?: { token?: string } };
    return state?.token ?? null;
  } catch (error) {
    console.error('Error parsing auth storage:', error);
    return null;
  }
};
