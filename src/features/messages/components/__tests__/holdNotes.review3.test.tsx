/**
 * Hold notes, third review (of #902):
 *  1. A plain-text thread note is printed as typed — "<supplier>", "<b>", "&amp;" and line breaks
 *     kept — with or without `contentFormat`; the Notes tab, the ticket page and the thread decide
 *     the same way (`noteDisplay`). A ticket comment without it: HTML only in the editor's shape.
 *  2. Ticket-comment HTML keeps its links (href, opened safely), quotes and h1–h3.
 *  3. A status change folds into an un-hold note only when it IS that un-hold.
 *  4. Clearing a reason re-reads the header chip, the notes and Activity (and on the event).
 *  5+6. One workspace-admin check, for the tab's workspace — a profile for another one is not it.
 *  7. The un-hold cause is read from the note's text: every backend phrase parses; one date format.
 *  8. No Clear reason for an un-hold note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoteContent } from '@/components/shared/NoteContent';
import {
  noteBodyText,
  noteDisplay,
  noteFromEditor,
  noteToEditor,
  type NoteBody,
  type NoteOrigin,
} from '@/lib/noteText';
import { formatDay } from '@/lib/utils';
import { aiRefusalText } from '@/lib/starterAllowance';
import { useIsWorkspaceAdmin } from '@/hooks/useIsWorkspaceAdmin';
import { useAiRefusalText } from '@/features/subscription/shell';
import * as subscriptionShell from '@/features/subscription/shell';
import {
  messageService,
  type MessageActivityEntry,
  type MessageNote,
} from '@/services/message.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { auditEntryLabel, buildTimeline, unholdCause } from '../messageActivityTimeline';
import { useThreadEvents } from '../messageDetail/useThreadEvents';

const socketHandlers = vi.hoisted(() => new Map<string, Set<(data: unknown) => void>>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: vi.fn(),
  subscribeToEvent: (name: string, handler: (data: unknown) => void) => {
    if (!socketHandlers.has(name)) socketHandlers.set(name, new Set());
    socketHandlers.get(name)?.add(handler);
  },
  unsubscribeFromEvent: (name: string, handler: (data: unknown) => void) =>
    socketHandlers.get(name)?.delete(handler),
}));
const emit = (name: string, data: unknown) =>
  socketHandlers.get(name)?.forEach((handler) => handler(data));

const ME = 9;

const note = (over: Partial<MessageNote> = {}): MessageNote => ({
  id: 23,
  messageId: 41,
  userId: ME,
  authorName: 'Sam Agent',
  content: '',
  isInternal: true,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
  ...over,
});
const holdNote = (over: Partial<MessageNote> = {}) =>
  note({
    id: 21,
    content: 'On hold: supplier',
    source: 'hold',
    metadata: { kind: 'hold', reason: 'supplier', until: null },
    ...over,
  });
const unholdNote = (content: string, createdAt = '2026-11-09T10:00:00.000Z') =>
  note({
    id: 22,
    content,
    createdAt,
    source: 'hold',
    metadata: { kind: 'unhold', cause: 'customer_reply' },
  });
const statusChange = (
  details: Record<string, unknown>,
  createdAt = '2026-11-09T10:00:20.000Z'
): MessageActivityEntry => ({
  id: 1,
  action: 'message.status_change',
  details,
  createdAt,
  userEmail: 'agent@example.com',
  userId: ME,
});

const asRole = (organizationRole: string, organizationId = 1, selected = 1, role = 'user') =>
  useAuthStore.setState({
    selectedOrganizationId: selected,
    user: { id: ME, role, organizationRole, organizationId } as unknown as User,
  });

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const withClient = (ui: ReactNode) =>
  render(<QueryClientProvider client={client()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  asRole('support');
  socketHandlers.clear();
});
afterEach(() => vi.restoreAllMocks());

/** Typed into the thread's note box: tags, an entity and line breaks that are all just text. */
const TYPED = 'waiting for <supplier> quote,\ncall <b>asap</b>\nR&amp;D';

