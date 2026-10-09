/**
 * Ticket reply box — templates, drafts and "Send here" (reply templates build spec B; plan P2):
 * drafts are made per ticked thread from a template or the typed text (no model call), reviewed
 * (edit, AI-adapt the picked ones), then sent — each thread its own text. "Send here" sends an
 * earlier reply into one thread it has not reached.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const threadsOfTicket = vi.fn();
const repliesOfTicket = vi.fn();
const send = vi.fn();
const draftsOfTicket = vi.fn();
const create = vi.fn();
const update = vi.fn();
const discard = vi.fn();
const adapt = vi.fn();
const list = vi.fn();

vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { threadsOfTicket, addThreads: vi.fn(), removeThread: vi.fn() },
}));
vi.mock('@/services/ticketReplies.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ticketRepliesService: { repliesOfTicket, send },
}));
vi.mock('@/services/ticketDrafts.service', () => ({
  ticketDraftsService: { draftsOfTicket, create, update, discard, adapt },
}));
vi.mock('@/services/replyTemplates.service', () => ({ replyTemplatesService: { list } }));
const aiDrafts = vi.hoisted(() => ({ off: false }));
vi.mock('@/hooks/useAiDraftsOff', () => ({ useAiDraftsOff: () => ({ off: aiDrafts.off }) }));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads: vi.fn() } }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACME' }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
// ProseMirror cannot run in jsdom; each editor is a textarea named by its placeholder.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (props: { content?: string; onChange?: (html: string) => void; placeholder?: string }, ref) => {
      useImperativeHandle(ref, () => ({ setContent: (html: string) => props.onChange?.(html) }));
      return (
        <textarea
          aria-label={props.placeholder}
          value={props.content ?? ''}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }
  ),
}));

const { TicketThreads } = await import('@/components/tickets/TicketThreads');

const BOX = 'Write one reply for every ticked thread…';

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

const draft = (id: number, over: Record<string, unknown> = {}) => ({
  conversationId: id,
  content: `<p>Hi Customer ${id}, it is fixed.</p>`,
  baseContent: '<p>Hi {first_name|there}, it is fixed.</p>',
  templateId: 5,
  adapted: false,
  updatedAt: '2026-10-09T10:00:00Z',
  ...over,
});

const withDrafts = (rows: ReturnType<typeof draft>[]) =>
  draftsOfTicket.mockResolvedValue({ unavailable: false, drafts: rows });

const renderTicket = () =>
  render(
    <MemoryRouter>
      <TicketThreads ticketId={4} fallback={<p>legacy list</p>} ticketStatus="open" />
    </MemoryRouter>
  );

const box = (id: number) =>
  screen.getByRole('checkbox', { name: `Reply to customer-${id}@example.com` });

const confirmIn = async (button: string) => {
  const dialog = await screen.findByRole('dialog');
  await userEvent.setup().click(within(dialog).getByRole('button', { name: button }));
  return dialog;
};

beforeEach(() => {
  vi.clearAllMocks();
  aiDrafts.off = false;
  threadsOfTicket.mockResolvedValue({
    unavailable: false,
    rows: [thread(11), thread(12), thread(13)],
    hiddenCount: 0,
  });
  repliesOfTicket.mockResolvedValue({
    unavailable: false,
    replies: [],
    unreachable: [],
    names: [],
    maxThreads: 100,
  });
  withDrafts([]);
  list.mockResolvedValue({
    unavailable: false,
    templates: [
      {
        id: 5,
        name: 'Outage update',
        body: '<p>Hi {first_name|there}</p>',
        use: 'ticket',
        departmentId: null,
        attachments: [],
        updatedAt: '',
        canEdit: false,
      },
    ],
  });
  create.mockResolvedValue({ created: [11, 12], refused: [] });
  update.mockResolvedValue(undefined);
  discard.mockResolvedValue(undefined);
  send.mockResolvedValue({ replyId: 9, existing: false, queued: [11], skipped: [] });
});

describe('Ticket reply box — making drafts', () => {
  it('a backend without drafts (404) offers neither "Make drafts" nor "Use template"', async () => {
    draftsOfTicket.mockResolvedValue({ unavailable: true });
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await waitFor(() => expect(draftsOfTicket).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Make drafts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use template' })).toBeNull();
  });

  it('the ticket box asks for TICKET templates; picking one drafts it for the ticked threads', async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({
      created: [11],
      refused: [{ conversationId: 13, reason: 'the customer has no name on record' }],
    });
    renderTicket();
    await waitFor(() => expect(box(12)).toBeChecked());
    await user.click(box(12));
    await user.click(await screen.findByRole('button', { name: 'Use template' }));
    await user.click(await screen.findByRole('option', { name: 'Outage update' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(4, { templateId: 5 }, [11, 13]));
    expect(list).toHaveBeenCalledWith('ticket');
    expect(await screen.findByText('1 draft ready to review below.')).toBeInTheDocument();
    expect(
      screen.getByText(/customer-13@example\.com: no draft — the customer has no name on record/)
    ).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled(); // making drafts sends nothing
  });

  it('"Make drafts" turns the typed text into drafts and empties the box', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText(BOX), 'Hi {{first_name|there}');
    await user.click(screen.getByRole('button', { name: 'Make drafts' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(4, { content: 'Hi {first_name|there}' }, [11, 12, 13])
    );
    await waitFor(() => expect(screen.getByLabelText(BOX)).toHaveValue(''));
  });

  it('"Make drafts" needs text and a ticked thread', async () => {
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    expect(await screen.findByRole('button', { name: 'Make drafts' })).toBeDisabled();
  });
});

describe('Ticket reply box — reviewing drafts', () => {
  it('one row per draft: the customer, the text, "adapted"', async () => {
    withDrafts([draft(11, { adapted: true }), draft(12)]);
    renderTicket();
    const review = await screen.findByLabelText('Drafts to review');
    expect(within(review).getByText('customer-11@example.com')).toBeInTheDocument();
    expect(within(review).getByText('Hi Customer 11, it is fixed.')).toBeInTheDocument();
    expect(within(review).getAllByText('adapted')).toHaveLength(1);
    expect(
      within(review).getByText(/The template’s files are attached in every thread/)
    ).toBeInTheDocument();
  });

  it('a draft is edited by hand and saved; Send reviewed waits while one is open', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11), draft(12)]);
    renderTicket();
    await user.click(
      await screen.findByRole('button', { name: 'Edit the draft for customer-11@example.com' })
    );
    expect(screen.getByRole('button', { name: 'Send reviewed to 2 threads' })).toBeDisabled();
    const editor = screen.getByLabelText('Draft for customer-11@example.com');
    await user.clear(editor);
    await user.type(editor, 'Hi Ada, sorted.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(4, 11, 'Hi Ada, sorted.'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send reviewed to 2 threads' })).toBeEnabled()
    );
  });

  it('Adapt selected sends ONLY the picked drafts and reports each row', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11), draft(12), draft(13)]);
    adapt.mockResolvedValue([
      { conversationId: 11, ok: true, reason: null },
      { conversationId: 13, ok: false, reason: 'AI limit reached' },
    ]);
    renderTicket();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Adapt with AI: customer-11@example.com' })
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Adapt with AI: customer-13@example.com' })
    );
    await user.click(screen.getByRole('button', { name: 'Adapt selected with AI (2)' }));
    await waitFor(() => expect(adapt).toHaveBeenCalledWith(4, [11, 13]));
    expect(await screen.findByText('Adapted by AI — read it before sending.')).toBeInTheDocument();
    expect(
      screen.getByText(/Not adapted — AI limit reached\. The draft is unchanged/)
    ).toBeInTheDocument();
  });

  it('a picked draft the server gave no answer for is reported as not adapted', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11), draft(12)]);
    adapt.mockResolvedValue([{ conversationId: 11, ok: true, reason: null }]);
    renderTicket();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Adapt with AI: customer-11@example.com' })
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Adapt with AI: customer-12@example.com' })
    );
    await user.click(screen.getByRole('button', { name: 'Adapt selected with AI (2)' }));
    expect(await screen.findByText(/^Not adapted\. The draft is unchanged/)).toBeInTheDocument();
  });

  it('AI drafts off: no AI picking and no Adapt button', async () => {
    aiDrafts.off = true;
    withDrafts([draft(11)]);
    renderTicket();
    await screen.findByLabelText('Drafts to review');
    expect(screen.queryByRole('button', { name: /Adapt selected with AI/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Adapt with AI/ })).toBeNull();
  });

  it('a 409 AI_DRAFTS_OFF says so and takes the Adapt button away', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11)]);
    adapt.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Off.'), {
          response: { status: 409, data: { code: 'AI_DRAFTS_OFF', error: 'Off.' } },
        })
      )
    );
    renderTicket();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Adapt with AI: customer-11@example.com' })
    );
    await user.click(screen.getByRole('button', { name: 'Adapt selected with AI (1)' }));
    expect(
      await screen.findByText('AI drafts are switched off for this workspace.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adapt selected with AI/ })).toBeNull();
  });

  it('Send reviewed sends the drafts of the TICKED threads only, each its own', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11), draft(12)]);
    renderTicket();
    await screen.findByLabelText('Drafts to review');
    await user.click(box(12));
    await user.click(screen.getByRole('button', { name: 'Send reviewed to 1 thread' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Send the reviewed drafts to 1 thread?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/1 draft for unticked threads is not sent/)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(4, { fromDrafts: true }, [11], false, [])
    );
  });

  it('Send reviewed & resolve asks the server to resolve', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11)]);
    renderTicket();
    await user.click(await screen.findByRole('button', { name: 'Send reviewed & resolve' }));
    await confirmIn('Send & resolve');
    await waitFor(() => expect(send).toHaveBeenCalledWith(4, { fromDrafts: true }, [11], true, []));
  });

  it('Discard drafts asks first and sends nothing', async () => {
    const user = userEvent.setup();
    withDrafts([draft(11), draft(12)]);
    renderTicket();
    await user.click(await screen.findByRole('button', { name: 'Discard drafts' }));
    const dialog = await screen.findByRole('dialog');
    // The server removes only the drafts of threads the caller can open — never "all".
    expect(within(dialog).getByText('Discard your drafts on this ticket?')).toBeInTheDocument();
    expect(within(dialog).queryByText(/\bAll\b/)).toBeNull();
    await confirmIn('Discard');
    await waitFor(() => expect(discard).toHaveBeenCalledWith(4));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Sent from this ticket — Send here', () => {
  const earlier = (over: Record<string, unknown> = {}) => ({
    id: 7,
    content: '<p>We fixed it.</p>',
    createdAt: '2026-10-02T10:00:00Z',
    createdBy: null,
    deliveries: [{ conversationId: 11, outcome: 'sent', reason: null, updatedAt: '' }],
    hiddenCount: 0,
    attachments: [],
    ...over,
  });

  it('a thread left out on purpose gets its own "Send here"; it sends this reply to that thread only', async () => {
    const user = userEvent.setup();
    repliesOfTicket.mockResolvedValue({
      unavailable: false,
      replies: [earlier()],
      unreachable: [],
      names: [],
      maxThreads: 100,
    });
    send.mockResolvedValue({ replyId: 7, existing: true, queued: [12], skipped: [] });
    renderTicket();
    expect(await screen.findByText('We fixed it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /not had it/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Send this reply to customer-11@example.com' })
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Send this reply to customer-12@example.com' })
    );
    await confirmIn('Send');
    await waitFor(() => expect(send).toHaveBeenCalledWith(4, { replyId: 7 }, [12], undefined, []));
  });

  it('not offered where "have not had it" already offers it, for a thread it cannot reach, or one still sending', async () => {
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: [thread(11), thread(12), thread(13), thread(14)],
      hiddenCount: 0,
    });
    repliesOfTicket.mockResolvedValue({
      unavailable: false,
      replies: [
        earlier({
          deliveries: [
            { conversationId: 11, outcome: 'failed', reason: 'bounced', updatedAt: '' },
            { conversationId: 12, outcome: 'sending', reason: null, updatedAt: '' },
          ],
        }),
      ],
      unreachable: [{ conversationId: 13, reason: 'No customer address' }],
      names: [],
      maxThreads: 100,
    });
    renderTicket();
    expect(
      await screen.findByRole('button', { name: 'Send to the 1 thread that has not had it' })
    ).toBeInTheDocument();
    const offered = screen
      .queryAllByRole('button', { name: /^Send this reply to/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(offered).toEqual(['Send this reply to customer-14@example.com']);
  });

  it('a reply the agent cannot read is not offered anywhere', async () => {
    repliesOfTicket.mockResolvedValue({
      unavailable: false,
      replies: [earlier({ content: null, deliveries: [] })],
      unreachable: [],
      names: [],
      maxThreads: 100,
    });
    renderTicket();
    expect(
      await screen.findByText('Sent only to threads in departments you cannot open.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send this reply to/ })).toBeNull();
  });
});

describe('Adapt selected — batches of 5 (the server takes at most 10)', () => {
  const many = Array.from({ length: 12 }, (_, idx) => 21 + idx);
  const setupMany = () => {
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: many.map((id) => thread(id)),
      hiddenCount: 0,
    });
    withDrafts(many.map((id) => draft(id)));
  };
  const pickAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByLabelText('Drafts to review');
    for (const id of many) {
      await user.click(
        screen.getByRole('checkbox', { name: `Adapt with AI: customer-${id}@example.com` })
      );
    }
    await user.click(screen.getByRole('button', { name: 'Adapt selected with AI (12)' }));
  };
  const okAll = (_ticket: number, ids: number[]) =>
    Promise.resolve(ids.map((id) => ({ conversationId: id, ok: true, reason: null })));

  it('sends 5, 5, 2 in order, shows progress, merges every row, reloads once at the end', async () => {
    const user = userEvent.setup();
    setupMany();
    let release: () => void = () => undefined;
    adapt.mockImplementationOnce(
      (ticket: number, ids: number[]) =>
        new Promise((resolve) => {
          release = () => resolve(okAll(ticket, ids));
        })
    );
    adapt.mockImplementation(okAll);
    renderTicket();
    await pickAll(user);
    expect(await screen.findByText('Adapting 5 of 12…')).toBeInTheDocument();
    const readsBefore = draftsOfTicket.mock.calls.length;
    release();
    await waitFor(() => expect(adapt).toHaveBeenCalledTimes(3));
    expect(adapt.mock.calls.map((call) => call[1] as number[])).toEqual([
      many.slice(0, 5),
      many.slice(5, 10),
      many.slice(10),
    ]);
    await waitFor(() =>
      expect(screen.getAllByText('Adapted by AI — read it before sending.')).toHaveLength(12)
    );
    expect(draftsOfTicket.mock.calls.length - readsBefore).toBe(1);
    expect(screen.queryByText(/^Adapting/)).toBeNull();
  });

  it('a failing batch stops the run; the rest are reported as not adapted', async () => {
    const user = userEvent.setup();
    setupMany();
    adapt
      .mockImplementationOnce(okAll)
      .mockImplementationOnce(() => Promise.reject(new Error('limit')));
    renderTicket();
    await pickAll(user);
    await waitFor(() => expect(screen.getAllByText(/^Not adapted/)).toHaveLength(7));
    expect(screen.getAllByText('Adapted by AI — read it before sending.')).toHaveLength(5);
    expect(adapt).toHaveBeenCalledTimes(2);
  });

  it('AI drafts switched off mid-run (409): stops, says so, hides the action', async () => {
    const user = userEvent.setup();
    setupMany();
    adapt.mockImplementationOnce(okAll).mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('Off.'), {
          response: { status: 409, data: { code: 'AI_DRAFTS_OFF', error: 'Off.' } },
        })
      )
    );
    renderTicket();
    await pickAll(user);
    expect(
      await screen.findByText('AI drafts are switched off for this workspace.')
    ).toBeInTheDocument();
    expect(adapt).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /Adapt selected with AI/ })).toBeNull();
  });

  it('⛔ a ticket switch mid-run sends no further batch and shows nothing on the new ticket', async () => {
    const user = userEvent.setup();
    setupMany();
    let release: () => void = () => undefined;
    adapt.mockImplementationOnce(
      (ticket: number, ids: number[]) =>
        new Promise((resolve) => {
          release = () => resolve(okAll(ticket, ids));
        })
    );
    adapt.mockImplementation(okAll);
    const view = renderTicket();
    await pickAll(user);
    await screen.findByText('Adapting 5 of 12…');
    view.rerender(
      <MemoryRouter>
        <TicketThreads ticketId={5} fallback={<p>legacy list</p>} ticketStatus="open" />
      </MemoryRouter>
    );
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adapt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Adapted by AI — read it before sending.')).toBeNull();
  });
});

describe('A reply sent from reviewed drafts', () => {
  const reviewed = (own: boolean) => ({
    id: 7,
    content: '<p>Hi {first_name|there}, it is fixed.</p>',
    createdAt: '2026-10-02T10:00:00Z',
    createdBy: null,
    deliveries: [
      { conversationId: 11, outcome: 'sent', reason: null, updatedAt: '', hasOwnText: own },
      { conversationId: 12, outcome: 'failed', reason: 'bounced', updatedAt: '', hasOwnText: own },
    ],
    hiddenCount: 0,
    attachments: [],
  });
  const withReply = (own: boolean) =>
    repliesOfTicket.mockResolvedValue({
      unavailable: false,
      replies: [reviewed(own)],
      unreachable: [],
      names: [],
      maxThreads: 100,
    });
  const ORIGINAL = /They get the original text, filled in for them — not a reviewed version\./;

  it('says each customer got their own version; a re-send warns it is the original text', async () => {
    const user = userEvent.setup();
    withReply(true);
    renderTicket();
    expect(
      await screen.findByText('Each customer received their own reviewed version.')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Send to the 1 thread that has not had it' })
    );
    expect(within(await screen.findByRole('dialog')).getByText(ORIGINAL)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Send this reply to customer-13@example.com' })
    );
    expect(within(await screen.findByRole('dialog')).getByText(ORIGINAL)).toBeInTheDocument();
  });

  it('an ordinary reply says neither', async () => {
    const user = userEvent.setup();
    withReply(false);
    renderTicket();
    await screen.findByText(/sent to 1 of 3/);
    expect(screen.queryByText('Each customer received their own reviewed version.')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Send this reply to customer-13@example.com' })
    );
    expect(within(await screen.findByRole('dialog')).queryByText(ORIGINAL)).toBeNull();
  });
});
