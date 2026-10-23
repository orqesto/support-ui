/**
 * The row / card spine follows the thread's work status (Messages list v4 `spine()`), with the
 * SLA and spam marks on top: on staging 2026-10-23 most rows had no edge at all, because the
 * old rule lit only "the client replied last".
 */
import { describe, it, expect } from 'vitest';
import { getSpine } from '@/components/messages/inboxCardHelpers';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';

const msg = (over: Record<string, unknown> = {}): Message =>
  ({ id: 1, status: 'open', channel: 'email', metadata: {}, ...over }) as unknown as Message;
const thread = (latest: Message, lastReplyFromClient: boolean | null = null) =>
  ({ latestMessage: latest, lastReplyFromClient }) as unknown as MessageThread;
const spineOf = (over: Record<string, unknown>, lastReplyFromClient: boolean | null = null) => {
  const row = msg(over);
  return getSpine(row, thread(row, lastReplyFromClient));
};

describe('the spine says the work status', () => {
  it('open and in progress are ours: blue', () => {
    expect(spineOf({})).toBe('blue');
    expect(spineOf({}, true)).toBe('blue');
  });

  it('waiting on the customer or parked is calm', () => {
    expect(spineOf({}, false)).toBe('calm');
    expect(spineOf({ parkedAt: '2026-10-23T10:00:00Z' })).toBe('calm');
  });

  it('resolved is green', () => {
    expect(spineOf({ status: 'resolved' })).toBe('green');
  });

  it('triage mail has no work status, so no edge', () => {
    expect(spineOf({ status: 'filtered' })).toBe('none');
  });

  it('spam stays red whatever its status', () => {
    expect(spineOf({ isSpam: true })).toBe('red');
  });

  it('reads the status from the thread, not from the latest INBOUND message it is given', () => {
    // The card passes `latestIncomingMessage` for its signals; the status lives on the thread's
    // latest message, which the Status column reads — the two must not disagree.
    const inbound = msg({ status: 'open' });
    const latest = msg({ status: 'resolved' });
    expect(getSpine(inbound, thread(latest))).toBe('green');
  });
});
