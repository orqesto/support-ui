/**
 * A customer bubble says when the team was only copied, was not a recipient at all, or when the
 * "customer" is one of our own colleagues (`metadata.envelope`, stamped by the backend from
 * 2026-10-20). Such mail stays in the inbox but runs no SLA clock and rings nobody, so the agent
 * needs to see why. Mail without the stamp — older mail, other channels — must look as before.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const event = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 501,
    conversationId: 77,
    type: 'inbound',
    content: 'Could you send the examples before Thursday?',
    authorId: null,
    authorEmail: 'partner@partner.example',
    authorName: null,
    authorUserEmail: null,
    channel: 'email',
    sentAt: '2026-10-20T14:41:26Z',
    createdAt: '2026-10-20T14:45:33Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

const withEnvelope = (envelope: unknown, over: Partial<MessageEvent> = {}) =>
  event({ metadata: { envelope } as never, ...over });

describe('ThreadMessageItem — mail not written to the team', () => {
  it.each([
    [{ position: 'cc', senderIsColleague: false }, "You're on Cc"],
    [{ position: 'not_listed', senderIsColleague: false }, 'Not a recipient'],
    [{ position: 'cc', senderIsColleague: true }, 'Colleague'],
  ])('%o → "%s"', (envelope, label) => {
    render(<ThreadMessageItem msg={withEnvelope(envelope)} />);
    expect(screen.getByTestId('envelope-badge').textContent).toBe(label);
  });

  it.each([
    ['addressed to the team', withEnvelope({ position: 'to', senderIsColleague: false })],
    ['no envelope (older mail, chat)', event({})],
    ['a malformed envelope', withEnvelope({ position: 'bcc' })],
  ])('CONTROL: %s → no badge', (_name, msg) => {
    render(<ThreadMessageItem msg={msg} />);
    expect(screen.queryByTestId('envelope-badge')).toBeNull();
  });
});