const shown = (content: string, origin: NoteOrigin, over: Partial<NoteBody> = {}) => {
  const { container, unmount } = render(
    <NoteContent note={{ messageId: 41, ...over, content }} origin={origin} className="body" />
  );
  const body = container.firstElementChild as HTMLElement;
  const result = { text: body.textContent, html: body.innerHTML, bold: body.querySelector('b') };
  unmount();
  return result;
};

describe('1. a plain-text thread note is printed as typed, in every view', () => {
  it.each([
    ['contentFormat "text"', { contentFormat: 'text' }],
    ['no contentFormat (older backend)', {}],
  ])('🔴 Notes tab — %s: <supplier>, <b>, &amp; and line breaks kept', (_, over) => {
    const result = shown(TYPED, 'thread', over);
    expect(result.text).toBe(TYPED);
    expect(result.bold).toBeNull();
  });

  it.each([
    ['contentFormat "text"', { contentFormat: 'text' }],
    ['no contentFormat, a comment with messageId', {}],
  ])('🔴 ticket page — a thread note there (%s) is printed as typed', (_, over) => {
    const result = shown(TYPED, 'ticket', over);
    expect(result.text).toBe(TYPED);
    expect(result.bold).toBeNull();
  });

  it('🔴 the thread itself prints the same text (noteBodyText = NoteContent)', () => {
    for (const over of [{ contentFormat: 'text' }, {}]) {
      expect(noteBodyText({ ...note(over), content: TYPED }, 'thread')).toBe(TYPED);
      render(<ThreadNoteItem note={{ ...note(over), content: TYPED }} />);
      expect(screen.getByText(/waiting for <supplier> quote/).textContent).toBe(TYPED);
      document.body.innerHTML = '';
    }
  });

  it('views agree for every shape: noteBodyText is the text of what NoteContent decides', () => {
    const cases: Array<[string, Partial<NoteBody>, NoteOrigin]> = [
      [TYPED, {}, 'thread'],
      [TYPED, { contentFormat: 'text' }, 'ticket'],
      ['<p>call <strong>back</strong></p>', {}, 'thread'],
      ['<p>call <strong>back</strong></p>', { messageId: null }, 'ticket'],
      ['Tom &amp; Jerry', { messageId: null }, 'ticket'],
    ];
    for (const [content, over, origin] of cases) {
      const body = { messageId: 41, ...over, content };
      const display = noteDisplay(body, origin);
      const viewText = shown(content, origin, over).text;
      if (display.kind === 'text') expect(noteBodyText(body, origin)).toBe(viewText);
      else
        expect(noteBodyText(body, origin).replace(/\s+/g, '')).toBe(viewText?.replace(/\s+/g, ''));
    }
  });

  it('a ticket comment without contentFormat: editor-shaped HTML renders, typed tags never', () => {
    const ticketComment = { messageId: null };
    expect(shown('<p>call <strong>back</strong></p>', 'ticket', ticketComment).html).toContain(
      '<strong>back</strong>'
    );
    const typed = shown('call <b>asap</b>', 'ticket', ticketComment);
    expect(typed.bold).toBeNull();
    expect(typed.text).toBe('call <b>asap</b>');
    // The server escaped entities in what it stored: shown as the characters, in the text branch.
    expect(shown('R&amp;D &lt;b&gt; &#39;q&#x27; &amp;lt;', 'ticket', ticketComment).text).toBe(
      "R&D <b> 'q' &lt;"
    );
  });

  it('contentFormat "html" is obeyed whatever the origin', () => {
    expect(shown('call <b>asap</b>', 'thread', { contentFormat: 'html' }).bold?.textContent).toBe(
      'asap'
    );
  });

  it('editing a thread note: the editor gets its text escaped, line by line', () => {
    const typed = 'a <b>\nR&amp;D\n\nend';
    expect(noteToEditor({ content: typed }, 'thread')).toBe(
      '<p>a &lt;b&gt;<br>R&amp;amp;D<br><br>end</p>'
    );
    // …and saving it back gives the note exactly as typed.
    expect(noteFromEditor(noteToEditor({ content: typed }, 'thread'))).toBe(typed);
  });
});

