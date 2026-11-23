/**
 * A reply that went out on its own is marked on its bubble — "Sent automatically", and who wrote
 * it when the event says so (the AI, or a keyword rule) — from the stamp the backend puts on the
 * event (`metadata.isAutoReply`). A person's reply and a customer's message carry no mark.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/features/messages/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

afterEach(cleanup);

const event = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 501,
    conversationId: 77,
    type: 'bot_reply',
    content: 'Your parcel ships tomorrow.',
    authorId: null,
    authorEmail: 'help@shop.example',
    authorName: null,
    authorUserEmail: null,
    channel: 'email',
    sentAt: '2026-11-20T14:41:26Z',
    createdAt: '2026-11-20T14:45:33Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;
const mark = () => screen.queryByTestId('auto-sent-mark');

describe('ThreadMessageItem — a reply sent automatically', () => {
  it('an AI-written reply says so', () => {
    render(
      <ThreadMessageItem
        msg={event({ metadata: { isAutoReply: true, repliedByAI: true, source: 'kb' } as never })}
      />
    );
    expect(mark()?.textContent).toBe('Sent automatically · AI-written');
  });

  it('a keyword rule’s reply says so, and names the rule in its description', () => {
    render(
      <ThreadMessageItem
        msg={event({
          metadata: {
            isAutoReply: true,
            source: 'keyword_rule',
            keywordRule: { id: 3, name: 'Refunds', keyword: 'refund' },
          } as never,
        })}
      />
    );
    expect(mark()?.textContent).toBe('Sent automatically · keyword rule');
    expect(mark()?.getAttribute('title')).toContain('Keyword rule "Refunds"');
  });

  it('an automatic reply that names no writer gets the plain mark', () => {
    render(
      <ThreadMessageItem
        msg={event({ channel: 'telegram', metadata: { isAutoReply: true } as never })}
      />
    );
    expect(mark()?.textContent).toBe('Sent automatically');
  });

  it.each([
    ['a person’s reply', event({ type: 'agent_reply', authorName: 'Ada', metadata: {} as never })],
    ['a reply with no stamp', event({ metadata: null })],
    ['a stamp that is not `true`', event({ metadata: { isAutoReply: 'yes' } as never })],
    [
      'a customer’s message, even if stamped',
      event({ type: 'inbound', metadata: { isAutoReply: true } as never }),
    ],
  ])('CONTROL: %s → no mark', (_name, msg) => {
    render(<ThreadMessageItem msg={msg} />);
    expect(mark()).toBeNull();
  });
});
