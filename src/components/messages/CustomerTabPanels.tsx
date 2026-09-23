import { CustomApiLookupPanel, NO_EMAIL_IDENTITY_NOTE } from './CustomApiLookupPanel';
import { LinkedThreads } from './LinkedThreads';
import type { AddOutcome } from './useAiRecordNote';
import type { Message } from '@/types';

/**
 * The two per-conversation panels on the CUSTOMER tab, extracted so `MessagePanelTabs` stays
 * inside its 650-line cap rather than the cap deciding what the tab may contain.
 *
 * Both belong to the customer rather than the thread body: what the connected systems know about
 * them (CA-3), and which OTHER threads are the same piece of their work (TL-D1..D3).
 */
export const CustomerTabPanels = ({
  message,
  hasEmailIdentity,
  onChanged,
  onUseInReply,
}: {
  message: Message;
  hasEmailIdentity: boolean;
  onChanged?: () => void;
  /** L2 P4: a record joins the agent's note for the AI draft. It answers added / duplicate / full. */
  onUseInReply?: (note: string) => AddOutcome;
}) => (
  <>
    {/* CA-3: nothing is fetched until the agent presses Look up (SC1). */}
    <CustomApiLookupPanel
      className="pt-1"
      conversationId={message.id}
      identityNote={hasEmailIdentity ? undefined : NO_EMAIL_IDENTITY_NOTE}
      onUseInReply={onUseInReply}
    />
    {/* TL-D1..D3. ⛔ Not a merge: both threads survive, and unlinking undoes it completely. */}
    <LinkedThreads message={message} onChanged={onChanged} />
  </>
);
