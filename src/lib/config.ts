/**
 * Central configuration for API and app settings
 */
import { logger } from '@/lib/logger';

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Get the authentication token synchronously
 * Must be called AFTER authStore is initialized
 */
export const getAuthToken = (): string | null => {
  // Direct import causes circular dependency, so we access via dynamic import result
  // The store will be registered on window by authStore.ts
  const authStorage = localStorage.getItem('auth-storage');
  if (!authStorage) {
    return null;
  }

  try {
    const { state } = JSON.parse(authStorage) as { state?: { token?: string } };
    return state?.token ?? null;
  } catch (error) {
    logger.error('Error parsing auth storage:', error);
    return null;
  }
};
