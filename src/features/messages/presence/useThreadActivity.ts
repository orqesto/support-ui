/**
 * Live banners in the open thread (spec §5.3): what a colleague just did to it, from the events
 * the backend already sends plus their actor id — a reply (`message:replied`), a close, resolve,
 * assign, merge or spam (`conversation:updated`), a status change (`conv:status_changed`) and a
 * move to another team (`conversation:routed`). My own events and events without an actor (the
 * system) show nothing; actions it cannot name are ignored. One banner: the newest replaces the
 * one before. Names are resolved when the banner renders (ThreadActivityBanner).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import { eventConcerns } from '../hooks/useConversationStatusRefresh';

export type ThreadActivity =
  | { kind: 'replied'; actorId: number }
  | { kind: 'closed'; actorId: number }
  | { kind: 'resolved'; actorId: number }
  | { kind: 'assigned'; actorId: number; assigneeId: number | null }
  | { kind: 'moved'; actorId: number; departmentId: number | null }
  | { kind: 'merged'; actorId: number; intoPublicId: string | null }
  | { kind: 'spam'; actorId: number };

const SPAM_ACTIONS = new Set(['move_to_spam', 'confirm_spam', 'bulk_spam']);
const RESOLVE_ACTIONS = new Set(['resolve', 'bulk_resolve', 'bulk_resolve_kb']);

const actorOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/** A status name the banner can say, or null. */
const fromStatus = (status: unknown, actorId: number): ThreadActivity | null => {
  if (status === 'closed') return { kind: 'closed', actorId };
  if (status === 'resolved') return { kind: 'resolved', actorId };
  return null;
};

/** `conversation:updated` for this thread → a banner, or null when it is not one we can name. */
export const activityFromUpdate = (
  data: Record<string, unknown>,
  conversationId: number,
  actorId: number
): ThreadActivity | null => {
  const action = data.action;
  if (typeof action !== 'string') return null;
  if (action === 'close') return { kind: 'closed', actorId };
  if (RESOLVE_ACTIONS.has(action)) return { kind: 'resolved', actorId };
  if (SPAM_ACTIONS.has(action)) return { kind: 'spam', actorId };
  if (action === 'status_change') return fromStatus(data.status, actorId);
  if (action === 'assign') {
    return { kind: 'assigned', actorId, assigneeId: actorOf(data.assigneeId) };
  }
  if (action === 'merge') {
    // `conversationId` is the survivor: name it only when this thread went INTO another one.
    const into =
      data.conversationId !== conversationId && typeof data.publicId === 'string'
        ? data.publicId
        : null;
    return { kind: 'merged', actorId, intoPublicId: into };
  }
  return null;
};

export const useThreadActivity = (
  conversationId: number
): { activity: ThreadActivity | null; dismiss: () => void } => {
  const myId = useAuthStore((store) => store.user?.id);
  const [activity, setActivity] = useState<ThreadActivity | null>(null);

  // A different thread starts with no banner.
  useEffect(() => setActivity(null), [conversationId]);

  useEffect(() => {
    getSocket();
    const someoneElse = (value: unknown): number | null => {
      const actor = actorOf(value);
      return actor !== null && actor !== myId ? actor : null;
    };
    const onReplied = (raw: unknown) => {
      const data = (raw ?? {}) as Record<string, unknown>;
      if (data.messageId !== conversationId) return;
      const actorId = someoneElse(data.repliedBy);
      if (actorId !== null) setActivity({ kind: 'replied', actorId });
    };
    const onUpdated = (raw: unknown) => {
      if (!eventConcerns(raw, conversationId)) return;
      const data = raw as Record<string, unknown>;
      const actorId = someoneElse(data.actorUserId);
      if (actorId === null) return;
      const next = activityFromUpdate(data, conversationId, actorId);
      if (next) setActivity(next);
    };
    const onStatusChanged = (raw: unknown) => {
      const data = (raw ?? {}) as Record<string, unknown>;
      if (data.conversationId !== conversationId) return;
      const actorId = someoneElse(data.actorUserId);
      if (actorId === null) return;
      const next = fromStatus(data.status, actorId);
      if (next) setActivity(next);
    };
    const onRouted = (raw: unknown) => {
      const data = (raw ?? {}) as Record<string, unknown>;
      if (data.conversationId !== conversationId) return;
      const actorId = someoneElse(data.routedBy);
      if (actorId === null) return;
      setActivity({ kind: 'moved', actorId, departmentId: actorOf(data.departmentId) });
    };
    subscribeToEvent('message:replied', onReplied);
    subscribeToEvent('conversation:updated', onUpdated);
    subscribeToEvent('conv:status_changed', onStatusChanged);
    subscribeToEvent('conversation:routed', onRouted);
    return () => {
      unsubscribeFromEvent('message:replied', onReplied);
      unsubscribeFromEvent('conversation:updated', onUpdated);
      unsubscribeFromEvent('conv:status_changed', onStatusChanged);
      unsubscribeFromEvent('conversation:routed', onRouted);
      releaseSocket();
    };
  }, [conversationId, myId]);

  const dismiss = useCallback(() => setActivity(null), []);
  return { activity, dismiss };
};
