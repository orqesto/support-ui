/**
 * One request for every bell kind the app asks for at the same moment.
 *
 * Each alert hook reads its own kind (`GET /api/notifications?kind=…`). On a page load,
 * workspace switch or reconnect they all fire together — ~13 requests, 35% of all API traffic
 * on prod (nginx, Oct 2026), and up to 44 requests in one second from one office. Calls made in
 * the same tick are gathered here into `GET /api/notifications/by-kind?kinds=a,b,c`, which
 * answers each kind exactly as `?kind=` does.
 *
 * The answer keeps the axios shape the hooks already read (`res.data.data.notifications`).
 * A backend without the route (404/405 — a self-hosted server on an older release) gets the
 * per-kind requests instead, and is not asked again.
 */
import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';

export interface NotificationsOfKind {
  notifications: unknown[];
  total: number;
  hasMore: boolean;
}

/** What `apiClient.get('/api/notifications', { params: { kind } })` resolves to. */
export interface NotificationsOfKindResponse {
  data: { success?: boolean; data: NotificationsOfKind };
}

/** The backend's bound (MAX_KINDS_PER_REQUEST). */
const MAX_KINDS_PER_REQUEST = 30;

interface Waiter {
  resolve: (response: NotificationsOfKindResponse) => void;
  reject: (error: unknown) => void;
}

let byKindSupported: boolean | undefined;
let pending: Map<string, Waiter[]> | null = null;

const perKind = (kind: string): Promise<NotificationsOfKindResponse> =>
  apiClient.get('/api/notifications', { params: { kind } });

const settle = (waiters: Waiter[], answer: Promise<NotificationsOfKindResponse>) => {
  answer.then(
    (response) => waiters.forEach((waiter) => waiter.resolve(response)),
    (error: unknown) => waiters.forEach((waiter) => waiter.reject(error))
  );
};

const flushChunk = async (batch: Map<string, Waiter[]>, kinds: string[]) => {
  try {
    const res = await apiClient.get('/api/notifications/by-kind', {
      params: { kinds: kinds.join(',') },
    });
    byKindSupported = true;
    const byKind = (res.data as { data?: { byKind?: Record<string, NotificationsOfKind> } }).data
      ?.byKind;
    for (const kind of kinds) {
      const page = byKind?.[kind];
      // A kind missing from the answer is an error, never "no rows": an empty bell would read
      // as "nothing to report".
      settle(
        batch.get(kind)!,
        page
          ? Promise.resolve({ data: { success: true, data: page } })
          : Promise.reject(new Error(`by-kind answer has no "${kind}"`))
      );
    }
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 404 || status === 405) {
      byKindSupported = false;
      for (const kind of kinds) settle(batch.get(kind)!, perKind(kind));
      return;
    }
    // The caller gets the request's own error (status, body), as a per-kind request would give.
    for (const kind of kinds) batch.get(kind)!.forEach((waiter) => waiter.reject(error));
  }
};

const flush = () => {
  const batch = pending!;
  pending = null;
  const kinds = [...batch.keys()];
  for (let start = 0; start < kinds.length; start += MAX_KINDS_PER_REQUEST) {
    void flushChunk(batch, kinds.slice(start, start + MAX_KINDS_PER_REQUEST));
  }
};

/** The newest notifications of one kind — batched with every other kind asked for this tick. */
export const fetchNotificationsOfKind = (kind: string): Promise<NotificationsOfKindResponse> => {
  if (byKindSupported === false) return perKind(kind);
  return new Promise((resolve, reject) => {
    if (!pending) {
      pending = new Map();
      setTimeout(flush, 0);
    }
    const waiters = pending.get(kind) ?? [];
    waiters.push({ resolve, reject });
    pending.set(kind, waiters);
  });
};

/** Tests only: forget what the backend supports and drop a batch not yet sent. */
export const resetNotificationsByKindForTests = (): void => {
  byKindSupported = undefined;
  pending = null;
};
