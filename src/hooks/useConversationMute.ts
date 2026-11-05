import { useCallback, useEffect, useRef, useState } from 'react';
import { messageService } from '@/services/message.service';
import { toast } from '@/lib/toast';

type Override = { id: number; initial: boolean | undefined; value: boolean };

/**
 * One person's mute on one thread. `initial` is the detail's `mutedByMe`; `undefined` means the
 * backend does not know mutes (older build), so the action is hidden.
 *
 * The toggle is optimistic. Only the newest call may settle the state, so a double click (or a
 * slow older reply) cannot end in the wrong state; a failed newest call goes back to the last
 * state the server confirmed. Another thread, or a fresh `initial`, starts over from the server.
 *
 * Calls are sent one after another, so the server applies them in the order the person clicked
 * (two requests in flight can land in either order, and the newest click would lose).
 *
 * What the backend does to a mute as the thread changes (so the header need not wait for a read):
 * - `ended`: the thread was resolved, closed or filtered, or assigned to this person. The backend
 *   deletes the mute, a reopen afterwards is a new start. When it turns true the mute shows as off
 *   and stays off until the server says otherwise.
 * - A 409 on the mute call means the thread is finished (resolved, closed, filtered) and cannot be muted: the person is told,
 *   the mute shows as off, no further mute call is sent for it until the thread is open again, and it is read again.
 * - `onReconcile`: called after a 409, and when a mute call answered AFTER `ended` turned true (the
 *   reply cannot say whether the ending or the call came last), so the screen matches the server.
 *
 * A call that hangs gives up after `CALL_TIMEOUT_MS`, so it cannot hold up later toggles.
 */
export const CALL_TIMEOUT_MS = 15_000;

export type MuteThreadState = { ended?: boolean; onReconcile?: () => void };

const withTimeout = <T,>(work: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mute call timed out')), CALL_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('mute call failed'));
      }
    );
  });

export const useConversationMute = (
  conversationId: number,
  initial: boolean | undefined,
  thread: MuteThreadState = {}
) => {
  const { ended = false } = thread;
  const reconcileRef = useRef(thread.onReconcile);
  reconcileRef.current = thread.onReconcile;
  // Counts the times the backend ended the mute while this hook was mounted.
  const endedCount = useRef(0);
  // Threads the backend refused a mute for (409): no second try.
  const refused = useRef<Set<number>>(new Set());
  const [override, setOverride] = useState<Override | null>(null);
  const latestCall = useRef(0);
  const confirmed = useRef<{ id: number; initial: boolean | undefined; value: boolean } | null>(
    null
  );
  const currentId = useRef(conversationId);
  currentId.current = conversationId;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const endsBefore = useRef({ id: conversationId, ends: ended });

  useEffect(() => {
    // The thread is not finished (any more): a mute is allowed again, so a refusal no longer holds.
    if (!ended) refused.current.delete(conversationId);
    const before = endsBefore.current;
    endsBefore.current = { id: conversationId, ends: ended };
    if (initial === undefined || before.id !== conversationId || before.ends || !ended) return;
    endedCount.current += 1;
    // The backend just ended the mute (the thread was resolved, closed or filtered, or assigned to this person).
    confirmed.current = { id: conversationId, initial, value: false };
    setOverride({ id: conversationId, initial, value: false });
  }, [conversationId, initial, ended]);

  const active = override?.id === conversationId && override.initial === initial;
  const muted = active ? override.value : (initial ?? false);

  const toggle = useCallback(async () => {
    if (initial === undefined) return;
    const known = confirmed.current;
    const base = known?.id === conversationId && known.initial === initial ? known.value : initial;
    const next = !muted;
    if (next && refused.current.has(conversationId)) return;
    const call = ++latestCall.current;
    const endedAtStart = endedCount.current;
    setOverride({ id: conversationId, initial, value: next });
    try {
      const sent = queue.current.then(() =>
        withTimeout(messageService.setThreadMute(conversationId, next))
      );
      queue.current = sent.catch(() => undefined);
      await sent;
      confirmed.current = { id: conversationId, initial, value: next };
      if (endedCount.current !== endedAtStart && currentId.current === conversationId) {
        reconcileRef.current?.();
      }
    } catch (err) {
      if (call !== latestCall.current || currentId.current !== conversationId) return;
      if (next && (err as { status?: number } | null)?.status === 409) {
        refused.current.add(conversationId);
        confirmed.current = { id: conversationId, initial, value: false };
        setOverride({ id: conversationId, initial, value: false });
        toast.error("Finished threads can't be muted.");
        reconcileRef.current?.();
        return;
      }
      const back = confirmed.current?.id === conversationId ? confirmed.current.value : base;
      setOverride({ id: conversationId, initial, value: back });
      toast.error(next ? 'Could not mute this thread' : 'Could not unmute this thread', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [conversationId, initial, muted]);

  return { muted, toggle, available: initial !== undefined };
};
