/**
 * "These two conversations are the same piece of customer work."
 *
 * support-service #767 shipped this on 2026-09-19 with a migration and an audit, and nothing in
 * the product could call it: `linkedIds` appeared in ZERO frontend files until now. The shape it
 * exists for was measured on CoreSarms (2026-09-18) — 3 of 4 one-sided alerts had a sibling
 * thread from the same customer on a different Gmail thread, days apart, each looking unanswered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ConversationLinksModuleType from '@/services/conversationLinks.service';

type ConversationLinksModule = typeof ConversationLinksModuleType;

const list = vi.fn();
const link = vi.fn();
const unlink = vi.fn();
const getById = vi.fn();
const getThreads = vi.fn();

vi.mock('@/services/conversationLinks.service', async () => {
  // The REAL module, with only the network surface replaced: `AssigneeConflictError` is part of
  // the contract under test, and a hand-written stand-in would let the component stop
  // recognising the real one while this suite stayed green.
  const actual =
    await vi.importActual<ConversationLinksModule>('@/services/conversationLinks.service');
  return {
    ...actual,
    conversationLinksService: { list, link, unlink },
  };
});
vi.mock('@/services/message.service', () => ({ messageService: { getById, getThreads } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { LinkedThreads } = await import('@/components/messages/LinkedThreads');
const { AssigneeConflictError } = await import('@/services/conversationLinks.service');

const message = {
  id: 11,
  sender: 'ada@example.com',
  status: 'open',
  assigneeId: 7,
  assigneeName: 'Grace',
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({ linkedIds: [], slaAnchorAt: null });
  getThreads.mockResolvedValue({
    data: [{ latestMessage: { id: 12, subject: 'Where is my order?', status: 'open' } }],
  });
  getById.mockResolvedValue({ data: { id: 12, subject: 'Where is my order?', status: 'open' } });
  link.mockResolvedValue(undefined);
  unlink.mockResolvedValue(undefined);
});

describe('LinkedThreads', () => {
  it('links a thread the agent picks from the SAME customer', async () => {
    render(<LinkedThreads message={message} />);

    await userEvent.click(await screen.findByRole('button', { name: /Link a thread/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Link$/ }));

    await waitFor(() => expect(link).toHaveBeenCalledWith(11, 12, undefined));
  });

  it('⛔ only offers this customer’s threads, and never this thread itself', async () => {
    /**
     * 🔴 Linking two DIFFERENT customers' threads is not an undoable mistake in the way it looks:
     * TL-D1 then computes the SLA anchor across strangers, so one customer's old message starts a
     * clock on another's. The search is keyed on the sender, and the current thread is excluded —
     * a self-link is structurally impossible server-side and must not be offered either.
     */
    getThreads.mockResolvedValue({
      data: [
        { latestMessage: { id: 11, subject: 'This very thread', status: 'open' } },
        { latestMessage: { id: 12, subject: 'Where is my order?', status: 'open' } },
      ],
    });
    render(<LinkedThreads message={message} />);

    await userEvent.click(await screen.findByRole('button', { name: /Link a thread/ }));

    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(getThreads.mock.calls[0][0]).toMatchObject({ search: 'ada@example.com' });
    expect(await screen.findByText(/Where is my order\?/)).toBeInTheDocument();
    expect(screen.queryByText(/This very thread/)).toBeNull();
  });

  it('⛔ a 409 asks WHO keeps the thread instead of reporting an error', async () => {
    /**
     * 🔴 TL-D2, and the reason the backend refuses rather than choosing: someone is working that
     * thread. Rendering "could not link" would hide a question the agent is the only one able to
     * answer — and until this component existed, nothing could answer that 409 at all.
     * RED: treat the conflict as a generic failure and the assignee question never appears.
     */
    link.mockRejectedValueOnce(new AssigneeConflictError());
    render(<LinkedThreads message={message} />);

    await userEvent.click(await screen.findByRole('button', { name: /Link a thread/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Link$/ }));

    expect(await screen.findByText(/Both threads already have someone working them/)).toBeInTheDocument();
    expect(screen.queryByText(/could not be linked/i)).toBeNull();

    // Choosing re-sends the SAME link with the assignee named — the backend's own resolution.
    await userEvent.click(screen.getByRole('button', { name: 'Grace' }));
    await waitFor(() => expect(link).toHaveBeenLastCalledWith(11, 12, 7));
  });

  it('says the clock moves, because linking can surface a breach (TL-D1)', async () => {
    list.mockResolvedValue({ linkedIds: [12], slaAnchorAt: '2026-09-14T08:00:00.000Z' });
    render(<LinkedThreads message={message} />);

    expect(
      await screen.findByText(/measured from the earliest customer message across these threads/)
    ).toBeInTheDocument();
  });

  it('⛔ a failed read is not “not linked to anything”', async () => {
    // The skew case: an older backend has no such route. Saying "not linked" would state
    // something false about the thread — the same rule the records page follows.
    list.mockRejectedValue(new Error('404'));
    render(<LinkedThreads message={message} />);

    expect(await screen.findByText(/could not read this thread’s links/i)).toBeInTheDocument();
    expect(screen.queryByText(/Not linked to anything/)).toBeNull();
  });

  it('names the linked thread rather than its id', async () => {
    // "Linked to 14657" is not something an agent can act on.
    list.mockResolvedValue({ linkedIds: [12], slaAnchorAt: null });
    render(<LinkedThreads message={message} />);

    expect(await screen.findByText(/Where is my order\?/)).toBeInTheDocument();
  });

  it('unlinks, and it is not a merge', async () => {
    list.mockResolvedValue({ linkedIds: [12], slaAnchorAt: null });
    render(<LinkedThreads message={message} />);

    await userEvent.click(await screen.findByRole('button', { name: /Unlink/ }));

    await waitFor(() => expect(unlink).toHaveBeenCalledWith(11, 12));
    // ⛔ The word "merge" must not appear: `mergeConversation` DELETES a row and is deliberately
    // not exposed. Copy that implies it would make agents avoid a safe action, or expect a
    // destructive one.
    expect(screen.queryByText(/merge/i)).toBeNull();
  });
});
