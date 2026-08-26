/**
 * An agent bubble must say WHO on the team replied.
 *
 * The thread already rendered `authorEmail`, which reads like an answer and is not
 * one: it holds the INTEGRATION's address — the From: the customer sees — so every
 * agent on a shared mailbox produced the identical line, and a conversation read as
 * though the mailbox had answered itself. The person is `authorId`, which the BE now
 * resolves to `authorName`.
 *
 * The fallback matters as much as the name: `authorName` is null for AI and automated
 * replies and for mail imported from the mailbox rather than sent through the app.
 * Labelling one of those with a person's name would be a worse bug than the one being
 * fixed, so it is asserted here rather than left to review.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const agentReply = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 1,
    conversationId: 10,
    type: 'agent_reply',
    content: 'here are the bank details',
    authorId: 7,
    authorEmail: 'info@coresarms.co.uk',
    authorName: 'Mia Taco',
    authorUserEmail: 'mia@coresarms.co.uk',
    channel: 'email',
    sentAt: '2026-08-18T17:50:00Z',
    createdAt: '2026-08-18T17:50:00Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

describe('ThreadMessageItem — reply authorship', () => {
  it('names the agent who sent the reply', () => {
    render(<ThreadMessageItem msg={agentReply({})} />);
    expect(screen.getByText('Mia Taco')).toBeTruthy();
  });

  it('still shows the mailbox the customer saw it come from', () => {
    // Both facts, not one replacing the other: the agent needs to know which of the
    // org's addresses the customer received this on.
    render(<ThreadMessageItem msg={agentReply({})} />);
    expect(screen.getByText(/info@coresarms\.co\.uk/)).toBeTruthy();
  });

  it('falls back to the mailbox when no person is resolved', () => {
    // AI/automated replies and imported mail: authorId is null, so authorName is too.
    render(<ThreadMessageItem msg={agentReply({ authorId: null, authorName: null })} />);
    expect(screen.getByText('info@coresarms.co.uk')).toBeTruthy();
    expect(screen.queryByText('Mia Taco')).toBeNull();
  });

  it('treats a blank name as no name rather than rendering an empty author', () => {
    render(<ThreadMessageItem msg={agentReply({ authorName: '   ' })} />);
    expect(screen.getByText('info@coresarms.co.uk')).toBeTruthy();
  });

  it('uses the person for the avatar initials once one is known', () => {
    // Initials taken from a shared mailbox are identical for every agent on it —
    // the same failure the header line fixes.
    const { container } = render(<ThreadMessageItem msg={agentReply({})} />);
    expect(container.textContent).toContain('MT');
  });
});
