import { describe, expect, it } from 'vitest';
import { resolveReplyBlock, type ReplyBlock } from '@/components/messages/replyBlockState';

/**
 * The composer's behaviour on a thread that cannot be answered from Odly (a
 * Zendesk-imported Telegram conversation).
 *
 * The whole point is to tell the agent BEFORE they write — the send would fail
 * anyway, and finding out after composing a reply is the failure this exists to
 * remove.
 */
const block = (over: Partial<ReplyBlock> = {}): ReplyBlock => ({
  reason: 'zendesk_imported_telegram',
  message: "This chat came from Zendesk and can't be answered from Odly — reply in Zendesk.",
  ...over,
});

describe('resolveReplyBlock', () => {
  it('does nothing when the payload carries no block — every ordinary thread', () => {
    // Absent = not applicable, per the same contract as whatsappWindow.
    expect(resolveReplyBlock(null, 'reply').blocked).toBe(false);
    expect(resolveReplyBlock(undefined, 'reply').notice).toBeNull();
  });

  it('blocks the reply composer and shows the server notice', () => {
    const message = 'This chat came from Zendesk; reply in Zendesk.';
    const state = resolveReplyBlock(block({ message }), 'reply');
    expect(state.blocked).toBe(true);
    expect(state.notice).toBe(message);
    expect(state.tone).toBe('blocked');
    // No countdown — the block is unconditional, not a closing window.
    expect(state.remaining).toBeNull();
  });

  it('NEVER blocks an internal note', () => {
    // A note is not delivered to the customer — blocking it would stop an agent
    // recording "answered in Zendesk" on exactly the threads this applies to.
    expect(resolveReplyBlock(block(), 'note').blocked).toBe(false);
  });

  it('ignores a malformed payload rather than blocking a workable reply', () => {
    // FE/BE skew guard: only trust a real message string.
    expect(
      resolveReplyBlock({ reason: 'x' } as unknown as ReplyBlock, 'reply').blocked
    ).toBe(false);
    expect(resolveReplyBlock(block({ message: '' }), 'reply').blocked).toBe(false);
  });
});
