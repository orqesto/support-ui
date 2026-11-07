/**
 * The banner claims older history may be missing. It must not claim that about a thread THIS
 * PRODUCT started — an agent writing a direct message to a customer from Compose new.
 *
 * Owner, 2026-09-21: *"we can write direct messages to clients, not just reply, but i see [the
 * banner]"*. The old predicate was `sortedThread[0].type !== 'inbound'`, which knows nothing about
 * who wrote the message.
 */
import { describe, it, expect } from 'vitest';
import type { MessageEvent } from '@/types';
import { shouldShowHistoryBanner } from '../historyBanner';

const event = (over: Partial<MessageEvent> = {}): MessageEvent =>
  ({
    id: 1,
    conversationId: 7,
    type: 'agent_reply',
    content: 'hello',
    channel: 'email',
    createdAt: '2026-09-21T10:00:00Z',
    ...over,
  }) as MessageEvent;

describe('shouldShowHistoryBanner', () => {
  it('warns on an outbound-first thread we did NOT write — the case it exists for', () => {
    // Imported sent mail: no author, no repliedBy. 914 of these on staging, all agent_reply.
    expect(shouldShowHistoryBanner([event()])).toBe(true);
  });

  it('🔴 stays silent on a thread started from Compose new', () => {
    // composeNewService stamps authorId on the event it creates.
    expect(shouldShowHistoryBanner([event({ authorId: 3 })])).toBe(false);
  });

  it('stays silent when only metadata.repliedBy identifies the sender', () => {
    // 3 rows on staging carry repliedBy with a NULL author_id, so both halves of the backend's
    // predicate are load-bearing — matching it here is the point.
    expect(shouldShowHistoryBanner([event({ metadata: { repliedBy: 'someone@odly.ai' } })])).toBe(
      false
    );
  });

  it('never warns when the customer wrote first, authored or not', () => {
    expect(shouldShowHistoryBanner([event({ type: 'inbound' })])).toBe(false);
    expect(shouldShowHistoryBanner([event({ type: 'inbound', authorId: 3 })])).toBe(false);
  });

  it('judges the FIRST message, not a later one', () => {
    // A composed thread the customer answered and an agent replied to again still has an
    // app-authored first event; an imported thread does not become trustworthy because a later
    // reply was authored here.
    expect(
      shouldShowHistoryBanner([event({ authorId: 3 }), event({ id: 2, type: 'inbound' })])
    ).toBe(false);
    expect(shouldShowHistoryBanner([event(), event({ id: 2, authorId: 3 })])).toBe(true);
  });

  it('says nothing about an empty thread', () => {
    // The thread list loads asynchronously; an empty array is "not loaded yet", not "outbound".
    expect(shouldShowHistoryBanner([])).toBe(false);
  });

  it('treats a null author as unauthored, not as a truthy object', () => {
    expect(shouldShowHistoryBanner([event({ authorId: null, metadata: null })])).toBe(true);
  });
});
