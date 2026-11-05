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
 * `serverEnds` is true while the thread is in a state that ends the person's mute on the backend
 * (resolved / closed / filtered, or assigned to them). When it turns true the mute shows as off at
 * once instead of waiting for the next read of the thread.
 */
export const useConversationMute = (
  conversationId: number,
  initial: boolean | undefined,
  serverEnds = false
) => {
  const [override, setOverride] = useState<Override | null>(null);
  const latestCall = useRef(0);
  const confirmed = useRef<{ id: number; initial: boolean | undefined; value: boolean } | null>(
    null
  );
  const currentId = useRef(conversationId);
  currentId.current = conversationId;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const endsBefore = useRef({ id: conversationId, ends: serverEnds });

  useEffect(() => {
    const before = endsBefore.current;
    endsBefore.current = { id: conversationId, ends: serverEnds };
    if (initial === undefined || before.id !== conversationId || before.ends || !serverEnds) return;
    // The backend just ended the mute (the thread was resolved, or assigned to this person).
    confirmed.current = { id: conversationId, initial, value: false };
    setOverride({ id: conversationId, initial, value: false });
  }, [conversationId, initial, serverEnds]);

  const active = override?.id === conversationId && override.initial === initial;
  const muted = active ? override.value : (initial ?? false);

  const toggle = useCallback(async () => {
    if (initial === undefined) return;
    const known = confirmed.current;
    const base = known?.id === conversationId && known.initial === initial ? known.value : initial;
    const next = !muted;
    const call = ++latestCall.current;
    setOverride({ id: conversationId, initial, value: next });
    try {
      const sent = queue.current.then(() => messageService.setThreadMute(conversationId, next));
      queue.current = sent.catch(() => undefined);
      await sent;
      confirmed.current = { id: conversationId, initial, value: next };
    } catch {
      if (call !== latestCall.current || currentId.current !== conversationId) return;
      const back = confirmed.current?.id === conversationId ? confirmed.current.value : base;
      setOverride({ id: conversationId, initial, value: back });
      toast.error(next ? 'Could not mute this thread' : 'Could not unmute this thread');
    }
  }, [conversationId, initial, muted]);

  return { muted, toggle, available: initial !== undefined };
};
