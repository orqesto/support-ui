/**
 * Who else is on these threads (spec §5.1, §7), and — when the caller passes the composer — this
 * tab's own state, reported to the server. One hook for both: a thread or ticket view passes
 * `reporterInput`; a list view (or a global admin) watches without reporting.
 *
 * - `available` is true only after a successful watch ack; it drops on a failed or timed-out ack
 *   and on a disconnect, and comes back with the re-watch on reconnect. Unavailable ⇒ the caller
 *   renders nothing.
 * - Watch stores nothing on the server: after each ack this tab's state is sent for every watched
 *   thread, then on each change (≤ 1/s per thread) and every `heartbeatMs`.
 * - The server answers with survivor ids (`mapped`, after a merge); events use those ids.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';
import { useAuthStore } from '@/stores/authStore';
import { eventConcerns } from '../hooks/useConversationStatusRefresh';
import { presenceClient, WATCH_BATCH_SIZE } from './presenceClient';
import {
  PRESENCE_STATE_RANK,
  type PresenceSettings,
  type PresenceState,
  type PresenceThreadEvent,
  type PresenceViewer,
} from './presence.types';
import { usePresenceReporter, type PresenceReporterInput } from './usePresenceReporter';

/**
 * A failed watch is tried again after these waits, then left until the next reconnect or id
 * change. The first watch of a fresh page often fails: socket.io sends emits buffered before the
 * connect BEFORE the socket manager's join-organization, and the server answers `{ok:false}`
 * until the socket is in its workspace.
 */
export const WATCH_RETRY_MS = [2_000, 5_000, 10_000];
/** At most one `presence:state` per thread per second (the BE contract). */
export const STATE_MIN_GAP_MS = 1_000;
/**
 * After a disconnect the hook re-watches on the socket's own `connect` (spread over this window),
 * not only on SOCKET_RECONNECTED_EVENT: the socket manager raises that one at most once per 30 s,
 * so a second drop inside 30 s would leave presence dead for as long as the view stays open.
 */
export const RECONNECT_REWATCH_JITTER_MS = 1_000;

export interface PresenceWatchResult {
  available: boolean;
  /**
   * The server refused the watch for its per-socket cap (`watch_cap`): not retried, and
   * `available` stays false. The caller may say "presence for the latest 50 of N threads".
   */
  capped: boolean;
  /** Other agents only, one entry per agent across all ids: strongest state, earliest since. */
  viewers: PresenceViewer[];
  settings: PresenceSettings | null;
}

const unique = (ids: number[]): number[] => [...new Set(ids)];

const mergeViewers = (
  threads: Record<number, PresenceViewer[]>,
  myId: number | undefined
): PresenceViewer[] => {
  const byUser = new Map<number, PresenceViewer>();
  for (const list of Object.values(threads)) {
    for (const viewer of list) {
      if (viewer.userId === myId) continue;
      const seen = byUser.get(viewer.userId);
      if (!seen) {
        byUser.set(viewer.userId, { ...viewer });
        continue;
      }
      const state =
        PRESENCE_STATE_RANK[viewer.state] > PRESENCE_STATE_RANK[seen.state]
          ? viewer.state
          : seen.state;
      const since = Date.parse(viewer.since) < Date.parse(seen.since) ? viewer.since : seen.since;
      byUser.set(viewer.userId, { userId: viewer.userId, state, since });
    }
  }
  return [...byUser.values()].sort(
    (left, right) => Date.parse(left.since) - Date.parse(right.since) || left.userId - right.userId
  );
};

