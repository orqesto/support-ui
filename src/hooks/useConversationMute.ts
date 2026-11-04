import { useCallback, useRef, useState } from 'react';
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
 */
export const useConversationMute = (conversationId: number, initial: boolean | undefined) => {
  const [override, setOverride] = useState<Override | null>(null);
  const latestCall = useRef(0);
  const confirmed = useRef<{ id: number; initial: boolean | undefined; value: boolean } | null>(
    null
  );
  const currentId = useRef(conversationId);
  currentId.current = conversationId;

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
      await messageService.setThreadMute(conversationId, next);
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
