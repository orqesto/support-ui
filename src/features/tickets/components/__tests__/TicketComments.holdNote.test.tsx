/**
 * A hold note (`source: 'hold'`, written by the backend when a thread goes on or comes off hold)
 * reaching a ticket's comments is violet and offers no edit or delete — even to an admin, who may
 * edit any other comment. An ordinary internal comment keeps its amber note look and its actions.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { TicketComments } from '../TicketComments';
import { commentsService, type Comment } from '@/features/tickets/services/comments.service';
import { useAuthStore } from '@/stores/authStore';
import { subscribeToEvent } from '@/lib/socketManager';
import { StatusDot } from '../list/ticketRowBits';
import type { User } from '@/types';

vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));

const base: Comment = {
  id: 1,
  ticketId: 5,
  userId: 9,
  authorName: 'Sam Agent',
  content: '<p>Called them back</p>',
  isInternal: true,
  externalId: null,
  source: 'app',
  createdAt: '2026-11-09T09:00:00Z',
  updatedAt: '2026-11-09T09:00:00Z',
  metadata: null,
  user: null,
};
const hold: Comment = {
  ...base,
  id: 2,
  // The backend writes a hold note as plain text, never editor HTML.
  content: 'On hold until 12 Nov 2026: waiting for supplier',
  source: 'hold',
  metadata: { kind: 'hold', reason: 'waiting for supplier', until: '2026-11-12T12:00:00Z' },
};

const renderWith = async (comments: Comment[]) => {
  vi.spyOn(commentsService, 'getAll').mockResolvedValue({ success: true, data: comments });
  render(<TicketComments ticketId={5} hasJiraLink={false} />);
  return screen.findAllByRole('listitem');
};

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: { id: 9, role: 'admin' } as User });
});

describe('TicketComments — hold notes', () => {
  it('🔴 a hold note is violet with no edit/delete, even for an admin', async () => {
    const [item] = await renderWith([hold]);
    expect(item.className).toContain('bg-pending-muted');
    expect(item.className).not.toContain('bg-note-muted');
    expect(screen.getByText(/Internal · On hold/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete comment' })).toBeNull();
  });

  it('an ordinary internal comment is unchanged', async () => {
    const [item] = await renderWith([base]);
    expect(item.className).toContain('bg-note-muted');
    expect(item.className).not.toContain('bg-pending-muted');
    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete comment' })).toBeInTheDocument();
  });
});

/** Review fixes (2026-11-09): items 1, 3, 4, 5 and 6 on the ticket page. */
describe('TicketComments — hold note review fixes', () => {
  const LATE_UTC = '2026-11-12T22:00:00Z';

  it('🔴 1. the hold date is the viewer’s day (Sydney), built from metadata', async () => {
    const before = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    try {
      await renderWith([
        { ...hold, metadata: { kind: 'hold', reason: 'waiting for supplier', until: LATE_UTC } },
      ]);
      expect(
        screen.getByText('On hold until 13 Nov 2026: waiting for supplier')
      ).toBeInTheDocument();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('🔴 5. plain text keeps "<…>": a hold reason and a note written in a thread', async () => {
    await renderWith([
      { ...hold, metadata: { kind: 'hold', reason: 'waiting for <supplier> quote', until: null } },
      { ...base, id: 3, content: 'called <warehouse> twice' },
    ]);
    expect(screen.getByText('On hold: waiting for <supplier> quote')).toBeInTheDocument();
    expect(screen.getByText('called <warehouse> twice')).toBeInTheDocument();
  });

  it('a comment from the rich editor keeps its formatting', async () => {
    await renderWith([{ ...base, content: '<p>call <strong>back</strong></p>' }]);
    expect(screen.getByText('back').tagName).toBe('STRONG');
  });

  it('🔴 6 + 3. hold notes are not counted, and a ticket:comments:updated event re-reads', async () => {
    const onCountChange = vi.fn();
    const getAll = vi
      .spyOn(commentsService, 'getAll')
      .mockResolvedValueOnce({ success: true, data: [base, hold] });
    render(<TicketComments ticketId={5} hasJiraLink={false} onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(1));

    // The backend announces a new hold note on the ticket the way it does a Jira sync.
    const handler = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([event]) => event === 'ticket:comments:updated')
      .at(-1)?.[1];
    expect(handler).toBeDefined();
    getAll.mockResolvedValueOnce({
      success: true,
      data: [base, hold, { ...hold, id: 4 }, { ...base, id: 5, content: 'second' }],
    });
    act(() => handler?.({ ticketId: 99 }));
    act(() => handler?.({ ticketId: 5 }));
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(2));
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('second')).toBeInTheDocument();
  });

  it('🔴 4. the tickets table’s Pending dot is amber, not the On-hold violet', () => {
    const { container } = render(<StatusDot status="pending" />);
    const dot = (container.querySelector('.rounded-full')?.className ?? '').split(/\s+/);
    expect(dot).toContain('bg-warning');
    expect(dot).not.toContain('bg-pending');
  });
});
