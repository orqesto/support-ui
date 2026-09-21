import { CustomApiLookupPanel, NO_EMAIL_IDENTITY_NOTE } from './CustomApiLookupPanel';
import { LinkedThreads } from './LinkedThreads';
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
}: {
  message: Message;
  hasEmailIdentity: boolean;
  onChanged?: () => void;
}) => (
  <>
    {/* CA-3: nothing is fetched until the agent presses Look up (SC1). */}
    <CustomApiLookupPanel
      className="pt-1"
      conversationId={message.id}
      identityNote={hasEmailIdentity ? undefined : NO_EMAIL_IDENTITY_NOTE}
    />
    {/* TL-D1..D3. ⛔ Not a merge: both threads survive, and unlinking undoes it completely. */}
    <LinkedThreads message={message} onChanged={onChanged} />
  </>
);
