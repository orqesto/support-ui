/**
 * A customer bubble must name the CUSTOMER, even when a relay sent the mail.
 *
 * A website contact form mails the shop from its own address — `mailer@shopify.com`,
 * or the shop's own mailbox — and puts the person only in the body. The bubble
 * rendered `authorEmail` bare, so the message from Safina read as though Shopify had
 * written it, and the one fact a reader needs (who is this?) was the one missing.
 *
 * The BE recovers the person and stamps `relayedFrom` on the EVENT — per message,
 * because one thread can hold submissions from several different people. This renders
 * both facts: who wrote it, and what it came through.
 *
 * ⛔ The controls matter more than the happy path here. `relayedFrom` is also stamped by
 * the history repair on rows recovered from the envelope ITSELF, and those must not
 * render "someone · via someone". Ordinary mail must be left exactly as it was.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const inbound = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 27112,
    conversationId: 8435,
    type: 'inbound',
    content: 'hi i have newly been diagnosed and i dont know what supplement is good for me',
    authorId: null,
    authorEmail: '"Orbelli (Shopify)" <mailer@shopify.com>',
    authorName: null,
    authorUserEmail: null,
    channel: 'email',
    sentAt: '2026-08-25T15:51:25Z',
    createdAt: '2026-08-26T05:27:18Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

const relayed = (name: string | null, email = 'safina.pathaan@gmail.com') =>
  inbound({ metadata: { relayedFrom: { email, name, via: 'body-email-label' } } });

describe('ThreadMessageItem — mail that arrived through a relay', () => {
  it('names the person who wrote it', () => {
    render(<ThreadMessageItem msg={relayed('safina patha')} />);
    expect(screen.getByText('safina patha')).toBeTruthy();
  });

  it('still says what it came through, so the header is not hidden', () => {
    render(<ThreadMessageItem msg={relayed('safina patha')} />);
    expect(screen.getByText(/via mailer@shopify\.com/)).toBeTruthy();
  });

  it('falls back to the address when the form carried no name', () => {
    render(<ThreadMessageItem msg={relayed(null)} />);
    expect(screen.getByText('safina.pathaan@gmail.com')).toBeTruthy();
  });

  it('treats a blank name as absent rather than rendering an empty author', () => {
    render(<ThreadMessageItem msg={relayed('   ')} />);
    expect(screen.getByText('safina.pathaan@gmail.com')).toBeTruthy();
  });

  it('leaves ordinary customer mail exactly as it was', () => {
    // CONTROL. Without this, "renders the customer" would pass on an implementation
    // that rewrote every bubble.
    render(
      <ThreadMessageItem msg={inbound({ authorEmail: 'mark@hotmail.com', metadata: null })} />
    );
    expect(screen.getByText('mark@hotmail.com')).toBeTruthy();
    expect(screen.queryByText(/via /)).toBeNull();
  });

  it('does not say "via" when the stamped person IS the envelope sender', () => {
    // The second control, and the one a reviewer would not think to ask for: the history
    // repair stamps `relayedFrom` on rows whose correspondent came from the envelope
    // itself (`inbound-author-backfill`). Those are already correct — the label would be
    // pure noise, "mark@hotmail.com · via mark@hotmail.com".
    render(
      <ThreadMessageItem
        msg={inbound({
          authorEmail: 'mark sommerford <mark@hotmail.com>',
          metadata: { relayedFrom: { email: 'MARK@hotmail.com', via: 'inbound-author-backfill' } },
        })}
      />
    );
    expect(screen.queryByText(/via /)).toBeNull();
  });
});
