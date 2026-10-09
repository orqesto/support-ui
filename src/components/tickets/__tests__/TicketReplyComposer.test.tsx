/**
 * Reply to a ticket's threads from the ticket page (owner, 2026-09-23; plan
 * `TICKET-REPLY-ALL-PLAN-2026-10-09.md`): which threads are ticked, what the confirm says, what is
 * sent, and "Send to the N that have not had it".
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const threadsOfTicket = vi.fn();
const repliesOfTicket = vi.fn();
const send = vi.fn();

vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { threadsOfTicket, addThreads: vi.fn(), removeThread: vi.fn() },
}));
vi.mock('@/services/ticketReplies.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ticketRepliesService: { repliesOfTicket, send },
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads: vi.fn() } }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACME' }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
// The real editor is ProseMirror, which jsdom cannot drive; this keeps its contract.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (props: { content?: string; onChange?: (html: string) => void; placeholder?: string }, ref) => {
      useImperativeHandle(ref, () => ({ setContent: (html: string) => props.onChange?.(html) }));
      return (
        <textarea
          aria-label="Reply text"
          placeholder={props.placeholder}
          value={props.content ?? ''}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }
  ),
}));

const { TicketThreads } = await import('@/components/tickets/TicketThreads');

const thread = (id: number, over: Record<string, unknown> = {}) => ({
  conversationId: id,
  publicId: `SUP-${id}`,
  subject: 'Checkout is down',
  requesterEmail: `customer-${id}@example.com`,
  status: 'open',
  channel: 'email',
  createdAt: '2026-10-01T10:00:00Z',
  isPrimary: id === 11,
  addedAt: '2026-10-01T10:00:00Z',
  owesReply: false,
  ...over,
});

const ready = (rows: ReturnType<typeof thread>[]) =>
  threadsOfTicket.mockResolvedValue({ unavailable: false, rows, hiddenCount: 0 });
const replies = (over: Record<string, unknown> = {}) =>
  repliesOfTicket.mockResolvedValue({
    unavailable: false,
    replies: [],
    unreachable: [],
    names: [],
    maxThreads: 100,
    ...over,
  });

const renderTicket = (ticketStatus = 'open') =>
  render(
    <MemoryRouter>
      <TicketThreads ticketId={4} fallback={<p>legacy list</p>} ticketStatus={ticketStatus} />
    </MemoryRouter>
  );

const box = (id: number) =>
  screen.getByRole('checkbox', { name: `Reply to customer-${id}@example.com` });

beforeEach(() => {
  vi.clearAllMocks();
  ready([thread(11), thread(12), thread(13)]);
  replies();
  send.mockResolvedValue({ replyId: 9, existing: false, queued: [11, 12, 13], skipped: [] });
});

describe('TicketReplyComposer', () => {
  it('an older backend (no replies route) shows no boxes and no reply box', async () => {
    repliesOfTicket.mockResolvedValue({ unavailable: true });
    renderTicket();
    expect(await screen.findByText('customer-11@example.com')).toBeInTheDocument();
    await waitFor(() => expect(repliesOfTicket).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Reply text')).toBeNull();
  });

  it('R3: on an open ticket every thread a reply can reach is ticked; one it cannot is disabled and says why', async () => {
    replies({ unreachable: [{ conversationId: 13, reason: 'WhatsApp 24-hour window is closed' }] });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    expect(box(12)).toBeChecked();
    expect(box(13)).not.toBeChecked();
    expect(box(13)).toBeDisabled();
    expect(
      screen.getByText('A reply cannot reach this thread: WhatsApp 24-hour window is closed')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to 2 threads' })).toBeDisabled(); // no text yet
  });

  it('Q2: on a RESOLVED ticket only the customers still owed a reply are ticked', async () => {
    ready([
      thread(11, { owesReply: true }),
      thread(12, { owesReply: false }),
      thread(13, { owesReply: true }),
    ]);
    renderTicket('resolved');
    await waitFor(() => expect(box(11)).toBeChecked());
    expect(box(12)).not.toBeChecked();
    expect(box(13)).toBeChecked();
  });

  it('R1/R2/R4: one text to the ticked threads only, each told it goes separately; the agent can untick', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(12)).toBeChecked());
    await user.click(box(12));
    await user.type(screen.getByLabelText('Reply text'), 'We fixed it.');
    await user.click(screen.getByRole('button', { name: 'Send to 2 threads' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Send this reply to 2 threads?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Each customer gets it separately/)).toBeInTheDocument();
    expect(within(dialog).getByText(/becomes Pending/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(4, { content: 'We fixed it.' }, [11, 13], false, [])
    );
    expect(await screen.findByText('Sending to 3 threads…')).toBeInTheDocument();
    // The box is emptied for the next reply, and the list of replies is read again.
    expect(screen.getByLabelText('Reply text')).toHaveValue('');
    expect(repliesOfTicket).toHaveBeenCalledTimes(2);
  });

  it('R4: Send & resolve all asks the server to resolve, and the confirm says so', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Fixed, closing.');
    await user.click(screen.getByRole('button', { name: 'Send & resolve all' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Each of these threads is resolved/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send & resolve' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(4, { content: 'Fixed, closing.' }, [11, 12, 13], true, [])
    );
  });

  it('A7: the same text again — the confirm says who already has it, before anything is sent', async () => {
    const user = userEvent.setup();
    replies({
      replies: [
        {
          id: 7,
          content: 'We fixed it.',
          createdAt: '2026-10-02T10:00:00Z',
          createdBy: { id: 1, name: 'Tara Agent' },
          deliveries: [{ conversationId: 11, outcome: 'sent', reason: null, updatedAt: '' }],
          hiddenCount: 0,
          attachments: [],
        },
      ],
    });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), '  We fixed   it. ');
    await user.click(screen.getByRole('button', { name: 'Send to 3 threads' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/already sent to 1 of them — only the 2 that have not had it/)
    ).toBeInTheDocument();
  });

  it('R6: an earlier reply says "sent to X of Y" and sends again only to the threads that have not had it', async () => {
    const user = userEvent.setup();
    replies({
      unreachable: [{ conversationId: 13, reason: 'No customer address' }],
      replies: [
        {
          id: 7,
          content: '<p>We fixed it.</p>',
          createdAt: '2026-10-02T10:00:00Z',
          createdBy: { id: 1, name: 'Tara Agent' },
          deliveries: [
            { conversationId: 11, outcome: 'sent', reason: null, updatedAt: '' },
            {
              conversationId: 12,
              outcome: 'failed',
              reason: 'Reply saved but not delivered',
              updatedAt: '',
            },
          ],
          hiddenCount: 0,
          attachments: [],
        },
      ],
    });
    send.mockResolvedValue({ replyId: 7, existing: true, queued: [12], skipped: [] });
    // 13 was linked after the reply, so it WOULD be offered — but no reply can reach it.
    ready([thread(11), thread(12), thread(13, { addedAt: '2026-10-03T10:00:00Z' })]);
    renderTicket();
    expect(await screen.findByText('We fixed it.')).toBeInTheDocument();
    expect(screen.getByText(/sent to 1 of 3/)).toBeInTheDocument();
    expect(
      screen.getByText('customer-12@example.com: failed — Reply saved but not delivered')
    ).toBeInTheDocument();

    // 12 failed (offered again); 13 cannot be reached; 11 already has it.
    await user.click(
      screen.getByRole('button', { name: 'Send to the 1 thread that has not had it' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(4, { replyId: 7 }, [12], undefined, []));
  });

  it('R6: "have not had it" is failed + linked after the reply — never a thread left unticked on purpose', async () => {
    const user = userEvent.setup();
    // 11 got it; 12 was on the ticket and left unticked (no delivery); 13 was linked afterwards.
    ready([
      thread(11, { addedAt: '2026-10-01T10:00:00Z' }),
      thread(12, { addedAt: '2026-10-01T10:00:00Z' }),
      thread(13, { addedAt: '2026-10-03T10:00:00Z' }),
    ]);
    replies({
      replies: [
        {
          id: 7,
          content: 'We fixed it.',
          createdAt: '2026-10-02T10:00:00Z',
          createdBy: null,
          deliveries: [{ conversationId: 11, outcome: 'sent', reason: null, updatedAt: '' }],
          hiddenCount: 0,
          attachments: [],
        },
      ],
    });
    send.mockResolvedValue({ replyId: 7, existing: true, queued: [13], skipped: [] });
    renderTicket();
    await user.click(
      await screen.findByRole('button', { name: 'Send to the 1 thread that has not had it' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/becomes Pending/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(4, { replyId: 7 }, [13], undefined, []));
  });

  it('attachments: files picked once go with a NEW reply; the same text with files is not "already sent"', async () => {
    const user = userEvent.setup();
    replies({
      replies: [
        {
          id: 7,
          content: 'Report attached.',
          createdAt: '2026-10-02T10:00:00Z',
          createdBy: null,
          deliveries: [{ conversationId: 11, outcome: 'sent', reason: null, updatedAt: '' }],
          hiddenCount: 0,
          attachments: [],
        },
      ],
    });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    const report = new File(['root cause'], 'report.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Attach files'), report);
    expect(screen.getByText('report.txt')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reply text'), 'Report attached.');
    await user.click(screen.getByRole('button', { name: 'Send to 3 threads' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/already sent/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(4, { content: 'Report attached.' }, [11, 12, 13], false, [
        report,
      ])
    );
    // Cleared with the text for the next reply.
    expect(screen.queryByText('report.txt')).toBeNull();
  });

  it('G1: a reply sent only to threads the agent cannot open says so instead of showing nothing', async () => {
    replies({
      replies: [
        {
          id: 8,
          content: null,
          createdAt: '2026-09-02T10:00:00Z',
          createdBy: null,
          deliveries: [],
          hiddenCount: 2,
          attachments: [],
        },
      ],
    });
    renderTicket();
    expect(
      await screen.findByText('Sent only to threads in departments you cannot open.')
    ).toBeInTheDocument();
    expect(screen.getByText(/2 more in departments you cannot open/)).toBeInTheDocument();
    // Not readable ⇒ not re-sendable: no "send to the threads that have not had it" (G1).
    expect(screen.queryByRole('button', { name: /not had it/ })).toBeNull();
  });

  it('T-4: {first_name} with no fallback warns how many ticked customers have no name; a fallback clears it', async () => {
    const user = userEvent.setup();
    replies({
      names: [
        { conversationId: 11, firstName: 'Ada', customerName: 'Ada Lovelace' },
        { conversationId: 12, firstName: null, customerName: null },
        { conversationId: 13, firstName: 'Grace', customerName: 'Grace Hopper' },
      ],
    });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    const editor = screen.getByLabelText('Reply text');
    await user.type(editor, 'Hi {{first_name},');
    expect(screen.getByText(/1 ticked customer has no name on record/)).toBeInTheDocument();
    // Unticking that customer clears it — the warning counts TICKED threads.
    await user.click(box(12));
    expect(screen.queryByText(/no name on record/)).toBeNull();
    await user.click(box(12));
    await user.clear(editor);
    await user.type(editor, 'Hi {{first_name|there},');
    expect(screen.queryByText(/no name on record/)).toBeNull();
  });

  it('T9: more threads ticked than one send may reach — Send is off and the page says by how many', async () => {
    replies({ maxThreads: 2 });
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(13)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Hello');
    expect(screen.getByRole('button', { name: 'Send to 3 threads' })).toBeDisabled();
    expect(
      screen.getByText('One reply can go to at most 2 threads — untick 1.')
    ).toBeInTheDocument();
  });

  it('a send still running is read again until every thread has an outcome', async () => {
    const pending = {
      id: 7,
      content: 'We fixed it.',
      createdAt: '2026-10-02T10:00:00Z',
      createdBy: null,
      deliveries: [{ conversationId: 11, outcome: 'sending', reason: null, updatedAt: '' }],
      hiddenCount: 0,
      attachments: [],
    };
    repliesOfTicket
      .mockResolvedValueOnce({
        unavailable: false,
        replies: [pending],
        unreachable: [],
        maxThreads: 100,
      })
      .mockResolvedValue({
        unavailable: false,
        replies: [{ ...pending, deliveries: [{ ...pending.deliveries[0], outcome: 'sent' }] }],
        unreachable: [],
        names: [],
        maxThreads: 100,
      });
    renderTicket();
    expect(await screen.findByText(/sending to 1…/)).toBeInTheDocument();
    expect(await screen.findByText(/sent to 1 of 3/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(repliesOfTicket).toHaveBeenCalledTimes(2);
  });

  it('a failed send says why and keeps the text', async () => {
    const user = userEvent.setup();
    send.mockRejectedValue(
      Object.assign(new Error('x'), {
        response: {
          status: 404,
          data: { message: 'One of these threads is not on this ticket any more' },
        },
      })
    );
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'We fixed it.');
    await user.click(screen.getByRole('button', { name: 'Send to 3 threads' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' })
    );
    expect(await screen.findByText(/not on this ticket any more/)).toBeInTheDocument();
    expect(screen.getByLabelText('Reply text')).toHaveValue('We fixed it.');
  });
});
