/**
 * The Q&A pair view must name the customer too.
 *
 * This is the surface the first pass at the relay label MISSED. `ThreadMessageItem` was
 * fixed and shipped while this component kept rendering `authorEmail` bare, so the same
 * message read as the customer in one place and as `"Orbelli (Shopify)"
 * <mailer@shopify.com>` in the other. A unit test of the shared reader would not have
 * caught that — only a test that renders THIS component does, which is why it exists.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MessageThread } from '../MessageThread';

const getThreadMessages = vi.fn();

vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreadMessages: (...args: unknown[]) => getThreadMessages(...args) as unknown,
  },
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const inbound = (metadata: Record<string, unknown> | null) => ({
  id: 27112,
  conversationId: 8435,
  type: 'inbound',
  content: 'hi, which supplement is right for me?',
  authorId: null,
  authorEmail: '"Orbelli (Shopify)" <mailer@shopify.com>',
  authorName: null,
  channel: 'email',
  sentAt: '2026-08-25T15:51:25Z',
  createdAt: '2026-08-26T05:27:18Z',
  metadata,
  recipients: null,
});

describe('MessageThread — the customer behind a relay', () => {
  it('names the person who wrote it, and what it arrived through', async () => {
    getThreadMessages.mockResolvedValue({
      data: [inbound({ relayedFrom: { email: 'safina.pathaan@gmail.com', name: 'safina patha' } })],
    });

    render(<MessageThread messageId={8435} />);

    expect(await screen.findByText(/safina patha/)).toBeTruthy();
    expect(screen.getByText(/via mailer@shopify\.com/)).toBeTruthy();
  });

  it('leaves ordinary customer mail exactly as it was', async () => {
    // CONTROL. Without it, "renders the customer" would pass on an implementation that
    // rewrote every pair header.
    getThreadMessages.mockResolvedValue({
      data: [{ ...inbound(null), authorEmail: 'mark@hotmail.com' }],
    });

    render(<MessageThread messageId={8519} />);

    await waitFor(() => expect(screen.getByText('mark@hotmail.com')).toBeTruthy());
    expect(screen.queryByText(/· via /)).toBeNull();
  });
});