describe('2. ticket-comment HTML as the server stores it', () => {
  // sanitize-html output of the ticket-comment route: `a` keeps href and target, quotes kept.
  const STORED =
    '<p>Label: <a href="https://carrier.example/track/123" target="_blank">tracking page</a> &amp; ' +
    'invoice</p><blockquote><p>As agreed, we ship Monday.</p></blockquote>' +
    '<p><a href="javascript:alert(1)">bad</a></p>';

  it('🔴 a link keeps its href and opens safely (rel noopener noreferrer, new tab)', () => {
    render(
      <NoteContent
        note={{ content: STORED, contentFormat: 'html' }}
        origin="ticket"
        className="b"
      />
    );
    const link = screen.getByRole('link', { name: 'tracking page' });
    expect(link).toHaveAttribute('href', 'https://carrier.example/track/123');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('As agreed, we ship Monday.').closest('blockquote')).not.toBeNull();
    // A script URL loses its href (DOMPurify's own URI policy); no other attribute survives.
    expect(screen.getByText('bad')).not.toHaveAttribute('href');
    expect(screen.getByText(/invoice/).textContent).toBe('Label: tracking page & invoice');
  });

  it('h1–h3 render once the backend stores them; an older stripped heading reads as text', () => {
    render(
      <NoteContent
        note={{ content: '<h2>Steps</h2><p>Call the carrier.</p>', contentFormat: 'html' }}
        origin="ticket"
        className="b"
      />
    );
    expect(screen.getByText('Steps').tagName).toBe('H2');
    document.body.innerHTML = '';
    // What the server stored before: the heading's text, bare, before the first paragraph.
    const { container } = render(
      <NoteContent
        note={{ content: 'Steps<p>Call the carrier.</p>', contentFormat: 'html' }}
        origin="ticket"
        className="b"
      />
    );
    expect(container.textContent).toBe('StepsCall the carrier.');
  });

  it('the shared DOMPurify instance is not changed by the note sanitiser', async () => {
    const DOMPurify = (await import('dompurify')).default;
    render(
      <NoteContent
        note={{ content: STORED, contentFormat: 'html' }}
        origin="ticket"
        className="b"
      />
    );
    expect(DOMPurify.sanitize('<a href="https://x.example">x</a>')).toBe(
      '<a href="https://x.example">x</a>'
    );
  });
});

const labels = (activity: MessageActivityEntry[], notes: MessageNote[]) =>
  buildTimeline(activity, notes, []).map((item) => item.label);

describe('3. a status change folds into an un-hold note only when it is that un-hold', () => {
  it('🔴 a resolve within 60 s after "Taken off hold: customer replied" is its own row', () => {
    expect(
      labels(
        [statusChange({ from: 'client_replied', to: 'resolved' })],
        [unholdNote('Taken off hold: customer replied')]
      )
    ).toEqual(['Off hold · customer replied', 'Status changed from client_replied to resolved']);
  });

  it('the change the note names folds: "status changed to resolved", "reopened", from pending', () => {
    expect(
      labels(
        [statusChange({ from: 'awaiting_response', to: 'resolved' })],
        [unholdNote('Taken off hold by Ann Admin (status changed to resolved)')]
      )
    ).toEqual(['Off hold · status changed to resolved']);
    expect(
      labels(
        [statusChange({ from: 'awaiting_response', to: 'open' })],
        [unholdNote('Taken off hold by Ann Admin (reopened)')]
      )
    ).toEqual(['Off hold · reopened']);
    expect(
      labels(
        [statusChange({ from: 'pending', to: 'open' })],
        [unholdNote('Taken off hold: customer replied')]
      )
    ).toEqual(['Off hold · customer replied']);
  });

  it('a note naming a different status does not swallow the change', () => {
    expect(
      labels(
        [statusChange({ from: 'awaiting_response', to: 'closed' })],
        [unholdNote('Taken off hold by Ann Admin (status changed to resolved)')]
      )
    ).toEqual([
      'Off hold · status changed to resolved',
      'Status changed from awaiting_response to closed',
    ]);
  });
});

