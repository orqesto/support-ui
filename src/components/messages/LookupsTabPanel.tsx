import { CustomApiLookupPanel, NO_EMAIL_IDENTITY_NOTE } from './CustomApiLookupPanel';
import { PHONE_CONTACT } from './messageDetailConstants';
import type { AddOutcome } from './useAiRecordNote';
import type { Message } from '@/types';

/**
 * The LOOKUPS tab (spec 2026-10-09): the connected-system lookups, moved out of the Customer tab.
 * CA-3: nothing is fetched until the agent presses Look up (SC1).
 */
export const LookupsTabPanel = ({
  message,
  hasEmailIdentity,
  onUseInReply,
}: {
  message: Message;
  hasEmailIdentity: boolean;
  /** L2 P4: a record joins the agent's note for the AI draft. It answers added / duplicate / full. */
  onUseInReply?: (note: string) => AddOutcome;
}) => (
  <div data-testid="lookups-tab-panel" className={`space-y-2 ${PHONE_CONTACT}`}>
    <CustomApiLookupPanel
      className="pt-1"
      conversationId={message.id}
      identityNote={hasEmailIdentity ? undefined : NO_EMAIL_IDENTITY_NOTE}
      onUseInReply={onUseInReply}
    />
  </div>
);
