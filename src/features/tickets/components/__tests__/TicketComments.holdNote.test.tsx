/**
 * A hold note (`source: 'hold'`, written by the backend when a thread goes on or comes off hold)
 * reaching a ticket's comments is violet and offers no edit or delete — even to an admin, who may
 * edit any other comment. An ordinary internal comment keeps its amber note look and its actions.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TicketComments } from '../TicketComments';
import { commentsService, type Comment } from '@/features/tickets/services/comments.service';
import { useAuthStore } from '@/stores/authStore';
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
  content: '<p>On hold until 12 Nov 2026: waiting for supplier</p>',
  source: 'hold',
  metadata: { kind: 'hold', reason: 'waiting for supplier', until: '2026-11-12T00:00:00Z' },
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
