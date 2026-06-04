/**
 * Centralized user-facing error copy. Replaces ~28 hand-rolled
 * "Failed to X. Please try again." strings with category-specific messages
 * derived from the BE response when available.
 */

/** Common BE status → user copy mapping. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Check the form for errors and try again.',
  401: 'Your session has expired. Sign in again to continue.',
  403: 'You don’t have permission to do that. Ask an admin if you think this is a mistake.',
  404: 'We couldn’t find what you were looking for.',
  409: 'That action conflicts with another change. Refresh and try again.',
  413: 'The file or content is too large.',
  422: 'Some fields didn’t pass validation. Review and try again.',
  429: 'You’re going too fast. Wait a moment and try again.',
  500: 'Something went wrong on our side. The error has been logged.',
  502: 'The service is temporarily unavailable. Try again in a moment.',
  503: 'The service is temporarily unavailable. Try again in a moment.',
  504: 'The request timed out. Check your connection and try again.',
};

type AxiosLike = {
  response?: { status?: number; data?: { error?: string; message?: string } };
  message?: string;
};

/**
 * Best-effort extraction of a useful message from an unknown error.
 * Order: BE-supplied error string → status mapping → error.message → fallback.
 *
 * `scope` is the user-facing action name (e.g. "save note", "send reply") used
 * as the leading "Couldn't {scope}" — keep it lowercase verb + noun.
 */
export const formatError = (scope: string, err: unknown): string => {
  const axiosLike = err as AxiosLike;
  const beMessage = axiosLike.response?.data?.error ?? axiosLike.response?.data?.message;
  if (typeof beMessage === 'string' && beMessage.trim().length > 0) {
    return `Couldn't ${scope}: ${beMessage.trim()}`;
  }
  const status = axiosLike.response?.status;
  if (status && STATUS_MESSAGES[status]) {
    return `Couldn't ${scope}. ${STATUS_MESSAGES[status]}`;
  }
  if (err instanceof Error && err.message) {
    return `Couldn't ${scope}: ${err.message}`;
  }
  if (typeof axiosLike.message === 'string' && axiosLike.message.trim().length > 0) {
    return `Couldn't ${scope}: ${axiosLike.message.trim()}`;
  }
  return `Couldn't ${scope}. The error has been logged.`;
};
