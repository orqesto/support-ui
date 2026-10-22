/**
 * The ticket page as the client's "contingency page" (owner, 2026-10-19; plan
 * `CONTINGENCY-PAGE-PLAN-2026-10-19.md`): case number + sender on each row, open threads ticked by
 * default, a thread that received an update cannot be removed, Resolve without sending and its
 * reopen-only Undo, Send & put on hold, AI draft, per-recipient preview, everything resolved ⇒
 * nothing to send, and the view-only page for a role without MANAGE_TICKETS.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const threadsOfTicket = vi.fn();
const resolveThreads = vi.fn();
const reopenThreads = vi.fn();
const repliesOfTicket = vi.fn();
const send = vi.fn();
const preview = vi.fn();
const composeUpdate = vi.fn();

const perms = vi.hoisted(() => ({ manage: true }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => perms.manage }),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: {
    threadsOfTicket,
    addThreads: vi.fn(),
    removeThread: vi.fn(),
    resolveThreads,
    reopenThreads,
  },
}));
vi.mock('@/services/ticketReplies.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ticketRepliesService: { repliesOfTicket, send, preview, composeUpdate },
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads: vi.fn() } }));
vi.mock('@/services/ticketDrafts.service', () => ({
  ticketDraftsService: { draftsOfTicket: vi.fn().mockResolvedValue({ unavailable: true }) },
}));
vi.mock('@/services/replyTemplates.service', () => ({
  replyTemplatesService: { list: vi.fn().mockResolvedValue({ unavailable: true }) },
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({ useAiDraftsOff: () => ({ off: false }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACME' }));
// Translate has its own tests; its language list needs a query client this page test has none of.
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
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
  subject: 'Parcel held at the border',
  requesterEmail: `customer-${id}@example.com`,
  status: 'open',
  channel: 'email',
  createdAt: '2026-10-01T10:00:00Z',
  isPrimary: id === 11,
  addedAt: '2026-10-01T10:00:00Z',
  owesReply: false,
  parkedAt: null,
  parkedReason: null,
  parkedUntil: null,
  receivedUpdate: false,
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

/** A reply sent from the ticket to threads 11 and 12, each delivery at `outcome`. */
const sentReply = (id: number, outcome: string) => ({
  id,
  content: '<p>Fixed.</p>',
  attachments: [],
  createdAt: '2026-10-19T10:00:00Z',
  createdBy: null,
  hiddenCount: 0,
  deliveries: [11, 12].map((conversationId) => ({
    conversationId,
    outcome,
    reason: null,
    updatedAt: '',
    hasOwnText: false,
    resolve: false,
    holdUntil: null,
  })),
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
  perms.manage = true;
  ready([thread(11), thread(12), thread(13, { status: 'resolved' })]);
  replies({
    names: [
      { conversationId: 11, firstName: 'Ada', customerName: 'Ada Lovelace' },
      { conversationId: 12, firstName: null, customerName: null },
      { conversationId: 13, firstName: 'Grace', customerName: 'Grace Hopper' },
    ],
  });
  send.mockResolvedValue({ replyId: 9, existing: false, queued: [11, 12], skipped: [] });
  resolveThreads.mockResolvedValue({ done: [11, 12], skipped: [], failed: [] });
  reopenThreads.mockResolvedValue({ done: [11, 12], skipped: [], failed: [] });
});

