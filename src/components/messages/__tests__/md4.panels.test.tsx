import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import { MessageKBReferences } from '../MessageKBReferences';
import { MessageAttachments, attachmentOrigin, type Attachment } from '../MessageAttachments';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { AddToTicketDialog } from '../AddToTicketDialog';
import { MergedSection } from '../MergeThreads';
import { parseSender } from '@/lib/messageHelpers';
import { ACTIVITY_DOT, activityKindOf, buildTimeline } from '../messageActivityTimeline';
import { channelName } from '../messageDetailConstants';
import type { MessageActivityEntry, MessageNote } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message, MessageEvent, User } from '@/types';

/**
 * Message detail v4 — the tabbed context panel (areas P2–P7, one describe each). P1 (the strip)
 * is in MessagePanelTabs.strip.test.tsx; P5's summary row is in CustomApiLookupPanel.test.tsx.
 */

const similar = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const kbRefs = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: (...args: unknown[]) => similar(...args),
    getKBReferences: (...args: unknown[]) => kbRefs(...args),
  },
}));
// The ticket picker's first read and the merge section's org code, for the P4 control below.
vi.mock('@/services/ticket.service', () => ({
  ticketService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => undefined }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: { run: vi.fn(), availability: vi.fn().mockResolvedValue(false) },
}));

let nextId = 9100;
const baseMessage = (over: Partial<Message> = {}): Message =>
  ({
    id: nextId++, // fresh per test: AiTabPanel caches similar results per conversation
    sender: 'Marta Kowalczyk <marta@example.com>',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata: {},
    ...over,
  }) as unknown as Message;

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
};

const noop = () => {};
const tabsProps = (over: Partial<MessagePanelTabsProps>): MessagePanelTabsProps =>
  ({
    message: baseMessage(),
    variant: 'sidebar',
    tab: 'customer',
    setTab: noop,
    panelOpen: true,
    setPanelOpen: noop,
    notes: [],
    onNoteUpdated: noop,
    onNoteDeleted: noop,
    noteActivityLog: [],
    messageActivity: [],
    sortedThread: [],
    threadRefreshKey: 0,
    currentUserId: 9,
    leadState: null,
    setLeadState: noop,
    leadFieldDefs: [],
    onGhostClick: noop,
    setComposerMode: noop,
    noteEditorRef: createRef(),
    ...over,
  }) as unknown as MessagePanelTabsProps;

