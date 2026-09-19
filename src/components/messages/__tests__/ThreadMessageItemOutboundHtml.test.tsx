/**
 * An outbound message must render the markup the CUSTOMER received.
 *
 * ⛔ It did not. `wantsHtml` excluded outbound entirely, on the reasoning that the console
 * "already holds what we sent" — but what it holds is `content`, the derived plain text. On
 * staging's SOM-INF-1579 an agent reply whose stored markup carries 76 images rendered as a
 * blank blue bubble: the quotation the customer received, shown to the agent as an empty box.
 *
 * These assert the WIRING — which id is fetched and whether the fetch is enabled — because the
 * defect was in the enabled flag, and every existing ThreadMessageItem suite stubs the hook to
 * return null and so could never see it.
 *
 * ⛔ The surviving exclusion — a requested TRANSLATION still beats the original markup — is not
 * re-asserted here. `ThreadMessageItemTranslate.test.tsx` already drives it properly, by
 * clicking translate and checking what ends up on screen. A version of it in this file could
 * only have checked the `enabled` argument, which is a weaker claim wearing the same name.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

const calls: { eventId: number | undefined; enabled: boolean }[] = [];
let htmlForNext: string | null = null;

vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: (eventId: number | undefined, enabled: boolean) => {
    calls.push({ eventId, enabled });
    return { data: enabled ? htmlForNext : null, isLoading: false };
  },
}));

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(() => {
  cleanup();
  calls.length = 0;
  htmlForNext = null;
});

const message = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 42,
    conversationId: 10,
    type: 'agent_reply',
    content: 'Quotation attached',
    authorId: 7,
    authorEmail: 'info@example.test',
    authorName: 'Mia Taco',
    channel: 'email',
    sentAt: '2026-08-18T17:50:00Z',
    createdAt: '2026-08-18T17:50:00Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

describe('ThreadMessageItem — outbound renders what the customer received', () => {
  it('asks for the html of an OUTBOUND message', () => {
    render(<ThreadMessageItem msg={message({ type: 'agent_reply' })} />);
    expect(calls.at(-1)).toEqual({ eventId: 42, enabled: true });
  });

  it('still asks for it on inbound', () => {
    render(<ThreadMessageItem msg={message({ type: 'inbound' })} />);
    expect(calls.at(-1)?.enabled).toBe(true);
  });

  it('renders the sent markup rather than the derived text', () => {
    htmlForNext = '<table><tr><td>Quotation</td><td>£1,240.00</td></tr></table>';
    const { container } = render(<ThreadMessageItem msg={message({})} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getByText('£1,240.00')).toBeTruthy();
  });
});
