/**
 * Thread presence send guard on the ticket composer (spec §5.4): a 409 REPLY_NEWER_EXISTS /
 * REPLY_OTHER_WRITING opens a confirm with the server's text; Send anyway sends the same reply with
 * confirmOverride; Cancel keeps the draft and reads the replies again. Any other refusal is shown
 * as before. And the composer reports "writing" on its ticked threads (usePresenceReport).
 */
import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const threadsOfTicket = vi.fn();
const repliesOfTicket = vi.fn();
const send = vi.fn();
const usePresenceReport = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/features/tickets/services/ticketThreads.service', () => ({
  ticketThreadsService: { threadsOfTicket, addThreads: vi.fn(), removeThread: vi.fn() },
}));
vi.mock('@/features/tickets/services/ticketReplies.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ticketRepliesService: { repliesOfTicket, send },
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads: vi.fn() } }));
vi.mock('@/features/tickets/services/ticketDrafts.service', () => ({
  ticketDraftsService: { draftsOfTicket: vi.fn().mockResolvedValue({ unavailable: true }) },
}));
vi.mock('@/services/replyTemplates.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  replyTemplatesService: { list: vi.fn().mockResolvedValue({ unavailable: true }) },
}));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false }),
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACME' }));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/features/messages/shell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePresenceReport,
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

const { TicketThreads } = await import('@/features/tickets/components/TicketThreads');

const thread = (id: number) => ({
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
});

const refused = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, data: { error: message, code } });
const NEWER = 'SUP-12: Anna replied 20 s ago — send anyway?';

const renderTicket = () =>
  render(
    <MemoryRouter>
      <TicketThreads ticketId={4} fallback={<p>legacy list</p>} ticketStatus="open" />
    </MemoryRouter>
  );

const box = (id: number) =>
  screen.getByRole('checkbox', { name: `Reply to customer-${id}@example.com` });

const sendReply = async (text: string) => {
  const user = userEvent.setup();
  renderTicket();
  await waitFor(() => expect(box(11)).toBeChecked());
  await user.type(screen.getByLabelText('Reply text'), text);
  await user.click(screen.getByRole('button', { name: 'Send to 2 threads' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  send.mockReset(); // a queued once-answer must not outlive its test
  threadsOfTicket.mockResolvedValue({
    unavailable: false,
    rows: [thread(11), thread(12)],
    hiddenCount: 0,
  });
  repliesOfTicket.mockResolvedValue({
    unavailable: false,
    replies: [],
    unreachable: [],
    names: [],
    maxThreads: 100,
  });
});

describe('ticket composer — someone got there first', () => {
  it('opens the confirm with the server text verbatim; no error line under the box', async () => {
    send.mockRejectedValueOnce(refused(409, 'REPLY_NEWER_EXISTS', NEWER));
    await sendReply('We fixed it.');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(NEWER)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send anyway' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Only inside the dialog, not also as the composer's error line.
    expect(screen.getAllByText(NEWER)).toHaveLength(1);
  });

  it('Send anyway sends the same reply again with confirmOverride', async () => {
    send
      .mockRejectedValueOnce(
        refused(409, 'REPLY_OTHER_WRITING', 'Ben is writing a reply — send anyway?')
      )
      .mockResolvedValueOnce({ replyId: 9, existing: false, queued: [11, 12], skipped: [] });
    const user = await sendReply('We fixed it.');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send anyway' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]).toEqual([4, { content: 'We fixed it.' }, [11, 12], false, []]);
    expect(send.mock.calls[1]).toEqual([
      4,
      { content: 'We fixed it.' },
      [11, 12],
      false,
      [],
      undefined,
      { confirmOverride: true },
    ]);
    expect(await screen.findByText('Sending to 2 threads…')).toBeInTheDocument();
    expect(screen.getByLabelText('Reply text')).toHaveValue('');
  });

  it('Cancel keeps the draft and reads the replies again', async () => {
    send.mockRejectedValueOnce(refused(409, 'REPLY_NEWER_EXISTS', NEWER));
    const user = await sendReply('We fixed it.');
    const dialog = await screen.findByRole('dialog');
    const reads = repliesOfTicket.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText('Reply text')).toHaveValue('We fixed it.');
    await waitFor(() => expect(repliesOfTicket.mock.calls.length).toBeGreaterThan(reads));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('another 409 is shown as before, under the box, with no dialog', async () => {
    send.mockRejectedValueOnce(refused(409, 'REPLY_IN_FLIGHT', 'Still being sent.'));
    await sendReply('We fixed it.');
    expect(await screen.findByText('Still being sent.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ticket composer — presence', () => {
  it('reports its text as a reply on the ticked threads', async () => {
    const user = userEvent.setup();
    renderTicket();
    await waitFor(() => expect(box(11)).toBeChecked());
    await user.type(screen.getByLabelText('Reply text'), 'Hi');
    const [ids, input] = usePresenceReport.mock.calls.at(-1) as [
      number[],
      { composerText: string; composerMode: string; lastAgentEditAt: { current: number | null } },
    ];
    expect(ids).toEqual([11, 12]);
    expect(input.composerText).toBe('Hi');
    expect(input.composerMode).toBe('reply');
    expect(input.lastAgentEditAt.current).toEqual(expect.any(Number));
  });
});
