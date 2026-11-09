/**
 * Keeps the presence summary store (inbox rows, kanban cards) current: one `presence:snapshot`
 * on mount, on a workspace switch and after every reconnect, then `presence:summary` changes.
 * Mounted by the pages that show presence on a list of threads or act on one of them: MessagesPage
 * (rows, cards, bulk confirm) and NeedsRoutingPage (the confirm before a move or a spam decision).
 * They are separate routes, so only one is mounted at a time; each mount resets the store.
 *
 * - `available` is true only after a snapshot succeeds; false on a disconnect and on a refusal.
 * - The first snapshot of a fresh page is often refused (the server answers `{ok:false}` until the
 *   socket has joined its workspace): retried at 2/5/10 s.
 * - After a disconnect the raw `connect` re-snapshots too: SOCKET_RECONNECTED_EVENT is raised at
 *   most once per 30 s, so a second drop inside that window would leave the rows stale.
 */
import { useEffect } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';
import { useAuthStore } from '@/stores/authStore';
import { presenceClient } from './presenceClient';
import { usePresenceSummaryStore, type SummaryChange } from './presenceSummaryStore';

export const SNAPSHOT_RETRY_MS = [2_000, 5_000, 10_000];
export const RECONNECT_RESNAPSHOT_JITTER_MS = 1_000;

export const usePresenceSummary = (): void => {
  const orgId = useAuthStore((store) => store.selectedOrganizationId);

  useEffect(() => {
    const store = usePresenceSummaryStore.getState();
    store.reset(); // a workspace switch must never show the old workspace's rows
    getSocket();

    /** Bumped on disconnect and cleanup: an answer to an older snapshot is ignored. */
    let generation = 0;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let awaitingConnect = false;

    const clearTimers = () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (connectTimer !== null) clearTimeout(connectTimer);
      retryTimer = null;
      connectTimer = null;
    };

    const snapshot = async () => {
      const gen = generation;
      const ack = await presenceClient.snapshot();
      if (gen !== generation) return;
      const current = useAuthStore.getState().selectedOrganizationId;
      // An ack for another workspace (the switch has not landed on the socket yet) = not joined.
      if (ack.ok && ack.organizationId === current) {
        retries = 0;
        usePresenceSummaryStore.getState().applySnapshot(ack.threads);
        usePresenceSummaryStore.getState().setAvailable(true);
        return;
      }
      usePresenceSummaryStore.getState().setAvailable(false);
      if (retries < SNAPSHOT_RETRY_MS.length && retryTimer === null) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void snapshot();
        }, SNAPSHOT_RETRY_MS[retries++]);
      }
    };

    const resnapshot = () => {
      clearTimers();
      awaitingConnect = false;
      retries = 0;
      void snapshot();
    };

    const onSummary = (data: unknown) => {
      const body = data as { organizationId?: unknown; changes?: unknown } | null;
      if (body?.organizationId !== useAuthStore.getState().selectedOrganizationId) return;
      const changes = body?.changes;
      if (!Array.isArray(changes)) return;
      usePresenceSummaryStore.getState().applyChanges(changes as SummaryChange[]);
    };
    const onDisconnect = () => {
      generation += 1;
      clearTimers();
      awaitingConnect = true;
      usePresenceSummaryStore.getState().setAvailable(false);
    };
    const onConnect = () => {
      if (!awaitingConnect || connectTimer !== null) return;
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (awaitingConnect) resnapshot();
      }, Math.random() * RECONNECT_RESNAPSHOT_JITTER_MS);
    };
    const onReconnected = () => {
      if (!usePresenceSummaryStore.getState().available) resnapshot();
    };

    subscribeToEvent('presence:summary', onSummary);
    subscribeToEvent('disconnect', onDisconnect);
    subscribeToEvent('connect', onConnect);
    subscribeToEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
    void snapshot();
    return () => {
      unsubscribeFromEvent('presence:summary', onSummary);
      unsubscribeFromEvent('disconnect', onDisconnect);
      unsubscribeFromEvent('connect', onConnect);
      unsubscribeFromEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
      generation += 1;
      clearTimers();
      usePresenceSummaryStore.getState().reset();
      releaseSocket();
    };
  }, [orgId]);
};
