import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { messageService } from '@/services/message.service';
import type { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import type { Message } from '@/types';

export type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];

/**
 * The lead state shown for `message` — its own, or the newest one recorded on any event
 * in its thread.
 *
 * Lifted out of `MessageDetail` unchanged except for the `cancelled` guard, which it was
 * the only per-message effect there to lack. Without it the resolution for customer A's
 * thread, arriving after the agent had already opened customer B, was written into B's
 * panel — a cross-customer race that the sibling thread/notes/attachments effects all
 * guard against with exactly this pattern.
 */
export const useLeadState = (
  message: Pick<Message, 'id' | 'isLead' | 'metadata'>
): [LeadState | null, Dispatch<SetStateAction<LeadState | null>>] => {
  const [leadState, setLeadState] = useState<LeadState | null>(null);

  useEffect(() => {
    if (!message.isLead) {
      setLeadState(null);
      return;
    }
    let cancelled = false;
    const ownState = message.metadata?.leadState as LeadState | undefined;
    if (ownState) setLeadState(ownState);
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...(res.data ?? [])].sort((itemA, itemB) => itemB.id - itemA.id);
        for (const msg of sorted) {
          const stat = (msg.metadata as { leadState?: LeadState } | null)?.leadState;
          if (stat) {
            setLeadState(stat);
            return;
          }
        }
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.isLead, message.metadata]);

  return [leadState, setLeadState];
};
