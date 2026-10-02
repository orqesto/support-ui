/**
 * A bubble asks for its original markup only once it is near the screen.
 *
 * DEU-SUP-7750, 2026-10-02: a mailer-daemon Gmail thread of 1,887 messages fetched 1,887
 * markups on open, spent the API limiter (1,000 a minute) in seconds, and every other request
 * of the browser answered 429 for the rest of the minute.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MessageEvent } from '@/types';

const getMessageHtml = vi.fn<(eventId: number) => Promise<string | null>>();
vi.mock('@/services/message-html.service', () => ({
  getMessageHtml: (eventId: number) => getMessageHtml(eventId),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { callback: Callback; observed: Element[] }[] = [];
class FakeObserver {
  observed: Element[] = [];
  constructor(public callback: Callback) {
    observers.push({ callback, observed: this.observed });
  }
  observe(node: Element) {
    this.observed.push(node);
  }
  disconnect() {}
  unobserve() {}
}

const { ThreadMessageItem } = await import('../ThreadMessageItem');

const event = (id: number, type: 'inbound' | 'agent_reply' = 'inbound') =>
  ({
    id,
    type,
    content: `body ${id}`,
    authorEmail: type === 'inbound' ? 'ada@example.com' : 'support@acme.test',
    createdAt: '2026-09-22T10:00:00Z',
    metadata: {},
  }) as unknown as MessageEvent;

const renderBubbles = (events: MessageEvent[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {events.map((msg) => (
        <ThreadMessageItem key={msg.id} msg={msg} />
      ))}
    </QueryClientProvider>
  );
};

beforeEach(() => {
  getMessageHtml.mockReset().mockResolvedValue('<p>markup</p>');
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('thread bubbles fetch their markup on sight, not on mount', () => {
  it('nothing is fetched for bubbles that have not come near the screen', async () => {
    renderBubbles([event(1), event(2, 'agent_reply'), event(3)]);
    expect(screen.getByText('body 1')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getMessageHtml).not.toHaveBeenCalled();
    // One observer per bubble, each watching its own root.
    expect(observers).toHaveLength(3);
  });

  it('the bubble that scrolls into view fetches its markup — that one only', async () => {
    renderBubbles([event(1), event(2, 'agent_reply'), event(3)]);
    act(() => observers[2].callback([{ isIntersecting: true }]));
    await waitFor(() => expect(getMessageHtml).toHaveBeenCalledWith(3));
    expect(getMessageHtml).toHaveBeenCalledTimes(1);
    // Both directions: an agent reply near the screen fetches too (its markup is what the
    // customer received — ThreadMessageItem's own reasoning).
    act(() => observers[1].callback([{ isIntersecting: true }]));
    await waitFor(() => expect(getMessageHtml).toHaveBeenCalledWith(2));
    expect(getMessageHtml).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: without IntersectionObserver every bubble fetches, as before this existed', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    renderBubbles([event(1), event(2)]);
    await waitFor(() => expect(getMessageHtml).toHaveBeenCalledTimes(2));
  });
});
