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

  it('the receipt confirmation (stamped `acknowledgmentReply`, with no `isAutoReply`) is marked as one', () => {
    render(
      <ThreadMessageItem
        msg={event({ metadata: { acknowledgmentReply: true, sourceId: 4 } as never })}
      />
    );
    expect(mark()?.textContent).toBe('Sent automatically · receipt confirmation');
  });

  it('the receipt confirmation is also known by `source: acknowledgment` alone', () => {
    render(<ThreadMessageItem msg={event({ metadata: { source: 'acknowledgment' } as never })} />);
    expect(mark()?.textContent).toBe('Sent automatically · receipt confirmation');
  });

  it('says why the reply was allowed to go, in its description, when the event says', () => {
    render(
      <ThreadMessageItem
        msg={event({
          metadata: {
            isAutoReply: true,
            repliedByAI: true,
            source: 'documentation',
            allowedBy: { gate: 'passed', confidence: 0.93, threshold: 0.9 },
          } as never,
        })}
      />
    );
    expect(mark()?.getAttribute('title')).toContain(
      'Allowed because it passed the check every automatic reply goes through (confidence 93%, needed 90%).'
    );
  });

  it('a keyword rule’s fixed text says so; CONTROL: an event that does not say gives no reason', () => {
    render(
      <ThreadMessageItem
        msg={event({
          metadata: {
            isAutoReply: true,
            source: 'keyword_rule',
            keywordRule: { id: 3, name: 'Refunds' },
            allowedBy: { gate: 'fixed_text' },
          } as never,
        })}
      />
    );
    expect(mark()?.getAttribute('title')).toContain(
      'Allowed because a fixed text written by your team, sent as it is.'
    );
    cleanup();
    render(<ThreadMessageItem msg={event({ metadata: { isAutoReply: true } as never })} />);
    expect(mark()?.getAttribute('title')).not.toContain('Allowed because');
  });

  it('templated mail the backend’s email service recorded is not called AI-written', () => {
    render(
      <ThreadMessageItem
        msg={event({
          metadata: { isAutoReply: true, repliedByAI: true, source: 'email_service' } as never,
        })}
      />
    );
    expect(mark()?.textContent).toBe('Sent automatically');
  });

  it('a bot’s reply with no stamp at all still gets the plain mark', () => {
    render(<ThreadMessageItem msg={event({ metadata: null })} />);
    expect(mark()?.textContent).toBe('Sent automatically');
  });

  it.each([
    ['a person’s reply', event({ type: 'agent_reply', authorName: 'Ada', metadata: {} as never })],
    [
      'a person’s reply with a stamp that is not `true`',
      event({ type: 'agent_reply', metadata: { isAutoReply: 'yes' } as never }),
    ],
    [
      'a customer’s message, even if stamped',
      event({
        type: 'inbound',
        metadata: { isAutoReply: true, acknowledgmentReply: true } as never,
      }),
    ],
  ])('CONTROL: %s → no mark', (_name, msg) => {
    render(<ThreadMessageItem msg={msg} />);
    expect(mark()).toBeNull();
  });
});
