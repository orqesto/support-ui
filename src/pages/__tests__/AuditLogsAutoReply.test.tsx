/**
 * Audit Logs can answer "what replied on its own, what was held, and why": the action filter
 * offers the two records an automatic reply leaves, and their rows say — without opening the raw
 * record — what happened, who wrote it (the AI or which keyword rule) and link to the thread.
 * The real page; only its data is supplied. Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { chooseOption, listOptions } from '@/test/chooseOption';

const state = vi.hoisted(() => ({
  logs: [] as unknown[],
  asked: [] as unknown[],
  countsAsked: [] as unknown[],
  /** What the counts endpoint answers: the counts, or an error to throw. */
  counts: null as unknown,
  countsError: null as null | { status: number; message: string },
  /** When true, the counts answer waits until `countsRelease` is called. */
  countsHold: false,
  countsRelease: null as null | (() => void),
  /** When set, the list request is refused with it. */
  listError: null as null | Error,
}));
vi.mock('@/services/auditLog.service', () => ({
  auditLogService: {
    getAll: (filters: unknown) => {
      state.asked.push(filters);
      if (state.listError) return Promise.reject(state.listError);
      return Promise.resolve({
        logs: state.logs,
        pagination: { page: 1, limit: 50, total: state.logs.length, totalPages: 1 },
      });
    },
    getAutoReplyCounts: (range: unknown) => {
      state.countsAsked.push(range);
      if (state.countsHold) {
        const refusal = Object.assign(new Error('Not found'), {
          status: 404,
          response: { status: 404, data: { success: false, error: 'Not found' } },
        });
        return new Promise((_resolve, reject) => {
          state.countsRelease = () => reject(refusal);
        });
      }
      if (state.countsError)
        return Promise.reject(
          Object.assign(new Error(state.countsError.message), {
            status: state.countsError.status,
            response: {
              status: state.countsError.status,
              data: { success: false, error: state.countsError.message },
            },
          })
        );
      return Promise.resolve(state.counts);
    },
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => Promise.resolve([]) },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { AuditLogsPage } from '../AuditLogsPage';
import { useAuditLogsStore } from '@/stores/auditLogsStore';

const log = (id: number, action: string, entityId: number, details: Record<string, unknown>) => ({
  id,
  action,
  entity: 'message',
  entityId: String(entityId),
  details,
  createdAt: '2026-11-20T10:00:00Z',
  ipAddress: null,
  userAgent: null,
  userId: null,
  userEmail: null,
});
const SENT = 'message.auto_reply_sent';
const HELD = 'message.auto_reply_withheld';

const show = async (logs: unknown[]) => {
  state.logs = logs;
  render(
    <MemoryRouter>
      <AuditLogsPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(state.asked.length).toBeGreaterThan(0));
};
/** The row's readable part: the card and the table both draw it (shown by breakpoint). */
const rows = () => screen.findAllByTestId('audit-auto-reply');

beforeEach(() => {
  state.logs = [];
  state.asked = [];
  state.countsAsked = [];
  state.countsError = null;
  state.countsHold = false;
  state.countsRelease = null;
  state.listError = null;
  state.counts = {
    range: { startDate: '2026-11-16T00:00:00Z', endDate: '2026-11-23T00:00:00Z' },
    totals: { sent: 14, wouldSend: 6, held: 9, acknowledgments: 30 },
    byChannel: [
      { channel: 'email', sent: 10, wouldSend: 6, held: 7, acknowledgments: 30 },
      { channel: 'chat_widget', sent: 4, wouldSend: 0, held: 2, acknowledgments: 0 },
    ],
    heldByReason: [
      { reason: 'restricted_topic', count: 4 },
      { reason: 'refusal', count: 2 },
      { reason: 'refusal_held', count: 1 },
      { reason: 'brand_new_code', count: 2 },
    ],
  };
  useAuditLogsStore.getState().resetFilters();
  useAuditLogsStore.getState().setLogs([]);
});
afterEach(cleanup);

describe('Audit Logs — automatic replies', () => {
  it('the action filter offers both records and asks the backend for the chosen one', async () => {
    await show([]);
    const filter = screen.getByRole('combobox', { name: 'Filter by action' });
    const options = await listOptions(filter);
    expect(options).toContain('Automatic reply → Sent');
    expect(options).toContain('Automatic reply → Held or not sent');
    await chooseOption(filter, 'Automatic reply → Held or not sent');
    await waitFor(() =>
      expect(state.asked.some((asked) => (asked as { action?: string }).action === HELD)).toBe(true)
    );
  });

  it('a keyword rule’s reply: the rule, its keyword, and a link to the thread', async () => {
    await show([
      log(1, SENT, 55, {
        source: 'keyword_rule',
        toStatus: 'resolved',
        ruleId: 3,
        ruleName: 'Refunds',
        keyword: 'refund',
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Auto-reply sent by rule "Refunds" (keyword "refund")');
    expect(row.textContent).toContain('Written by: Keyword rule "Refunds"');
    expect(within(row).getByRole('link', { name: 'Open thread' })).toHaveAttribute(
      'href',
      '/threads/55'
    );
    expect(screen.getAllByText('Automatic reply → Sent').length).toBeGreaterThan(0);
  });

  it('the AI’s reply and the AI’s question are told apart', async () => {
    await show([
      log(1, SENT, 56, { source: 'ai', toStatus: 'open' }),
      log(2, SENT, 57, { source: 'missing_info', toStatus: 'open' }),
    ]);
    const texts = (await rows()).map((row) => row.textContent ?? '');
    expect(
      texts.some((text) => text.includes('AI auto-reply sent') && text.includes('Written by: AI ·'))
    ).toBe(true);
    expect(
      texts.some((text) => text.includes('Written by: AI — question for missing details'))
    ).toBe(true);
  });

  it('a held AI reply says why, in words, with the backend’s own sentence', async () => {
    await show([
      log(1, HELD, 58, {
        source: 'ai_reply',
        reason: 'promises_follow_up',
        ruleIds: [],
        ruleNames: [],
        detail: 'The check every automatic reply passes held this reply.',
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain(
      'The automatic reply was not sent: the reply promised a follow-up'
    );
    expect(row.textContent).toContain('The check every automatic reply passes held this reply.');
    expect(row.textContent).toContain('Written by: AI');
    expect(row.textContent).not.toContain('promises_follow_up');
    expect(within(row).getByRole('link', { name: 'Open thread' })).toHaveAttribute(
      'href',
      '/threads/58'
    );
  });

  it('a held keyword reply names its rules', async () => {
    await show([
      log(1, HELD, 59, {
        reason: 'several_rules',
        ruleIds: [3, 4],
        ruleNames: ['Refunds', 'Returns'],
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Written by: Keyword rules "Refunds", "Returns"');
    expect(row.textContent).toMatch(/No auto-reply: rules .* both matched/);
  });

  it('CONTROL: another record gets no such line and keeps its own badge', async () => {
    await show([log(1, 'message.update', 60, { status: 'open' })]);
    expect((await screen.findAllByText('Message → Update')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('audit-auto-reply')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open thread' })).toBeNull();
  });
});

describe('Audit Logs — a list that cannot be read', () => {
  it('says so, where an empty table would read as "nothing happened"', async () => {
    // The shape the api-client's interceptor hands on (`status` and `data` on the error itself).
    state.listError = Object.assign(new Error('Request failed'), {
      status: 400,
      data: { success: false, error: 'Organization context required' },
    });
    await show([]);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The audit log could not be loaded: Organization context required'
    );
  });

  it('a server failure gets the plain sentence, with no technical text', async () => {
    state.listError = Object.assign(new Error('Request failed with status code 500'), {
      status: 500,
      data: { success: false, error: 'relation "audit_logs" does not exist' },
    });
    await show([]);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The audit log could not be loaded.'
    );
  });

  it("the rows of the request before it leave: they are not the failed request's answer", async () => {
    await show([
      log(1, SENT, 41, { source: 'keyword_rule', ruleName: 'Refunds', keyword: 'refund' }),
    ]);
    await waitFor(() => expect(screen.getAllByText(/Refunds/).length).toBeGreaterThan(0));
    state.listError = Object.assign(new Error('Request failed'), { status: 503, data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh the audit log' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Refunds/)).toBeNull());
  });

  it('CONTROL: a list that loads shows no error', async () => {
    await show([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Audit Logs — the automatic replies view (backend 2026-11-23)', () => {
  const lastAsked = () => state.asked.at(-1) as Record<string, unknown>;
  const pick = async (name: string, option: string) =>
    chooseOption(screen.getByRole('combobox', { name }), option);
  const openView = async () => {
    await show([]);
    await pick('Filter by action', 'Automatic reply → All');
    await waitFor(() => expect(lastAsked().action).toBe(`${SENT},${HELD}`));
  };

  it('"All" asks for both records at once, and the counts stand above the rows', async () => {
    await openView();
    const card = within(await screen.findByTestId('auto-reply-counts'));
    expect(await card.findByText('14')).toBeInTheDocument();
    expect(card.getByText('Sent')).toBeInTheDocument();
    expect(card.getByText('6')).toBeInTheDocument();
    expect(card.getByText('Would have been sent')).toBeInTheDocument();
    expect(card.getByText('9')).toBeInTheDocument();
    expect(card.getByText('Held for a person')).toBeInTheDocument();
    // Receipt confirmations are counted apart from Sent.
    expect(card.getByText('30')).toBeInTheDocument();
    expect(card.getByText('Receipt confirmations')).toBeInTheDocument();
    expect(card.getByText('Last 7 days')).toBeInTheDocument();
    const channels = card.getByRole('list', { name: 'Automatic replies by channel' }).textContent;
    expect(channels).toContain(
      'Email: 10 sent · 6 would have been sent · 7 held · 30 receipt confirmations'
    );
    expect(channels).toContain('Website chat: 4 sent · 0 would have been sent · 2 held');
    // Reasons in words; two codes with the same words are one line; an unknown code is no code.
    const reasons = card.getByRole('list', { name: 'Held replies by reason' }).textContent ?? '';
    expect(reasons).toContain(
      '4 — the customer asks about a restricted topic, or the reply states an amount with a unit of measure'
    );
    expect(reasons).toContain('3 — the reply only declined the question');
    expect(reasons).toContain('2 — it was held for a person');
    expect(reasons).not.toMatch(/restricted_topic|refusal_held|brand_new_code/);
    // No date filter: the backend's own default period.
    expect(state.countsAsked).toEqual([undefined]);
  });

  it('outside the view a button opens it: both records, and the counts card above the rows', async () => {
    await show([]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    );
    await waitFor(() => expect(lastAsked().action).toBe(`${SENT},${HELD}`));
    expect(await screen.findByTestId('auto-reply-counts')).toBeInTheDocument();
    // Inside the view the button has done its work and is gone.
    expect(
      screen.queryByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    ).toBeNull();
  });

  it('the button is for the unfiltered page: with another filter chosen it is not offered', async () => {
    await show([]);
    await pick('Filter by action', 'User → Create');
    await waitFor(() => expect(lastAsked().action).toBe('user.create'));
    expect(
      screen.queryByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    ).toBeNull();
  });

  it('CONTROL: outside the view there is no counts card and no reason or channel filter', async () => {
    await show([]);
    expect(screen.queryByTestId('auto-reply-counts')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter by reason' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter by channel' })).toBeNull();
    expect(state.countsAsked).toEqual([]);
  });

  it('the reason and channel filters are sent to the backend, and leave with the view', async () => {
    await openView();
    const BOUND = 'Showing the last 7 days — choose a date range for older entries.';
    // CONTROL: without a reason or a channel the list is not bounded, and nothing says it is.
    expect(screen.queryByText(BOUND)).toBeNull();
    await pick('Filter by reason', 'Would have been sent (check-only mode)');
    await waitFor(() => expect(lastAsked().reason).toBe('would_send'));
    // The backend bounds such a list to the last 7 days when no date is given: said.
    expect(screen.getByText(BOUND)).toBeInTheDocument();
    await pick('Filter by channel', 'Website chat');
    await waitFor(() => expect(lastAsked().channel).toBe('chat_widget'));
    expect(lastAsked().reason).toBe('would_send');
    await pick('Filter by action', 'Thread → Reply');
    await waitFor(() => expect(lastAsked().action).toBe('message.reply'));
    expect(lastAsked().reason).toBeUndefined();
    expect(lastAsked().channel).toBeUndefined();
  });

  it('Refresh counts again', async () => {
    await openView();
    await screen.findByText('14');
    fireEvent.click(
      document.querySelector('button svg.lucide-refresh-cw')?.closest('button') as HTMLElement
    );
    await waitFor(() => expect(state.countsAsked).toHaveLength(2));
  });

  it('a period the backend refuses is said in its own words', async () => {
    state.countsError = { status: 400, message: 'The period cannot be longer than 92 days' };
    await openView();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The period cannot be longer than 92 days'
    );
  });

  it('a backend without the counts: no card, no new filters, and "All" — which would list nothing — is taken away', async () => {
    state.countsError = { status: 404, message: 'Not found' };
    await show([]);
    await pick('Filter by action', 'Automatic reply → All');
    await waitFor(() => expect(screen.queryByTestId('auto-reply-counts')).toBeNull());
    // The view falls back to one record the backend can list.
    await waitFor(() => expect(lastAsked().action).toBe(SENT));
    expect(screen.queryByRole('combobox', { name: 'Filter by reason' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter by channel' })).toBeNull();
    const options = await listOptions(screen.getByRole('combobox', { name: 'Filter by action' }));
    expect(options).not.toContain('Automatic reply → All');
    expect(options).toContain('Automatic reply → Sent');
  });

  it('…and the button back on the unfiltered page then promises only what it opens: the sent ones', async () => {
    state.countsError = { status: 404, message: 'Not found' };
    await show([]);
    await pick('Filter by action', 'Automatic reply → All');
    await waitFor(() => expect(lastAsked().action).toBe(SENT));
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }));
    await waitFor(() => expect(lastAsked().action).toBeUndefined());
    expect(
      screen.queryByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Automatic replies that were sent' }));
    await waitFor(() => expect(lastAsked().action).toBe(SENT));
  });

  it('…also when "All" was chosen while the counts were still on their way', async () => {
    state.countsHold = true;
    await show([]);
    // The view is entered on "Sent"; the counts are asked for and do not answer yet.
    await pick('Filter by action', 'Automatic reply → Sent');
    await waitFor(() => expect(state.countsAsked).toHaveLength(1));
    await pick('Filter by action', 'Automatic reply → All');
    await waitFor(() => expect(lastAsked().action).toBe(`${SENT},${HELD}`));
    // Now the backend answers that it has no counts: "All" is what is chosen NOW.
    state.countsRelease?.();
    await waitFor(() => expect(lastAsked().action).toBe(SENT));
  });

  it('"Sent" says it includes replies sent but not recorded, which are listed under Held', async () => {
    await openView();
    const card = within(await screen.findByTestId('auto-reply-counts'));
    expect((await card.findByText('Sent')).closest('[title]')?.getAttribute('title')).toBe(
      'Replies emailed or posted with no person behind them — includes replies sent but not recorded, which are listed under Held'
    );
  });

  it('the meaning check of a keyword rule is a reason to filter by', async () => {
    await openView();
    await pick('Filter by reason', 'Message does not ask what the rule answers');
    await waitFor(() => expect(lastAsked().reason).toBe('rule_not_asked'));
  });

  it('a reason is asked for under every spelling it is stored with', async () => {
    await openView();
    await pick('Filter by reason', 'Reply only declined the question');
    await waitFor(() =>
      expect(lastAsked().reason).toBe('refusal,refusal_held,kb_refusal,blocked_gate')
    );
    await pick('Filter by reason', 'Reply not from the knowledge base');
    await waitFor(() =>
      expect(lastAsked().reason).toBe('not_from_knowledge,send_gate:not_from_knowledge')
    );
  });

  it('the card words the older codes too, and says what "held" covers', async () => {
    (state.counts as { heldByReason: unknown[] }).heldByReason = [
      { reason: 'kb_no_source', count: 3 },
      { reason: 'ai_drafts_off', count: 2 },
      { reason: 'blocked_degraded_analysis', count: 1 },
    ];
    await openView();
    const card = within(await screen.findByTestId('auto-reply-counts'));
    const reasons =
      (await card.findByRole('list', { name: 'Held replies by reason' })).textContent ?? '';
    expect(reasons).toContain('3 — no knowledge base answer was sure enough');
    expect(reasons).toContain('2 — AI drafts are off');
    expect(reasons).toContain('1 — the AI could not read this email properly');
    expect(reasons).not.toContain('it was held for a person');
    expect(card.getByText('Held for a person').closest('[title]')?.getAttribute('title')).toBe(
      'Not sent, or not confirmed sent'
    );
  });
});

describe('Audit Logs — what the newer records say in the row', () => {
  it('a would-send entry reads as passed and not sent — never as a hold', async () => {
    await show([
      log(1, HELD, 61, {
        source: 'ai_reply',
        replyPath: 'ai',
        channel: 'email',
        conversationId: 61,
        reason: 'would_send',
        checkOnly: true,
        ruleIds: [],
        ruleNames: [],
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain(
      'The AI reply passed every check and would have been sent — check-only mode, so it was kept as the draft'
    );
    expect(row.textContent).toContain('Written by: AI · Email');
    expect(row.textContent).not.toContain('would_send');
  });

  it('a sent reply says why it was allowed', async () => {
    await show([
      log(1, SENT, 62, {
        source: 'documentation',
        replyPath: 'ai',
        channel: 'email',
        conversationId: 62,
        toStatus: 'resolved',
        allowedBy: { gate: 'passed', confidence: 0.93, threshold: 0.9 },
      }),
      log(2, SENT, 63, {
        source: 'keyword_rule',
        replyPath: 'keyword_rule',
        channel: 'email',
        conversationId: 63,
        toStatus: 'resolved',
        ruleName: 'Refunds',
        allowedBy: { gate: 'fixed_text' },
      }),
    ]);
    const texts = (await rows()).map((row) => row.textContent ?? '');
    expect(
      texts.some((text) =>
        text.includes(
          'Allowed because it passed the check every automatic reply goes through (confidence 93%, needed 90%).'
        )
      )
    ).toBe(true);
    expect(
      texts.some((text) =>
        text.includes('Allowed because a fixed text written by your team, sent as it is.')
      )
    ).toBe(true);
  });

  it('a website chat that is not in the inbox links to the widgets’ chats, not to a thread', async () => {
    await show([
      {
        ...log(1, HELD, 900, {
          replyPath: 'widget',
          channel: 'chat_widget',
          conversationId: null,
          chatSessionId: 900,
          reason: 'restricted_topic',
        }),
        entity: 'chat_session',
      },
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain(
      "The website chat's reply was held for a person: the customer asks about a restricted topic, or the reply states an amount with a unit of measure"
    );
    expect(row.textContent).toContain('Written by: Website chat bot · Website chat');
    expect(within(row).getByRole('link', { name: 'Open website chats' })).toHaveAttribute(
      'href',
      '/settings#integrations/chat-widgets'
    );
    expect(within(row).queryByRole('link', { name: 'Open thread' })).toBeNull();
  });

  it('CONTROL: a website chat that IS in the inbox, and a Telegram turn, link to their thread', async () => {
    await show([
      log(1, SENT, 64, {
        replyPath: 'widget',
        channel: 'chat_widget',
        conversationId: 640,
        chatSessionId: 901,
        reason: 'answered',
        allowedBy: { gate: 'passed' },
      }),
      log(2, HELD, 65, {
        replyPath: 'telegram',
        channel: 'telegram',
        conversationId: 65,
        reason: 'refusal_held',
      }),
    ]);
    const all = await rows();
    const widget = all.find((row) =>
      row.textContent?.includes('The website chat answered on its own')
    );
    expect(
      within(widget as HTMLElement).getByRole('link', { name: 'Open thread' })
    ).toHaveAttribute('href', '/threads/640');
    const telegram = all.find((row) =>
      row.textContent?.includes('The Telegram bot left this chat')
    );
    expect(telegram?.textContent).toContain('the reply only declined the question');
    expect(telegram?.textContent).toContain('Written by: Telegram bot · Telegram');
  });

  it('a Telegram turn that sent a fixed line is not said to have passed the check, nor to be the team’s text', async () => {
    await show([
      log(1, SENT, 67, {
        replyPath: 'telegram',
        channel: 'telegram',
        conversationId: 67,
        reason: 'order_status',
        allowedBy: { gate: 'fixed_text' },
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Allowed because a fixed text, not written by the AI.');
    expect(row.textContent).not.toContain('passed the check');
    expect(row.textContent).not.toContain('written by your team');
  });

  it('a website chat that is not in the inbox opens on that very chat when the record names its widget', async () => {
    await show([
      {
        ...log(1, SENT, 902, {
          replyPath: 'widget',
          channel: 'chat_widget',
          conversationId: null,
          chatSessionId: 902,
          chatWidgetId: 5,
          reason: 'answered',
          allowedBy: { gate: 'passed', confidence: 0.91 },
        }),
        entity: 'chat_session',
      },
    ]);
    const [row] = await rows();
    expect(within(row).getByRole('link', { name: 'Open this chat' })).toHaveAttribute(
      'href',
      '/settings#integrations/chat-widgets?widget=5&chat=902'
    );
    expect(row.textContent).toContain('(confidence 91%)');
  });

  it('a reply that was sent but could not be recorded says so', async () => {
    await show([
      log(1, HELD, 68, {
        source: 'ai_reply',
        replyPath: 'ai',
        channel: 'email',
        conversationId: 68,
        reason: 'send_failed',
        sentUnrecorded: true,
        ruleIds: [],
        ruleNames: [],
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain(
      'The automatic reply was sent, but could not be recorded on the thread'
    );
    expect(row.textContent).not.toContain('could not be delivered');
  });

  it('a receipt confirmation reads as one, written by nobody', async () => {
    await show([
      log(1, SENT, 66, {
        source: 'acknowledgment',
        replyPath: 'acknowledgment',
        channel: 'email',
        conversationId: 66,
        allowedBy: { gate: 'fixed_text' },
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Receipt confirmation sent automatically');
    expect(row.textContent).toContain(
      'Written by: Nobody — the mailbox’s fixed receipt confirmation'
    );
  });
});