beforeEach(() => {
  similar.mockReset();
  similar.mockResolvedValue({ success: true, data: [] });
  kbRefs.mockReset();
  kbRefs.mockResolvedValue({ success: true, data: [] });
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

// ─── P2 ────────────────────────────────────────────────────────────────────────
describe('P2 — AI tab: Summary, facets, Reason, flags', () => {
  const analysed = baseMessage({
    detectedLanguage: 'en',
    metadata: {
      analysis: {
        summary: 'Wrong size received, needs an exchange.',
        suggestedCategory: 'Returns',
        confidence: 0.87,
        isTicketWorthy: true,
        needsMoreInfo: false,
        suggestedPriority: 'high',
      },
      spamCheck: {
        isSpam: false,
        reason: 'Known customer, order matches.',
        greenFlags: ['known_sender'],
        redFlags: ['urgent_language'],
      },
    },
  } as unknown as Partial<Message>);

  it('renders Summary BEFORE the facets, then Reason, then the flags', () => {
    wrap(<AiTabPanel message={analysed} onGhostClick={noop} section="analysis" />);
    const summary = screen.getByTestId('ai-summary');
    const facets = screen.getByTestId('ai-facets');
    const reason = screen.getByText('Known customer, order matches.');
    const flags = screen.getByText('Green flags');
    const follows = (first: Node, second: Node) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(summary, facets)).toBe(true);
    expect(follows(facets, reason)).toBe(true);
    expect(follows(reason, flags)).toBe(true);
  });

  it('keeps every facet staging showed, with sentence-case labels and bold values', () => {
    wrap(<AiTabPanel message={analysed} onGhostClick={noop} section="analysis" />);
    const facets = screen.getByTestId('ai-facets');
    const labels = Array.from(facets.children).map(
      (facet) => facet.querySelector('span')?.textContent
    );
    expect(labels).toEqual([
      'Class',
      'Category',
      'Confidence',
      'Ticket',
      'Info',
      'Language',
      'Priority',
    ]);
    expect(within(facets).getByText('87%').tagName).toBe('B');
    expect(within(facets).getByText('Worthy')).toBeTruthy();
    expect(within(facets).getByText('Complete')).toBeTruthy();
    // The priority is worded by the shared helper ("High"), not CSS-capitalised raw text.
    const priority = within(facets).getByText('High');
    expect(priority.className).not.toContain('capitalize');
    // No shouting: none of the labels carries the uppercase class.
    for (const facet of Array.from(facets.children)) {
      expect(facet.querySelector('span')?.className).not.toMatch(/(^|\s)uppercase(\s|$)/);
    }
    expect(screen.getByText('Red flags')).toBeTruthy();
  });

  it('facets fall to two columns in a narrow panel and three when it is wide enough', () => {
    wrap(<AiTabPanel message={analysed} onGhostClick={noop} section="analysis" />);
    expect(screen.getByTestId('ai-facets').className).toContain(
      'grid-cols-[repeat(auto-fill,minmax(130px,1fr))]'
    );
  });
});

// ─── P3 ────────────────────────────────────────────────────────────────────────
describe('P3 — KB tab: suggested reply card and the entries saved from this thread', () => {
  it('"Use in reply" (was "Use") sends the selected answer to the composer', async () => {
    const onGhostClick = vi.fn();
    wrap(
      <AiTabPanel
        message={baseMessage({
          metadata: { suggestedAnswer: { answer: 'Here is your label.', source: 'ai' } },
        } as unknown as Partial<Message>)}
        onGhostClick={onGhostClick}
        section="suggested"
      />
    );
    const use = await screen.findByRole('button', { name: /^use in reply$/i });
    expect(screen.queryByRole('button', { name: /^use$/i })).toBeNull();
    expect(screen.getByText('Suggested reply')).toBeTruthy();
    await userEvent.click(use);
    expect(onGhostClick).toHaveBeenCalledWith('Here is your label.', 'message', undefined);
  });

  it('no answer handler (a thread with no composer): the suggestion shows, "Use in reply" does not', async () => {
    wrap(
      <AiTabPanel
        message={baseMessage({
          metadata: { suggestedAnswer: { answer: 'Here is your label.', source: 'ai' } },
        } as unknown as Partial<Message>)}
        section="suggested"
      />
    );
    expect(await screen.findByText('Suggested reply')).toBeTruthy();
    expect(screen.getByText(/Here is your label\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^use in reply$/i })).toBeNull();
  });

  it('source pills keep staging labels, mark the selected one, and a past reply shows the privacy hint', async () => {
    similar.mockResolvedValue({
      success: true,
      data: [
        {
          messageId: 77,
          directReply: 'Hi Joy, sorry about the size.',
          similarity: 0.82,
          source: 'message',
          sender: 'Joy <j.nowak@example.net>',
        },
      ],
    });
    wrap(
      <AiTabPanel
        message={baseMessage({
          metadata: {
            suggestedAnswer: { answer: 'Docs answer.', source: 'documentation', confidence: 0.91 },
          },
        } as unknown as Partial<Message>)}
        onGhostClick={noop}
        section="suggested"
      />
    );
    // Toggle buttons in a named group — not tabs, which promise arrow keys and a tabpanel.
    expect(screen.queryByRole('tablist')).toBeNull();
    const group = await screen.findByRole('group', { name: 'Suggestion source' });
    const docs = within(group).getByRole('button', { name: 'DOCS 91%' });
    const past = within(group).getByRole('button', { name: 'PAST REPLY 82% → j.nowak@example.net' });
    // The explicit name is the pill's visible words — the two cannot drift apart.
    for (const pill of [docs, past]) expect(pill.getAttribute('aria-label')).toBe(pill.textContent);
    expect(docs.getAttribute('aria-pressed')).toBe('true');
    expect(past.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('past-reply-hint')).toBeNull();
    await userEvent.click(past);
    expect(past.getAttribute('aria-pressed')).toBe('true');
    expect(docs.getAttribute('aria-pressed')).toBe('false');
    // Exact: the old "with their name removed" was false for "Thanks Marta" / "Dear Mr. Smith".
    expect(screen.getByTestId('past-reply-hint').textContent).toBe(
      'A reply sent to another customer. Check it for their name or account details before you use it.'
    );
  });

  it('KB references render as compact rows under what the data is, keeping their data', async () => {
    kbRefs.mockResolvedValue({
      success: true,
      data: [
        {
          id: 5,
          type: 'qa_pair',
          title: 'Returns policy 2026',
          content: 'Free within 30 days.',
          qualityScore: 0.9,
          approved: true,
          timesReferenced: 3,
          lastReferencedAt: null,
          topics: ['returns'],
          category: null,
          typeData: null,
          createdAt: '2026-09-01T10:00:00Z',
        },
      ],
    });
    const onCountChange = vi.fn();
    wrap(<MessageKBReferences messageId={42} onCountChange={onCountChange} />);
    // The endpoint returns entries CREATED FROM this message — the heading says that, not
    // "referenced in this thread".
    expect(
      await screen.findByRole('heading', { name: 'Saved to the knowledge base from this thread' })
    ).toBeTruthy();
    expect(screen.queryByText(/Referenced in this thread/)).toBeNull();
    expect(screen.queryByText(/created from this message/)).toBeNull(); // the caption is gone
    expect(screen.queryByText('Knowledge Base References')).toBeNull();
    expect(screen.getByText('Returns policy 2026')).toBeTruthy();
    // timesReferenced is the workspace-wide AI citation count — said so, never "in this thread".
    expect(
      screen.getByText(/Q&A · returns · Quality: 90% · AI used it 3× \(all threads\)/)
    ).toBeTruthy();
    expect(screen.queryByText(/Referenced: /)).toBeNull();
    expect(screen.getByRole('button', { name: 'View in Knowledge Base' })).toBeTruthy();
    expect(onCountChange).toHaveBeenCalledWith(42, 1);
  });

  it('an entry the AI never used says nothing about use (no "0×")', async () => {
    kbRefs.mockResolvedValue({
      success: true,
      data: [
        {
          id: 6,
          type: 'document',
          title: 'Shipping zones',
          content: '',
          qualityScore: null,
          approved: false,
          timesReferenced: 0,
          lastReferencedAt: null,
          topics: null,
          category: null,
          typeData: null,
          createdAt: '2026-09-01T10:00:00Z',
        },
      ],
    });
    wrap(<MessageKBReferences messageId={43} />);
    expect(await screen.findByText('Shipping zones')).toBeTruthy();
    expect(screen.queryByText(/AI used it/)).toBeNull();
    expect(screen.getByText(/^Document · Created: /)).toBeTruthy();
  });
});