describe('contingency page', () => {
  it('each row shows its case number, the sender’s name and address, and open/resolved', async () => {
    renderTicket();
    // The thread list itself — the composer's "sending to" chips repeat the ticked names.
    const list = await screen.findByRole('list', { name: 'Threads on this ticket' });
    expect(await within(list).findByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(list).getByText('SUP-12')).toBeInTheDocument();
    // No name on record: the address alone, never a made-up name.
    expect(within(list).getByText('customer-12@example.com')).toBeInTheDocument();
    expect(within(list).getByText('resolved')).toBeInTheDocument();
  });

  it('an update goes to the OPEN threads by default; a resolved one is not ticked', async () => {
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    expect(box(12)).toBeChecked();
    expect(box(13)).not.toBeChecked();
  });

  it('a thread that already received an update cannot be removed — and says why', async () => {
    ready([thread(11), thread(12, { receivedUpdate: true }), thread(14)]);
    renderTicket();
    await screen.findByText('SUP-12');
    expect(
      screen.getByRole('button', {
        name: 'customer-12@example.com’s thread received an update and cannot be removed',
      })
    ).toBeDisabled();
    // ⛔ and no working Remove for it anywhere on the row.
    expect(
      screen.queryByRole('button', {
        name: 'Remove customer-12@example.com’s thread from this ticket',
      })
    ).toBeNull();
    // CONTROL: one that did not can still be removed.
    expect(
      screen.getByRole('button', {
        name: 'Remove customer-14@example.com’s thread from this ticket',
      })
    ).toBeEnabled();
    expect(screen.getByText('updated')).toBeInTheDocument();
  });

  it('an On-hold thread shows until when', async () => {
    ready([
      thread(11),
      thread(12, {
        parkedAt: '2026-10-19T10:00:00Z',
        parkedReason: 'Awaiting customs',
        parkedUntil: '2026-10-22T10:00:00Z',
      }),
    ]);
    renderTicket();
    expect(await screen.findByText(/on hold until/)).toBeInTheDocument();
  });

  it('Resolve resolves the ticked open threads without sending; Undo only reopens', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Resolve 2 threads' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Nothing is sent to anyone/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(resolveThreads).toHaveBeenCalledWith(4, [11, 12]));
    expect(send).not.toHaveBeenCalled();
    expect(await screen.findByText(/resolved — nothing was sent/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Undo — reopen only/ }));
    await waitFor(() => expect(reopenThreads).toHaveBeenCalledWith(4, [11, 12]));
    expect(await screen.findByText(/Emails already sent stay sent/)).toBeInTheDocument();
  });

  it('Send & put on hold asks why and until when, then sends with the hold', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Hi {{first_name}, still at customs.');
    await user.click(screen.getByRole('button', { name: 'More send options' }));
    await user.click(screen.getByRole('menuitem', { name: /Send & put on hold/ }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Send & put on hold' });
    // No reason yet: nothing can be sent.
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Awaiting customs');
    await user.click(confirm);
    await waitFor(() => expect(send).toHaveBeenCalled());
    const [ticketId, body, ids, resolve, , hold] = send.mock.calls[0] as [
      number,
      unknown,
      number[],
      boolean,
      unknown,
      { reason: string; until: Date },
    ];
    expect([ticketId, body, ids, resolve]).toEqual([
      4,
      { content: 'Hi {first_name}, still at customs.' },
      [11, 12],
      false,
    ]);
    expect(hold.reason).toBe('Awaiting customs');
    // Default preset: 3 days from now.
    expect(hold.until.getTime() - Date.now()).toBeGreaterThan(2.9 * 24 * 3600 * 1000);
    // A hold can be undone too (reopen only).
    expect(await screen.findByRole('button', { name: /Undo — reopen only/ })).toBeInTheDocument();
  });

  it('Generate with AI fills the box from the ticket; typed text goes as the agent’s notes', async () => {
    const user = userEvent.setup();
    composeUpdate.mockResolvedValue({ text: 'Hi {first_name}, an update.', sources: [] });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.click(screen.getByRole('button', { name: /AI draft/ }));
    await waitFor(() => expect(composeUpdate).toHaveBeenCalledWith(4, undefined));
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLTextAreaElement>('Reply text').value).toContain('an update.')
    );
    await user.click(screen.getByRole('button', { name: /AI draft/ }));
    await waitFor(() => expect(composeUpdate).toHaveBeenLastCalledWith(4, expect.any(String)));
  });

  it('Generate with nothing in the KB asks for the facts; with facts typed, they are sent', async () => {
    const user = userEvent.setup();
    composeUpdate.mockResolvedValue({ text: null, sources: [], reason: 'no-sources' });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.click(screen.getByRole('button', { name: /AI draft/ }));
    expect(await screen.findByText(/Type the key facts in the box/)).toBeInTheDocument();

    composeUpdate.mockResolvedValue({
      text: 'Hi {first_name}, the papers were re-sent.',
      sources: [],
    });
    await user.type(screen.getByLabelText('Reply text'), 'papers re-sent, ETA Friday');
    await user.click(screen.getByRole('button', { name: /AI draft/ }));
    await waitFor(() =>
      expect(composeUpdate).toHaveBeenLastCalledWith(4, expect.stringContaining('ETA Friday'))
    );
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLTextAreaElement>('Reply text').value).toContain('re-sent.')
    );
    // Written from the notes, not the KB (staging 2026-10-19 said "and the knowledge base").
    expect(
      screen.getByText('Draft written from your notes — check it before sending.')
    ).toBeInTheDocument();
  });

  it('CONTROL: a draft from the knowledge base says so', async () => {
    const user = userEvent.setup();
    composeUpdate.mockResolvedValue({
      text: 'Hi {first_name}, the papers were re-sent.',
      sources: [{ type: 'knowledge_base', id: 1, title: 'Customs' }],
    });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.click(screen.getByRole('button', { name: /AI draft/ }));
    expect(
      await screen.findByText(
        'Draft written from the ticket and the knowledge base — check it before sending.'
      )
    ).toBeInTheDocument();
  });

  it('a delivery that finishes reloads the threads: the last one sent shows its hold too', async () => {
    const reply = (outcome: string) => ({
      id: 9,
      content: '<p>Held.</p>',
      attachments: [],
      createdAt: '2026-10-19T10:00:00Z',
      createdBy: null,
      hiddenCount: 0,
      deliveries: [
        {
          conversationId: 11,
          outcome,
          reason: null,
          updatedAt: '',
          hasOwnText: false,
          resolve: false,
          holdUntil: '2026-10-22T10:00:00Z',
        },
      ],
    });
    replies({ replies: [reply('sending')] });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    expect(screen.queryByText(/on hold until/)).toBeNull();
    const loadsBefore = threadsOfTicket.mock.calls.length;

    // The mail has left, the thread is on hold and the delivery is marked sent; no socket event.
    ready([
      thread(11, {
        parkedAt: '2026-10-19T10:00:00Z',
        parkedReason: 'Awaiting customs',
        parkedUntil: '2026-10-22T10:00:00Z',
        receivedUpdate: true,
      }),
      thread(12),
      thread(13, { status: 'resolved' }),
    ]);
    replies({ replies: [sentReply(9, 'sent')] });

    expect(await screen.findByText(/on hold until/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(threadsOfTicket.mock.calls.length).toBe(loadsBefore + 1);
  });

  it('the preview shows what the first ticked customers receive, filled for each', async () => {
    const user = userEvent.setup();
    preview.mockResolvedValue([
      { conversationId: 11, ok: true, text: '<p>Hi Ada, held.</p>' },
      { conversationId: 12, ok: true, text: '<p>Hi there, held.</p>' },
    ]);
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Hi {{first_name}, held.');
    await user.click(screen.getByRole('button', { name: 'More composer actions' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Preview per customer/ }));
    expect(await screen.findByText('Hi Ada, held.')).toBeInTheDocument();
    expect(screen.getByText('Hi there, held.')).toBeInTheDocument();
    expect(preview).toHaveBeenLastCalledWith(4, 'Hi {first_name}, held.', [11, 12]);
  });

  it('an empty contingency (no threads yet) says how to start: no composer, Add threads', async () => {
    ready([]);
    renderTicket();
    expect(await screen.findByText(/Add threads to link the reports/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add threads/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Reply text')).toBeNull();
  });

  it('every thread resolved: nothing to update, sending is off and the page says how to fix it', async () => {
    ready([thread(11, { status: 'resolved' }), thread(12, { status: 'closed' })]);
    renderTicket();
    expect(await screen.findByText(/Every linked thread is resolved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /AI draft/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach' })).toBeDisabled();
  });

  it('"Sending to N threads…" goes once the deliveries it started have finished', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Fixed.');
    replies({ replies: [sentReply(9, 'pending')] });
    await user.click(screen.getByRole('button', { name: /Send to 2/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Send/ })
    );
    expect(await screen.findByText('Sending to 2 threads…')).toBeInTheDocument();

    replies({ replies: [sentReply(9, 'sent')] });
    await waitFor(() => expect(screen.queryByText('Sending to 2 threads…')).toBeNull(), {
      timeout: 4000,
    });
  });

  const sendFixed = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Reply text'), 'Fixed.');
    await user.click(screen.getByRole('button', { name: /Send to 2/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Send/ })
    );
    expect(await screen.findByText('Sending to 2 threads…')).toBeInTheDocument();
  };

  it('"Sending to N threads…" goes when they finished before any read showed them sending', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    // The read after the send (held until the notice is up) already has every delivery done.
    let answer: (value: unknown) => void = () => {};
    repliesOfTicket.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await sendFixed(user);
    answer({
      unavailable: false,
      replies: [sentReply(9, 'sent')],
      unreachable: [],
      names: [],
      maxThreads: 100,
    });
    await waitFor(() => expect(screen.queryByText('Sending to 2 threads…')).toBeNull());
  });

  it('"Sending to N threads…" goes for a send made while earlier deliveries were still going', async () => {
    const user = userEvent.setup();
    replies({ replies: [sentReply(8, 'pending')] });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    replies({ replies: [sentReply(9, 'pending'), sentReply(8, 'sent')] });
    await sendFixed(user);

    replies({ replies: [sentReply(9, 'sent'), sentReply(8, 'sent')] });
    await waitFor(() => expect(screen.queryByText('Sending to 2 threads…')).toBeNull(), {
      timeout: 4000,
    });
  });

  it('a role without MANAGE_TICKETS sees the list but no Add, Remove, Resolve or composer', async () => {
    perms.manage = false;
    ready([thread(11), thread(12)]);
    renderTicket();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add threads/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resolve/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Reply text')).toBeNull();
  });
});