describe('4. Clear reason re-reads the header chip, the notes and Activity', () => {
  const message = { id: 41, channel: 'email' } as unknown as Message;
  const mountThread = () => {
    vi.spyOn(messageService, 'getThreadMessages').mockReturnValue(new Promise(() => {}));
    const onStatusChanged = vi.fn();
    const hook = renderHook(() => useThreadEvents(message, vi.fn(), onStatusChanged));
    return { hook, onStatusChanged };
  };

  it('🔴 cleared here: the header (chip) re-reads, and the notes and Activity re-read', () => {
    const { hook, onStatusChanged } = mountThread();
    const before = {
      notes: hook.result.current.notesBump,
      activity: hook.result.current.activityBump,
    };
    act(() => hook.result.current.onHoldReasonCleared());
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    expect(hook.result.current.notesBump).toBe(before.notes + 1);
    expect(hook.result.current.activityBump).toBe(before.activity + 1);
  });

  it('🔴 cleared elsewhere (conversation:updated, hold_reason_cleared): notes and Activity re-read', () => {
    const { hook } = mountThread();
    const before = hook.result.current.activityBump;
    act(() => emit('conversation:updated', { conversationId: 41, action: 'hold_reason_cleared' }));
    expect(hook.result.current.activityBump).toBe(before + 1);
    // Another thread, or another kind of update: nothing extra.
    act(() => emit('conversation:updated', { conversationId: 42, action: 'hold_reason_cleared' }));
    act(() => emit('conversation:updated', { conversationId: 41, action: 'close' }));
    expect(hook.result.current.activityBump).toBe(before + 1);
  });

  it('the Clear reason button in the thread calls the full refresh', async () => {
    asRole('org_admin');
    vi.spyOn(messageService, 'clearHoldNoteReason').mockResolvedValue({
      success: true,
      data: holdNote(),
    });
    const onCleared = vi.fn();
    withClient(<ThreadNoteItem note={holdNote()} conversationId={41} onNotesChanged={onCleared} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Clear reason' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear reason' })
    );
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
  });
});

