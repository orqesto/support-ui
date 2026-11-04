import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  subscribeToEvent,
  unsubscribeFromEvent,
  getSocket,
  releaseSocket,
} from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';

// A short pop-up for the four personal kinds, from the per-user `notification:new` event. The
// backend already applies OFF, mute and working hours to its recipients, so nothing is filtered
// here except what is not ours to show: other workspaces, team/admin kinds, the content-free
// workspace ping (it has no notification id), repeats, and a hidden tab (the tab-title count and
// the bell still update).
const TOAST_COPY: Record<string, string> = {
  conversation_assigned: 'Assigned to you',
  customer_message_on_assigned: 'Customer replied',
  conversation_reopened: 'Thread reopened',
  hold_recheck_due: 'Time to recheck',
};

type Payload = {
  kind?: unknown;
  organizationId?: unknown;
  id?: unknown;
  conversationId?: unknown;
  title?: unknown;
};

// Module level: one bell, but a remount (workspace switch, layout change) must not toast again.
const toasted = new Set<number>();
const MAX_REMEMBERED = 200;
export const resetNotificationToastDedupe = (): void => toasted.clear();

export const useNotificationToast = (): void => {
  const navigate = useNavigate();
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  useEffect(() => {
    if (!getSocket()) return;
    const onNew = (data?: unknown) => {
      const payload = (data ?? {}) as Payload;
      const { kind, id, organizationId, conversationId, title } = payload;
      // Only the new backend sends `conversationId` (a number, or null). It is also the one that
      // applies mute / OFF / working hours, so no key = an older backend: no toast, or a muted or
      // switched-off kind would pop up anyway. The bell and the tab count still update.
      if (!('conversationId' in payload)) return;
      if (typeof id !== 'number' || typeof kind !== 'string') return;
      const label = TOAST_COPY[kind];
      if (!label) return;
      if (organizationId !== orgKey) return;
      if (toasted.has(id)) return;
      if (document.visibilityState === 'hidden') return;
      toasted.add(id);
      if (toasted.size > MAX_REMEMBERED) toasted.delete(toasted.values().next().value as number);
      const text = typeof title === 'string' && title.trim() !== '' ? `${label}: ${title}` : label;
      toast(
        text,
        typeof conversationId === 'number'
          ? { action: { label: 'Open', onClick: () => navigate(`/threads/${conversationId}`) } }
          : undefined
      );
    };
    subscribeToEvent('notification:new', onNew);
    return () => {
      unsubscribeFromEvent('notification:new', onNew);
      releaseSocket();
    };
  }, [orgKey, navigate]);
};