// ─── P4 ────────────────────────────────────────────────────────────────────────
describe('P4 — Customer tab: sender block, facts, no tickets/merge sections', () => {
  /*
    v4 moved tickets and merges to the header's Related chips. What the Customer tab must not say,
    as the agent would read it — the words of the header's own merge section and ticket picker.
  */
  const MERGE_WORDS = /Same conversation|Merge with another thread|Unmerge/;
  const TICKET_WORDS = /Add (this thread )?to (a )?ticket|Not on any ticket|New ticket/;

  it('CONTROL: those words DO match the live merge section and ticket picker', async () => {
    const message = baseMessage();
    wrap(
      <>
        <MergedSection
          message={message}
          merges={[{ id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null }]}
          canManage
          onMerge={vi.fn()}
          onUnmerged={vi.fn()}
        />
        <AddToTicketDialog
          open
          onOpenChange={vi.fn()}
          message={message}
          excludeTicketIds={[]}
          onAdded={vi.fn()}
        />
      </>
    );
    expect(screen.getAllByText(MERGE_WORDS).length).toBeGreaterThan(0);
    expect(screen.getAllByText(TICKET_WORDS).length).toBeGreaterThan(0);
    await screen.findByText('No other tickets to add it to.');
  });

  it('shows the name bold, the address second, the facts — and no ticket/merge sections', () => {
    wrap(
      <MessagePanelTabs
        {...tabsProps({
          message: baseMessage({
            assigneeName: 'Daniel Reiss',
            priority: 'high',
          } as Partial<Message>),
        })}
      />
    );
    const sender = screen.getByTestId('customer-sender');
    const name = within(sender).getByText('Marta Kowalczyk');
    expect(name.tagName).toBe('B');
    expect(within(sender).getByText('marta@example.com')).toBeTruthy();
    for (const [label, value] of [
      ['Channel', 'Email'],
      ['Thread', '1 message'],
      ['Assigned', 'Daniel Reiss'],
      ['Priority', 'High'],
    ]) {
      const term = screen.getByText(label, { selector: 'dt' });
      expect(term.className).not.toMatch(/(^|\s)uppercase(\s|$)/);
      expect(term.nextElementSibling?.textContent).toBe(value);
    }
    expect(screen.getByText('Received', { selector: 'dt' })).toBeTruthy();
    // The tab is rendered and readable (the facts above) — and says nothing of tickets or merges.
    expect(screen.queryAllByText(MERGE_WORDS)).toHaveLength(0);
    expect(screen.queryAllByText(TICKET_WORDS)).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Same conversation' })).toBeNull();
  });

  it('the Thread fact counts messages in the singular for one and plural for two', () => {
    const event = (id: number) => ({ id, type: 'inbound' }) as unknown as MessageEvent;
    const threadFact = () =>
      screen.getByText('Thread', { selector: 'dt' }).nextElementSibling?.textContent;
    const { unmount } = wrap(
      <MessagePanelTabs
        {...tabsProps({ sortedThread: [event(1)] } as Partial<MessagePanelTabsProps>)}
      />
    );
    expect(threadFact()).toBe('1 message');
    unmount();
    wrap(
      <MessagePanelTabs
        {...tabsProps({ sortedThread: [event(1), event(2)] } as Partial<MessagePanelTabsProps>)}
      />
    );
    expect(threadFact()).toBe('2 messages');
  });

  it('a bare address is shown bold on its own; a non-email channel goes on the second line', () => {
    wrap(
      <MessagePanelTabs
        {...tabsProps({
          message: baseMessage({
            sender: '+48 600 100 200',
            channel: 'whatsapp',
          } as Partial<Message>),
        })}
      />
    );
    const sender = screen.getByTestId('customer-sender');
    expect(within(sender).getByText('+48 600 100 200').tagName).toBe('B');
    // The channel's own name — "WhatsApp", never the capitalised key "Whatsapp".
    expect(within(sender).getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Channel', { selector: 'dt' }).nextElementSibling?.textContent).toBe(
      'WhatsApp'
    );
  });

  it('channelName: each channel by its name; an unknown key still reads as a word', () => {
    expect(channelName('whatsapp')).toBe('WhatsApp');
    expect(channelName('telegram')).toBe('Telegram');
    expect(channelName('email')).toBe('Email');
    expect(channelName('slack')).toBe('Slack');
    expect(channelName('chat')).toBe('Chat');
    expect(channelName('carrier_pigeon')).toBe('Carrier pigeon');
    expect(channelName(undefined)).toBe('');
  });

  it('parseSender: name, quoted name, bare address, name equal to the address', () => {
    expect(parseSender('Marta K <m@x.io>')).toEqual({ name: 'Marta K', address: 'm@x.io' });
    expect(parseSender('"Kowalczyk, Marta" <m@x.io>')).toEqual({
      name: 'Kowalczyk, Marta',
      address: 'm@x.io',
    });
    expect(parseSender('m@x.io')).toEqual({ name: null, address: 'm@x.io' });
    expect(parseSender('<m@x.io>')).toEqual({ name: null, address: 'm@x.io' });
    expect(parseSender('m@x.io <m@x.io>')).toEqual({ name: null, address: 'm@x.io' });
    expect(parseSender(null)).toEqual({ name: null, address: '' });
  });
});