describe('5+6. one workspace-admin check, for the tab’s workspace', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client()}>{children}</QueryClientProvider>
  );

  it('the subscription feature no longer has its own (profile-role) copy', () => {
    expect('useIsWorkspaceAdmin' in subscriptionShell).toBe(false);
  });

  it('🔴 a profile answered for ANOTHER workspace is not an admin of this one', async () => {
    asRole('support', 1, 2);
    const me = vi.spyOn(userService, 'getCurrentUser').mockResolvedValue({
      id: ME,
      role: 'user',
      organizationRole: 'org_admin',
      organizationId: 3,
    } as User);
    const { result } = renderHook(() => useIsWorkspaceAdmin(), { wrapper });
    await waitFor(() => expect(me).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it('the same answer for THIS workspace is an admin; a global admin always is', async () => {
    asRole('support', 1, 2);
    vi.spyOn(userService, 'getCurrentUser').mockResolvedValue({
      id: ME,
      role: 'user',
      organizationRole: 'org_admin',
      organizationId: 2,
    } as User);
    const { result } = renderHook(() => useIsWorkspaceAdmin(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    asRole('support', 1, 2, 'admin');
    expect(renderHook(() => useIsWorkspaceAdmin(), { wrapper }).result.current).toBe(true);
  });

  it('🔴 AI gating reads the tab’s workspace: an admin elsewhere gets the agent’s text here', async () => {
    const err = { response: { status: 403, data: { code: 'AI_NOT_CONFIGURED' } } };
    expect(aiRefusalText(err, true)).not.toBe(aiRefusalText(err, false));
    asRole('org_admin', 1, 2);
    const me = vi.spyOn(userService, 'getCurrentUser').mockResolvedValue({
      id: ME,
      role: 'user',
      organizationRole: 'support',
      organizationId: 2,
    } as User);
    const { result } = renderHook(() => useAiRefusalText(), { wrapper });
    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(result.current(err)).toBe(aiRefusalText(err, false));
  });

  it('without a query provider (an isolated component) nothing is fetched', () => {
    asRole('org_admin', 1, 2);
    const me = vi.spyOn(userService, 'getCurrentUser');
    expect(renderHook(() => useIsWorkspaceAdmin()).result.current).toBe(false);
    asRole('org_admin');
    expect(renderHook(() => useIsWorkspaceAdmin()).result.current).toBe(true);
    expect(me).not.toHaveBeenCalled();
  });
});

describe('7. the un-hold cause comes from the note’s text; one date format', () => {
  /**
   * Copied from the backend: BE-service src/modules/inbox/services/holdNoteText.ts,
   * `CAUSE_PHRASES` (origin/staging, 2026-11-09). A phrase added there must parse here — add it.
   */
  const BE_CAUSE_PHRASES = [
    'customer replied',
    'agent replied',
    'reopened',
    'status changed',
    'recheck date reached',
    'customer message merged in',
    'customer replied on the tracking page',
    'customer wrote in chat',
    'repaired',
    'reopened from the ticket',
    'thread split',
    'ticket created',
    'added to ticket',
  ];

  it.each(BE_CAUSE_PHRASES)('"%s" parses in both of the backend’s shapes', (phrase) => {
    expect(unholdCause(`Taken off hold: ${phrase}`)).toBe(phrase);
    expect(unholdCause(`Taken off hold by Ann Admin (${phrase})`)).toBe(phrase);
    expect(labels([], [unholdNote(`Taken off hold: ${phrase}`)])).toEqual([`Off hold · ${phrase}`]);
  });

  it('text not in the backend’s shape says only "Off hold"', () => {
    expect(unholdCause('something else')).toBeNull();
    expect(labels([], [unholdNote('something else')])).toEqual(['Off hold']);
  });

  it('🔴 a routing row and a hold row show their dates the same way (formatDay)', () => {
    const accepted = '2026-10-14T09:00:00Z';
    const until = '2026-11-12T12:00:00Z';
    const routing = auditEntryLabel('routing.decision', {
      departmentName: 'Support',
      reason: 'rule_strong',
      rules: [{ value: 'dock', acceptedBy: { name: 'Ann' }, acceptedAt: accepted }],
    });
    expect(routing).toBe(
      `Routed to Support by rule "dock" (accepted by Ann, ${formatDay(accepted)})`
    );
    expect(
      labels([], [holdNote({ metadata: { kind: 'hold', reason: 'supplier', until } })])
    ).toEqual([`On hold until ${formatDay(until)}: supplier`]);
  });
});

describe('8. no Clear reason for an un-hold note', () => {
  it('🔴 an un-hold note does not mount it (no workspace-role read either)', () => {
    asRole('org_admin', 1, 2);
    const me = vi.spyOn(userService, 'getCurrentUser').mockReturnValue(new Promise(() => {}));
    withClient(
      <ThreadNoteItem
        note={unholdNote('Taken off hold: customer replied')}
        conversationId={41}
        onNotesChanged={vi.fn()}
      />
    );
    expect(me).not.toHaveBeenCalled();
    withClient(<ThreadNoteItem note={holdNote()} conversationId={41} onNotesChanged={vi.fn()} />);
    expect(me).toHaveBeenCalledTimes(1);
  });
});
