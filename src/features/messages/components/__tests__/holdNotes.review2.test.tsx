/**
 * Hold notes, second review (after #897):
 *  1+2. HTML or plain text is decided by the server's `contentFormat`; without it (an older
 *       backend) a comment that opens with text after a stripped heading, or carries an escaped
 *       entity, still renders as HTML as it did before #897;
 *  3.   Clear reason in the thread itself, not only in the Notes tab (the ticket page:
 *       TicketComments.clearReason.test.tsx);
 *  4.   one day format for the header chip and the hold notes (`formatDay`), the viewer's zone;
 *  5.   one hold is one Activity row (its status change folds into the hold note), and Off hold
 *       says why;
 *  6.   Clear reason follows the role in the workspace the TAB is in, as the backend checks it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoteContent } from '@/components/shared/NoteContent';
import { noteBodyText, noteDisplay } from '@/lib/noteText';
import { holdNoteText } from '@/lib/holdNote';
import { formatDay } from '@/lib/utils';
import {
  messageService,
  type MessageActivityEntry,
  type MessageNote,
} from '@/services/message.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { buildTimeline } from '../messageActivityTimeline';
import { HeaderChipRow } from '../messageDetailHeader/HeaderChipRow';

vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));

const ME = 9;
const UNTIL = '2026-11-12T22:00:00Z';

const holdNote = (over: Partial<MessageNote> = {}): MessageNote => ({
  id: 21,
  messageId: 41,
  userId: ME,
  authorName: 'Sam Agent',
  content: 'On hold: supplier',
  isInternal: true,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
  source: 'hold',
  metadata: { kind: 'hold', reason: 'supplier', until: null },
  ...over,
});
const unholdNote = (over: Partial<MessageNote> = {}): MessageNote =>
  holdNote({
    id: 22,
    content: 'Taken off hold: customer replied',
    metadata: { kind: 'unhold', cause: 'customer_reply' },
    ...over,
  });
const statusChange = (
  details: Record<string, unknown>,
  createdAt = '2026-11-09T10:00:00.300Z'
): MessageActivityEntry => ({
  id: Math.floor(Math.random() * 1e9),
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

const withClient = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => asRole('support'));
afterEach(() => vi.restoreAllMocks());

const renderBody = (content: string, contentFormat?: string) =>
  render(<NoteContent note={{ content, contentFormat }} origin="ticket" className="body" />);

describe('1+2. HTML or text by contentFormat, with a fallback for an older backend', () => {
  it('🔴 a heading-first ticket comment ("Title<p>body</p>") renders, never shows raw tags', () => {
    const { container } = renderBody('Refund status<p>Sent to the bank.</p>', 'html');
    expect(container.textContent).not.toContain('<p>');
    expect(screen.getByText('Sent to the bank.').tagName).toBe('P');
  });

  it('an OLDER backend (no contentFormat): only editor-shaped HTML renders (review of #902)', () => {
    // The narrow test: HTML only when it opens with a block tag. A comment that opens with text
    // is printed as typed — the widened guess rendered typed tags (review3 test).
    const { unmount } = renderBody('<p>Refund status</p><p>Sent to the bank.</p>');
    expect(screen.getByText('Sent to the bank.').tagName).toBe('P');
    unmount();
    const { container } = renderBody('Refund status<p>Sent to the bank.</p>');
    expect(container.textContent).toBe('Refund status<p>Sent to the bank.</p>');
  });

  it('🔴 an entity-escaped legacy comment reads "Tom & Jerry" — with and without contentFormat', () => {
    const { unmount } = renderBody('Tom &amp; Jerry', 'html');
    expect(screen.getByText('Tom & Jerry')).toBeInTheDocument();
    unmount();
    renderBody('Tom &amp; Jerry');
    expect(screen.getByText('Tom & Jerry')).toBeInTheDocument();
  });

  it('contentFormat "text" is printed as typed, tags and entities included', () => {
    const { container } = renderBody('<p>kept</p> and &amp; and <supplier>', 'text');
    expect(container.textContent).toBe('<p>kept</p> and &amp; and <supplier>');
  });

  it('without contentFormat, a typed tag or entity never makes text HTML', () => {
    const kind = (content: string, contentFormat?: string) =>
      noteDisplay({ content, contentFormat }, 'ticket').kind;
    expect(kind('waiting for <supplier> quote')).toBe('text');
    expect(kind('a < b && c > d')).toBe('text');
    // Review of #902: this was asserted as HTML — a typed "<b>" was bolded and lost.
    expect(kind('call <b>back</b>')).toBe('text');
    expect(kind('R&amp;D', 'text')).toBe('text');
    expect(kind('plain', 'html')).toBe('html');
  });

  it('the thread view prints text: HTML by contentFormat is read as text, text kept', () => {
    expect(
      noteBodyText({ content: 'Title<p>body &amp; more</p>', contentFormat: 'html' }, 'thread')
    ).toBe('Title\n\nbody & more');
    expect(noteBodyText({ content: '<p>typed</p>', contentFormat: 'text' }, 'thread')).toBe(
      '<p>typed</p>'
    );
    // Older backend: a thread note is text — a typed "<b>" is not eaten.
    expect(noteBodyText({ content: 'if a < 5 then <b> is fine' }, 'thread')).toBe(
      'if a < 5 then <b> is fine'
    );
  });

  it('a heading-first comment in the thread itself reads as text, no tags', () => {
    render(
      <ThreadNoteItem
        note={holdNote({
          source: null,
          metadata: null,
          content: 'Refund status<p>Sent to the bank.</p>',
          contentFormat: 'html',
        })}
      />
    );
    expect(screen.getByText(/Refund status\s+Sent to the bank\./)).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).toBeNull();
  });
});

const clickClearAndConfirm = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Clear reason' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Clear reason' }));
};

describe('3. Clear reason in the thread', () => {
  it('🔴 thread: a workspace admin clears from the note in the thread; notes re-read', async () => {
    asRole('org_admin');
    const clear = vi
      .spyOn(messageService, 'clearHoldNoteReason')
      .mockResolvedValue({ success: true, data: holdNote() });
    const onNotesChanged = vi.fn();
    withClient(
      <ThreadNoteItem note={holdNote()} conversationId={41} onNotesChanged={onNotesChanged} />
    );
    await clickClearAndConfirm();
    await waitFor(() => expect(onNotesChanged).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(41, 21);
  });

  it('thread: an agent gets no button', () => {
    withClient(<ThreadNoteItem note={holdNote()} conversationId={41} onNotesChanged={vi.fn()} />);
    expect(screen.getByText('On hold: supplier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reason' })).toBeNull();
  });
});

describe('4. one day format for the header chip and the notes', () => {
  it('🔴 the chip and the note show the hold date the same way, in the viewer’s zone', () => {
    const message = {
      id: 41,
      parkedAt: '2026-11-09T10:00:00Z',
      parkedUntil: UNTIL,
      parkedReason: 'supplier',
      metadata: {},
    } as unknown as Message;
    withClient(
      <HeaderChipRow
        {...({
          message,
          compact: false,
          isPhone: true,
          isFiltered: false,
          currentWorkflowStatus: 'on_hold',
          statusDisplayOptions: [{ value: 'on_hold', label: 'On hold' }],
          workflowToBeStatus: {},
          updatingStatus: false,
          holdOpen: false,
          setHoldOpen: vi.fn(),
          handleSetStatus: vi.fn(),
          slaInfo: null,
          updatingPriority: false,
          handleSetPriority: vi.fn(),
          inboxBadge: null,
          related: null,
        } as unknown as Parameters<typeof HeaderChipRow>[0])}
      />
    );
    const day = formatDay(UNTIL);
    expect(screen.getByTestId('hold-until').textContent).toBe(`until ${day}`);
    expect(
      holdNoteText(holdNote({ metadata: { kind: 'hold', reason: 'supplier', until: UNTIL } }))
    ).toBe(`On hold until ${day}: supplier`);
  });

  it('formatDay is the viewer’s day and never the hard-coded en-GB form', () => {
    expect(formatDay(UNTIL, 'Australia/Sydney')).toMatch(/\b13\b/);
    expect(formatDay(UNTIL, 'America/New_York')).toMatch(/\b12\b/);
    expect(formatDay('2026-09-15T12:00:00Z', 'UTC')).toBe(
      new Date('2026-09-15T12:00:00Z').toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    );
  });
});

const labels = (activity: MessageActivityEntry[], notes: MessageNote[]) =>
  buildTimeline(activity, notes, []).map((item) => item.label);

describe('5. Activity: one row per hold, and Off hold says why', () => {
  it('🔴 a hold is ONE row: its status change folds into the hold note', () => {
    expect(labels([statusChange({ from: 'open', to: 'pending' })], [holdNote()])).toEqual([
      'On hold: supplier',
    ]);
  });

  it('🔴 an un-hold by a status change is one "Off hold · <cause>" row', () => {
    expect(
      labels(
        [statusChange({ from: 'open', to: 'resolved' })],
        [
          unholdNote({
            content: 'Taken off hold by Ann Admin (status changed to resolved)',
            metadata: { kind: 'unhold', cause: 'status_change' },
          }),
        ]
      )
    ).toEqual(['Off hold · status changed to resolved']);
  });

  it('Off hold reads the cause from the note’s text only (review of #902)', () => {
    expect(
      labels([], [unholdNote({ content: 'x', metadata: { kind: 'unhold', cause: 'recheck_due' } })])
    ).toEqual(['Off hold']);
    expect(labels([], [unholdNote({ content: 'x', metadata: { kind: 'unhold' } })])).toEqual([
      'Off hold',
    ]);
    expect(labels([], [unholdNote()])).toEqual(['Off hold · customer replied']);
  });

  it('a status change with no hold note stays, "pending" read as "On hold"', () => {
    expect(labels([statusChange({ from: 'open', to: 'pending' })], [])).toEqual([
      'Status changed from open to On hold',
    ]);
    expect(labels([statusChange({ from: 'pending', to: 'open' })], [])).toEqual([
      'Status changed from On hold to open',
    ]);
  });

  it('only a change at about the same time folds; each note folds one change', () => {
    const later = '2026-11-09T10:10:00.000Z';
    expect(
      labels(
        [
          statusChange({ from: 'open', to: 'pending' }),
          statusChange({ from: 'open', to: 'pending' }, '2026-11-09T10:00:00.500Z'),
          statusChange({ from: 'open', to: 'resolved' }, later),
        ],
        [holdNote(), unholdNote({ createdAt: '2026-11-09T10:01:30.000Z' })]
      )
    ).toEqual([
      'On hold: supplier',
      'Status changed from open to On hold',
      'Off hold · customer replied',
      'Status changed from open to resolved',
    ]);
  });
});

describe('6. Clear reason follows the role in the workspace this tab is in', () => {
  const renderThreadNote = () =>
    withClient(<ThreadNoteItem note={holdNote()} conversationId={41} onNotesChanged={vi.fn()} />);

  it('🔴 an admin of ANOTHER workspace (the tab moved by a shared link) gets no button', async () => {
    asRole('org_admin', 1, 2);
    const me = vi
      .spyOn(userService, 'getCurrentUser')
      .mockResolvedValue({ id: ME, role: 'user', organizationRole: 'support' } as User);
    renderThreadNote();
    await waitFor(() => expect(me).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Clear reason' })).toBeNull();
  });

  it('🔴 an admin of THIS workspace whose profile was loaded elsewhere gets it', async () => {
    asRole('support', 1, 2);
    vi.spyOn(userService, 'getCurrentUser').mockResolvedValue({
      id: ME,
      role: 'user',
      organizationRole: 'org_admin',
      organizationId: 2,
    } as User);
    renderThreadNote();
    expect(await screen.findByRole('button', { name: 'Clear reason' })).toBeInTheDocument();
  });

  it('the profile’s own workspace and a global admin need no extra read', () => {
    const me = vi.spyOn(userService, 'getCurrentUser');
    asRole('org_admin');
    const { unmount } = renderThreadNote();
    expect(screen.getByRole('button', { name: 'Clear reason' })).toBeInTheDocument();
    unmount();
    asRole('support', 1, 7, 'admin');
    renderThreadNote();
    expect(screen.getByRole('button', { name: 'Clear reason' })).toBeInTheDocument();
    expect(me).not.toHaveBeenCalled();
  });
});