// ─── P6 ────────────────────────────────────────────────────────────────────────
describe('P6 — Files: v4 rows with "size · who · when" and always-visible actions', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const att = (over: Partial<Attachment>): Attachment =>
    ({
      id: 1,
      filename: 'f',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      size: 84 * 1024,
      url: '',
      messageEventId: null,
      ...over,
    }) as unknown as Attachment;
  const inbound = {
    id: 300,
    type: 'inbound',
    authorEmail: 'marta@example.com',
    createdAt: minutesAgo(120),
    metadata: { receivedAt: minutesAgo(120) },
  } as unknown as MessageEvent;
  const reply = {
    id: 301,
    type: 'outbound',
    authorEmail: 'support@shop.com',
    authorName: 'Daniel Reiss',
    sentAt: minutesAgo(30),
    createdAt: minutesAgo(31),
  } as unknown as MessageEvent;

  it('names who sent the owning message and when, and keeps both buttons visible', () => {
    wrap(
      <MessageAttachments
        message={baseMessage()}
        sortedThread={[inbound, reply]}
        preloadedAttachments={[
          att({ id: 1, messageEventId: 300 }),
          att({ id: 2, originalFilename: 'label.png', mimeType: 'image/png', messageEventId: 301 }),
        ]}
      />
    );
    const origins = screen.getAllByTestId('file-origin').map((node) => node.textContent);
    expect(origins).toEqual([' · marta@example.com · 2h ago', ' · Daniel Reiss · 30m ago']);
    for (const row of screen.getAllByTestId('file-row')) {
      const download = within(row).getByRole('button', { name: /^Download / });
      // Not hover-only: neither the button nor any ancestor in the row hides it until hover.
      let node: HTMLElement | null = download;
      while (node && node !== row.parentElement) {
        expect(node.className).not.toMatch(/opacity-0|group-hover/);
        node = node.parentElement;
      }
      expect(download.className).toContain('w-[30px]');
    }
    expect(screen.getByRole('button', { name: 'Preview invoice.pdf' })).toBeTruthy();
    expect(screen.getAllByText('84.0 KB')).toHaveLength(2);
  });

  it('no owning event in the thread ⇒ what staging showed ("Received"), never an invented person', () => {
    wrap(
      <MessageAttachments
        message={baseMessage()}
        sortedThread={[inbound]}
        preloadedAttachments={[att({ id: 3, messageEventId: 999 }), att({ id: 4 })]}
      />
    );
    expect(screen.queryByTestId('file-origin')).toBeNull();
    expect(screen.getAllByText('Received')).toHaveLength(2);
  });

  it('attachmentOrigin: a reply with no resolved person falls back to the mailbox; blank names are absent', () => {
    const events = new Map<number, MessageEvent>([
      [1, { ...reply, id: 1, authorName: '  ' } as MessageEvent],
      [2, { ...inbound, id: 2, authorEmail: null } as unknown as MessageEvent],
    ]);
    expect(attachmentOrigin(att({ messageEventId: 1 }), events)?.who).toBe('support@shop.com');
    expect(attachmentOrigin(att({ messageEventId: 2 }), events)?.who).toBeNull();
    expect(attachmentOrigin(att({ messageEventId: null }), events)).toBeNull();
  });

  it('a form-relayed message names the person the way its bubble does ("Jane · via mailer@")', () => {
    const relayedEvent = {
      ...inbound,
      id: 5,
      authorEmail: '"Orbelli (Shopify)" <mailer@shopify.com>',
      metadata: { receivedAt: minutesAgo(120), relayedFrom: { email: 'jane@x.io', name: 'Jane' } },
    } as unknown as MessageEvent;
    const noName = {
      ...relayedEvent,
      id: 6,
      metadata: { relayedFrom: { email: 'jane@x.io', name: null } },
    } as unknown as MessageEvent;
    // A stamp naming the envelope itself (history repair) says nothing extra — as the bubble.
    const selfStamp = {
      ...inbound,
      id: 7,
      metadata: { relayedFrom: { email: 'marta@example.com' } },
    } as unknown as MessageEvent;
    const events = new Map<number, MessageEvent>([
      [5, relayedEvent],
      [6, noName],
      [7, selfStamp],
    ]);
    expect(attachmentOrigin(att({ messageEventId: 5 }), events)?.who).toBe(
      'Jane · via mailer@shopify.com'
    );
    expect(attachmentOrigin(att({ messageEventId: 6 }), events)?.who).toBe(
      'jane@x.io · via mailer@shopify.com'
    );
    expect(attachmentOrigin(att({ messageEventId: 7 }), events)?.who).toBe('marta@example.com');
  });

  it('empty state is unchanged', () => {
    wrap(<MessageAttachments message={baseMessage()} preloadedAttachments={[]} />);
    expect(screen.getByText('No attachments')).toBeTruthy();
  });
});

