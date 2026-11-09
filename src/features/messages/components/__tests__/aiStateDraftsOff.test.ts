import { describe, expect, it } from 'vitest';
import { getAiState } from '../inboxCardHelpers';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';

/**
 * "AI suggested — review and send" on a card points at a stored draft. With AI drafts off that
 * draft is no longer offered anywhere, so the card must not send the agent looking for it.
 */
const message = {
  id: 1,
  needsHumanReview: true,
  metadata: { suggestedAnswer: { answer: 'A stored draft.' } },
} as unknown as Message;
const thread = { isLead: false } as unknown as MessageThread;

describe('getAiState — AI drafts off', () => {
  it('reads "Needs review", not "AI suggested", with drafts off', () => {
    expect(getAiState(message, thread, true)?.label).toBe('Needs review');
  });

  it('still reads "AI suggested" with drafts on (control)', () => {
    expect(getAiState(message, thread)?.label).toBe('AI suggested');
    expect(getAiState(message, thread, false)?.label).toBe('AI suggested');
  });
});
