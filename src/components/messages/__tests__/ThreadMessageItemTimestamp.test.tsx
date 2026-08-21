/**
 * The thread bubble must show WHEN a message was sent, not only how long ago.
 *
 * #182 introduced formatWhen() ("18 Aug 17:50 · 2d") and applied it to the inbox row
 * and MessageThread, but not to ThreadMessageItem — the bubble in the ticket detail
 * view, which is where someone actually reads a conversation. It kept rendering
 * relativeTime(), so the detail view still said only "18h ago". Reported from prod.
 *
 * Asserted on rendered output rather than on the helper: formatWhen already has its own
 * tests, and what broke here was a component not calling it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const baseEvent = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 1,
    conversationId: 10,
    type: 'inbound',
    content: 'issue with login',
    authorId: null,
    authorEmail: 'customer@example.com',
    channel: 'email',
    sentAt: '2026-08-18T17:50:00Z',
    createdAt: '2026-08-18T17:50:00Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

/**
 * "18 Aug 17:50 · 2d", or "Aug 18, 08:50 PM · 2d" — formatWhen uses the viewer's locale,
 * so the field order and clock convention differ by machine and by CI. Match a month
 * name, a clock time and the separator without pinning their arrangement; anchoring on
 * one locale's output would fail on the other for no real reason.
 */
const ABSOLUTE_STAMP = /[A-Za-z]{3}[^·]*\d{1,2}:\d{2}[^·]*·/;

describe('ThreadMessageItem — timestamp', () => {
  it('shows an absolute stamp on a customer bubble, not only a relative age', () => {
    render(<ThreadMessageItem msg={baseEvent({})} />);
    expect(screen.getByText(ABSOLUTE_STAMP)).toBeTruthy();
  });

  it('shows one on an agent bubble too', () => {
    render(
      <ThreadMessageItem
        msg={baseEvent({ type: 'agent_reply', authorEmail: 'agent@company.com' })}
      />
    );
    expect(screen.getByText(ABSOLUTE_STAMP)).toBeTruthy();
  });

  it('keeps the relative age alongside it', () => {
    // The relative part is what makes recency scannable; the fix adds to it rather
    // than replacing it, so losing either half is a regression.
    render(<ThreadMessageItem msg={baseEvent({})} />);
    expect(screen.getByText(/·\s*\d+\s*\w/)).toBeTruthy();
  });

  it('carries the full timestamp on the title attribute for hover', () => {
    render(<ThreadMessageItem msg={baseEvent({})} />);
    const stamp = screen.getByText(ABSOLUTE_STAMP);
    expect(stamp.getAttribute('title')).toBeTruthy();
  });
});