export const usePresenceWatch = (
  conversationIds: number[],
  reporterInput?: PresenceReporterInput
): PresenceWatchResult => {
  const myId = useAuthStore((store) => store.user?.id);
  const [available, setAvailable] = useState(false);
  const [capped, setCapped] = useState(false);
  const [settings, setSettings] = useState<PresenceSettings | null>(null);
  /** Viewer lists per watched survivor id, as the server sent them (me included). */
  const [threads, setThreads] = useState<Record<number, PresenceViewer[]>>({});

  const state = usePresenceReporter(reporterInput, settings);
  const stateRef = useRef(state);
  stateRef.current = state;
  const availableRef = useRef(available);
  availableRef.current = available;

  /** The requested ids, as the caller passes them now. */
  const wanted = useRef<number[]>([]);
  /** requested id → survivor id, from the acks. */
  const survivorOf = useRef(new Map<number, number>());
  /** Bumped on disconnect and unmount: an ack that answers an older generation is ignored. */
  const generation = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  /** The last watch answered with a refusal (or timed out): its ids may not be watched. */
  const lastWatchFailed = useRef(false);
  /** A disconnect happened and no re-watch ran since: the next raw `connect` re-watches. */
  const awaitingConnect = useRef(false);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per survivor: when this tab last queued a state for it, and which. */
  const lastSent = useRef(new Map<number, { at: number; state: PresenceState }>());
  const held = useRef(new Set<number>());
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const survivors = useCallback(
    (): number[] => unique(wanted.current.flatMap((id) => survivorOf.current.get(id) ?? [])),
    []
  );

  /** Send this tab's state to `ids`; `force` re-sends an unchanged state (a heartbeat, a watch). */
  const reportTo = useCallback(
    (ids: number[], force: boolean) => {
      const current = stateRef.current;
      if (!current) return;
      const now = Date.now();
      let wait = 0;
      for (const id of ids) {
        const last = lastSent.current.get(id);
        if (!force && last?.state === current) continue;
        if (last && now - last.at < STATE_MIN_GAP_MS) {
          held.current.add(id);
          wait = Math.max(wait, STATE_MIN_GAP_MS - (now - last.at));
          continue;
        }
        lastSent.current.set(id, { at: now, state: current });
        presenceClient.setState(id, current);
      }
      if (held.current.size === 0 || heldTimer.current !== null) return;
      heldTimer.current = setTimeout(() => {
        heldTimer.current = null;
        const due = [...held.current];
        held.current.clear();
        const live = new Set(survivors());
        reportTo(
          due.filter((id) => live.has(id)),
          false
        );
      }, wait);
    },
    [survivors]
  );

  /** Drop survivors no wanted id maps to any more: unwatch them and forget their viewers. */
  const release = useCallback(
    (candidates: number[]) => {
      const keep = new Set(survivors());
      const gone = unique(candidates).filter((id) => !keep.has(id));
      if (gone.length === 0) return;
      presenceClient.unwatch(gone);
      for (const id of gone) {
        lastSent.current.delete(id);
        held.current.delete(id);
      }
      setThreads((prev) => {
        const next = { ...prev };
        for (const id of gone) delete next[id];
        return next;
      });
    },
    [survivors]
  );

  const watchIds = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      const gen = generation.current;
      const batches: number[][] = [];
      for (let start = 0; start < ids.length; start += WATCH_BATCH_SIZE) {
        batches.push(ids.slice(start, start + WATCH_BATCH_SIZE));
      }
      const acks = await Promise.all(batches.map((batch) => presenceClient.watch(batch)));
      if (gen !== generation.current) return;

      const stillWanted = new Set(wanted.current);
      const fresh: number[] = [];
      const replaced: number[] = [];
      const orphans: number[] = [];
      const lists: Record<number, PresenceViewer[]> = {};
      let failed = false;
      let capHit = false;
      for (const ack of acks) {
        if (!ack.ok) {
          failed = true;
          if (ack.reason === 'watch_cap') capHit = true;
          continue;
        }
        setSettings(ack.settings);
        for (const [requested, survivor] of Object.entries(ack.mapped)) {
          const requestedId = Number(requested);
          if (!stillWanted.has(requestedId)) {
            orphans.push(survivor); // dropped by the caller while the ack was on its way
            continue;
          }
          const before = survivorOf.current.get(requestedId);
          if (before !== undefined && before !== survivor) replaced.push(before);
          survivorOf.current.set(requestedId, survivor);
          fresh.push(survivor);
        }
        for (const [id, list] of Object.entries(ack.viewers)) {
          if (fresh.includes(Number(id))) lists[Number(id)] = list;
        }
      }
      release([...orphans, ...replaced]);
      setThreads((prev) => ({ ...prev, ...lists }));
      setCapped(capHit);
      lastWatchFailed.current = failed;
      if (failed) {
        setAvailable(false);
        // The cap does not lift by asking again: no retry.
        const retry = !capHit && retryCount.current < WATCH_RETRY_MS.length;
        if (retry && retryTimer.current === null) {
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            void watchIds(wanted.current);
          }, WATCH_RETRY_MS[retryCount.current++]);
        }
      } else {
        retryCount.current = 0;
        setAvailable(true);
      }
      reportTo(unique(fresh), true);
    },
    [release, reportTo]
  );

  const rewatchAll = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    if (connectTimer.current !== null) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    awaitingConnect.current = false;
    retryCount.current = 0;
    void watchIds(wanted.current);
  }, [watchIds]);

  // Server events, subscribed once; the unmount unwatches everything.
  useEffect(() => {
    getSocket();
    // The same Map/Set objects for the hook's life (only cleared), named here for the cleanup.
    const survivorMap = survivorOf.current;
    const sentMap = lastSent.current;
    const heldSet = held.current;
    const onThread = (data: unknown) => {
      const event = data as PresenceThreadEvent | null;
      if (!event || !Array.isArray(event.viewers)) return;
      if (!survivors().includes(event.conversationId)) return;
      setThreads((prev) => ({ ...prev, [event.conversationId]: event.viewers }));
    };
    const onDisconnect = () => {
      // The server dropped this socket's watches and states: all of it comes back with the
      // re-watch on reconnect.
      generation.current += 1;
      for (const timer of [retryTimer.current, connectTimer.current]) {
        if (timer !== null) clearTimeout(timer);
      }
      retryTimer.current = null;
      connectTimer.current = null;
      awaitingConnect.current = true;
      lastWatchFailed.current = true; // the server forgot every watch of this socket
      lastSent.current.clear();
      held.current.clear();
      setAvailable(false);
      setThreads({});
    };
    // The socket is back. The server answers {ok:false} until join-organization lands; the
    // 2/5/10 s retry covers that.
    const onConnect = () => {
      if (!awaitingConnect.current || connectTimer.current !== null) return;
      connectTimer.current = setTimeout(() => {
        connectTimer.current = null;
        if (awaitingConnect.current) rewatchAll();
      }, Math.random() * RECONNECT_REWATCH_JITTER_MS);
    };
    // Usually already done by `connect`; still needed when this tab missed it (a dropped
    // re-watch, an unavailable view).
    const onReconnected = () => {
      if (!availableRef.current) rewatchAll();
    };
    const onUpdated = (data: unknown) => {
      if ((data as { action?: unknown } | null)?.action !== 'merge') return;
      const ours = [...wanted.current, ...survivors()];
      if (ours.some((id) => eventConcerns(data, id))) rewatchAll();
    };
    subscribeToEvent('presence:thread', onThread);
    subscribeToEvent('disconnect', onDisconnect);
    subscribeToEvent('connect', onConnect);
    subscribeToEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
    subscribeToEvent('conversation:updated', onUpdated);
    return () => {
      unsubscribeFromEvent('presence:thread', onThread);
      unsubscribeFromEvent('disconnect', onDisconnect);
      unsubscribeFromEvent('connect', onConnect);
      unsubscribeFromEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
      unsubscribeFromEvent('conversation:updated', onUpdated);
      generation.current += 1;
      for (const timer of [retryTimer.current, heldTimer.current, connectTimer.current]) {
        if (timer !== null) clearTimeout(timer);
      }
      retryTimer.current = null;
      heldTimer.current = null;
      connectTimer.current = null;
      awaitingConnect.current = false;
      // Ids the server never mapped (no ack yet) are unwatched as they were asked.
      presenceClient.unwatch(unique(wanted.current.map((id) => survivorMap.get(id) ?? id)));
      // Reset, so a remount (StrictMode) watches from scratch.
      wanted.current = [];
      survivorMap.clear();
      sentMap.clear();
      heldSet.clear();
      releaseSocket();
    };
  }, [survivors, rewatchAll]);

  // The caller's ids: unwatch what was dropped, watch what is new.
  const idsKey = unique(conversationIds)
    .sort((left, right) => left - right)
    .join(',');
  useEffect(() => {
    const next = idsKey === '' ? [] : idsKey.split(',').map(Number);
    const before = wanted.current;
    const nextSet = new Set(next);
    const beforeSet = new Set(before);
    const removed = before.filter((id) => !nextSet.has(id));
    const added = next.filter((id) => !beforeSet.has(id));
    wanted.current = next;
    if (removed.length > 0) {
      const candidates = removed.map((id) => survivorOf.current.get(id) ?? id);
      for (const id of removed) survivorOf.current.delete(id);
      release(candidates);
    }
    // A new id set earns a fresh retry budget. After a failed watch (or with one pending) the
    // whole set is asked again — a smaller set may now fit under the cap.
    retryCount.current = 0;
    if (lastWatchFailed.current || retryTimer.current !== null) {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      void watchIds(next);
    } else void watchIds(added);
  }, [idsKey, release, watchIds]);

  // A changed state goes out at once (≤ 1/s per thread).
  useEffect(() => {
    if (state && availableRef.current) reportTo(survivors(), false);
  }, [state, available, reportTo, survivors]);

  // The heartbeat keeps this tab's entry from expiring on the server.
  const reporting = state !== null;
  const heartbeatMs = settings?.heartbeatMs;
  useEffect(() => {
    if (!available || !reporting || !heartbeatMs) return;
    const timer = setInterval(() => reportTo(survivors(), true), heartbeatMs);
    return () => clearInterval(timer);
  }, [available, reporting, heartbeatMs, reportTo, survivors]);

  const viewers = useMemo(
    () => (available ? mergeViewers(threads, myId) : []),
    [available, threads, myId]
  );
  return { available, capped, viewers, settings };
};
