import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';

/**
 * Sends a crash from the app's ErrorBoundary to the server log (`POST /api/client-errors`).
 *
 * The crash screen said "The error has been logged" while the error only reached the browser
 * console; a ticket page that crashed on a phone (2026-11) could be diagnosed only from a pasted
 * console. Fire-and-forget: a report must never itself throw, retry or block the crash screen.
 *
 * Only while signed in: the route is authenticated, and a 401 from the API client signs the user
 * out and sends them to /login — a crash report must not do that.
 */
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

export type ClientErrorReport = {
  message: string;
  stack?: string;
  componentStack?: string;
};

const clip = (text: string | undefined, max: number) => text?.slice(0, max);

export const clientErrorService = {
  /** True when the report was sent (signed in), false when it was skipped. */
  report: (crash: ClientErrorReport): boolean => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated || !user) return false;
    apiClient
      .post('/api/client-errors', {
        message: clip(crash.message || 'Unknown error', MAX_MESSAGE),
        stack: clip(crash.stack, MAX_STACK),
        componentStack: clip(crash.componentStack, MAX_STACK),
        // Path only; the server drops anything after ? or # as well.
        path: window.location.pathname,
        release: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
      })
      .catch(() => {
        // Reporting is best effort: an older server without the route answers 404.
      });
    return true;
  },
};
