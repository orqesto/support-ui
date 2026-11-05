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
 * - `ended`: the mute is gone for good (the thread was resolved, or assigned to this person; a reopen
 *   afterwards is a new start). When it turns true the mute shows as off and stays off until the
 *   server says otherwise.
 * - `suspended`: closed / filtered threads pause a mute without deleting it. The stored state keeps
 *   showing (`muted` is unchanged) and `suspended` is returned so the screen can say it is paused;
 *   `toggle` does nothing meanwhile, so one click never means a request with no visible change.
 * - `onReconcile`: called when a mute call answered AFTER `ended` turned true. The reply cannot say
 *   whether the assignment or the call came last, so the thread is read again.
 *
 * A call that hangs gives up after `CALL_TIMEOUT_MS`, so it cannot hold up later toggles.
 */
export const CALL_TIMEOUT_MS = 15_000;

export type MuteThreadState = { ended?: boolean; suspended?: boolean; onReconcile?: () => void };

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
  const { ended = false, suspended = false } = thread;
  const reconcileRef = useRef(thread.onReconcile);
  reconcileRef.current = thread.onReconcile;
  // Counts the times the backend ended the mute while this hook was mounted.
  const endedCount = useRef(0);
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
    const before = endsBefore.current;
    endsBefore.current = { id: conversationId, ends: ended };
    if (initial === undefined || before.id !== conversationId || before.ends || !ended) return;
    endedCount.current += 1;
    // The backend just ended the mute (the thread was resolved, or assigned to this person).
    confirmed.current = { id: conversationId, initial, value: false };
    setOverride({ id: conversationId, initial, value: false });
  }, [conversationId, initial, ended]);

  const active = override?.id === conversationId && override.initial === initial;
  const muted = active ? override.value : (initial ?? false);

  const toggle = useCallback(async () => {
    if (initial === undefined || suspended) return;
    const known = confirmed.current;
    const base = known?.id === conversationId && known.initial === initial ? known.value : initial;
    const next = !muted;
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
    } catch {
      if (call !== latestCall.current || currentId.current !== conversationId) return;
      const back = confirmed.current?.id === conversationId ? confirmed.current.value : base;
      setOverride({ id: conversationId, initial, value: back });
      toast.error(next ? 'Could not mute this thread' : 'Could not unmute this thread');
    }
  }, [conversationId, initial, muted, suspended]);

  return { muted, suspended, toggle, available: initial !== undefined };
};
