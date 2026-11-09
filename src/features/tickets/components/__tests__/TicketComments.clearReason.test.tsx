/**
 * Clear reason on the ticket page (second review of #897): a hold note reaching a ticket's
 * comments offers it to a workspace admin, through the note's thread (`messageId`), with the same
 * in-app confirm as the thread; the list re-reads after. Not for an agent, nor for a comment that
 * belongs to no thread.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TicketComments } from '../TicketComments';
import { commentsService, type Comment } from '@/features/tickets/services/comments.service';
import { messageService, type MessageNote } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));

const ME = 9;

const asRole = (organizationRole: string) =>
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: ME, role: 'user', organizationRole, organizationId: 1 } as unknown as User,
  });

const withClient = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => asRole('support'));
afterEach(() => vi.restoreAllMocks());

const ticketHold: Comment = {
  id: 31,
  ticketId: 5,
  messageId: 41,
  userId: ME,
  authorName: 'Sam Agent',
  content: 'On hold: supplier',
  isInternal: true,
  externalId: null,
  source: 'hold',
  createdAt: '2026-11-09T10:00:00Z',
  updatedAt: '2026-11-09T10:00:00Z',
  metadata: { kind: 'hold', reason: 'supplier', until: null },
  contentFormat: 'text',
  user: null,
};

const clickClearAndConfirm = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Clear reason' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Clear reason' }));
};

describe('TicketComments — Clear reason', () => {
  it('🔴 ticket page: a workspace admin clears through the note’s thread, then the list re-reads', async () => {
    asRole('org_admin');
    const getAll = vi
      .spyOn(commentsService, 'getAll')
      .mockResolvedValue({ success: true, data: [ticketHold] });
    const clear = vi
      .spyOn(messageService, 'clearHoldNoteReason')
      .mockResolvedValue({ success: true, data: ticketHold as unknown as MessageNote });
    withClient(<TicketComments ticketId={5} hasJiraLink={false} />);
    await clickClearAndConfirm();
    await waitFor(() => expect(clear).toHaveBeenCalledWith(41, 31));
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2));
  });

  it('ticket page: no button for an agent, nor for a comment with no thread', async () => {
    vi.spyOn(commentsService, 'getAll').mockResolvedValue({ success: true, data: [ticketHold] });
    const { unmount } = withClient(<TicketComments ticketId={5} hasJiraLink={false} />);
    expect(await screen.findByText('On hold: supplier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reason' })).toBeNull();
    unmount();

    asRole('org_admin');
    vi.spyOn(commentsService, 'getAll').mockResolvedValue({
      success: true,
      data: [{ ...ticketHold, messageId: null }],
    });
    withClient(<TicketComments ticketId={5} hasJiraLink={false} />);
    expect(await screen.findByText('On hold: supplier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reason' })).toBeNull();
  });
});