// ─── P7 ────────────────────────────────────────────────────────────────────────
describe('P7 — Activity: the dot says what kind of thing happened', () => {
  const entry = (action: string, createdAt: string): MessageActivityEntry => ({
    id: 1,
    action,
    details: null,
    createdAt,
    userEmail: 'agent@example.com',
    userId: 7,
  });

  it('maps each audit action to its kind, from the data only', () => {
    expect(activityKindOf('message.create')).toBe('in');
    expect(activityKindOf('message.auto_client_replied')).toBe('in');
    expect(activityKindOf('message.auto_reopen')).toBe('in');
    expect(activityKindOf('message.reply')).toBe('out');
    expect(activityKindOf('message.compose_new')).toBe('out');
    expect(activityKindOf('message.auto_route')).toBe('other');
    expect(activityKindOf('ticket.resolve')).toBe('other');
    expect(activityKindOf('message.something_new')).toBe('other');
  });

  it('each kind has its own token colour (no raw hex)', () => {
    expect(ACTIVITY_DOT).toEqual({
      in: 'bg-primary-solid',
      out: 'bg-success',
      note: 'bg-warning',
      ai: 'bg-ai',
      other: 'bg-border-strong',
    });
  });

  it('notes and in-session note edits are notes', () => {
    const note = {
      id: 1,
      createdAt: '2026-09-22T11:00:00Z',
      authorName: 'Ana',
    } as unknown as MessageNote;
    const items = buildTimeline(
      [entry('message.reply', '2026-09-22T10:00:00Z')],
      [note],
      [{ label: 'Note edited', who: 'Ana', time: '2026-09-22T12:00:00Z' }]
    );
    expect(items.map((item) => item.kind)).toEqual(['out', 'note', 'note']);
  });

  it('renders the dot class for each row in the Activity tab', () => {
    wrap(
      <MessagePanelTabs
        {...tabsProps({
          tab: 'activity',
          messageActivity: [
            entry('message.auto_client_replied', '2026-09-22T09:00:00Z'),
            entry('message.reply', '2026-09-22T10:00:00Z'),
            entry('message.assign', '2026-09-22T11:00:00Z'),
          ],
        })}
      />
    );
    const rows = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(rows.map((row) => row.dataset.kind)).toEqual(['in', 'out', 'other']);
    expect(rows[0].querySelector('span')?.className).toContain('bg-primary-solid');
    expect(rows[1].querySelector('span')?.className).toContain('bg-success');
    expect(rows[2].querySelector('span')?.className).toContain('bg-border-strong');
  });

  it('empty state is unchanged', async () => {
    wrap(<MessagePanelTabs {...tabsProps({ tab: 'activity' })} />);
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeTruthy());
  });
});
