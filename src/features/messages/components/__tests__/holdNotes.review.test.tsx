/**
 * Hold notes, review fixes (2026-11-09):
 *  1. the hold date is the VIEWER's day, built from metadata (the server writes it in UTC);
 *  2. the Activity tab draws hold notes violet, "On hold …" / "Off hold";
 *  4. Pending (waiting on the customer) is amber everywhere; violet is On-hold's alone;
 *  5. plain-text notes keep their "<…>" text;
 *  6. hold notes are listed but never counted in the Notes badge;
 *  7. a workspace admin may clear a hold note's reason, after an in-app confirm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { ACTIVITY_DOT, buildTimeline } from '../messageActivityTimeline';
import { ThreadStatusCell } from '../list/threadTableParts';
import { holdNoteText, formatHoldDate } from '@/lib/holdNote';
import { useAuthStore } from '@/stores/authStore';
import { messageService } from '@/services/message.service';
import type { Message, User } from '@/types';
import type * as MessageService from '@/services/message.service';

type MessageNote = MessageService.MessageNote;

vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
vi.mock('@/services/message.service', async () => {
  const actual = await vi.importActual<typeof MessageService>('@/services/message.service');
  return {
    ...actual,
    messageService: {
      ...actual.messageService,
      getKBReferences: () => Promise.resolve({ success: true, data: [] }),
    },
  };
});
vi.mock('@/features/contacts/hooks/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));

const AGENT_ID = 9;
/** 22:00 UTC on 12 Nov: already 13 Nov in Sydney, still 12 Nov in New York. */
const LATE_UTC = '2026-11-12T22:00:00Z';

const hold = (metadata: Record<string, unknown> | null, content = 'server text'): MessageNote => ({
  id: 21,
  messageId: 41,
  userId: AGENT_ID,
  authorName: 'Sam Agent',
  content,
  isInternal: true,
  createdAt: '2026-11-09T10:00:00Z',
  updatedAt: '2026-11-09T10:00:00Z',
  source: 'hold',
  metadata,
});
const unhold = (): MessageNote => ({
  ...hold({ kind: 'unhold', cause: 'customer replied' }, 'Taken off hold: customer replied'),
  id: 22,
});
const plain = (content: string, id = 23): MessageNote => ({
  id,
  messageId: 41,
  userId: AGENT_ID,
  authorName: 'Sam Agent',
  content,
  isInternal: true,
  createdAt: '2026-11-09T09:00:00Z',
  updatedAt: '2026-11-09T09:00:00Z',
});

const withTz = (zone: string, run: () => void) => {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};

describe('1. hold date in the viewer’s time zone', () => {
  it('formats a 22:00Z instant as the local day', () => {
    expect(formatHoldDate(new Date(LATE_UTC), 'Australia/Sydney')).toBe('13 Nov 2026');
    expect(formatHoldDate(new Date(LATE_UTC), 'America/New_York')).toBe('12 Nov 2026');
  });

  it('builds every form from metadata', () => {
    const tz = 'America/New_York';
    expect(holdNoteText(hold({ kind: 'hold', reason: 'supplier', until: LATE_UTC }), tz)).toBe(
      'On hold until 12 Nov 2026: supplier'
    );
    expect(holdNoteText(hold({ kind: 'hold', reason: null, until: LATE_UTC }), tz)).toBe(
      'On hold until 12 Nov 2026'
    );
    expect(holdNoteText(hold({ kind: 'hold', reason: 'supplier', until: null }), tz)).toBe(
      'On hold: supplier'
    );
    expect(holdNoteText(hold({ kind: 'hold', reason: null, until: null }), tz)).toBe('On hold');
  });

  it('falls back to the stored content when metadata is missing or malformed', () => {
    expect(holdNoteText(hold(null, 'stored'))).toBe('stored');
    expect(holdNoteText(hold({ kind: 'hold', reason: 5, until: null }, 'stored'))).toBe('stored');
    expect(holdNoteText(hold({ kind: 'hold', reason: 'x', until: 'not a date' }, 'stored'))).toBe(
      'stored'
    );
    expect(holdNoteText(unhold())).toBe('Taken off hold: customer replied');
  });

  it('🔴 the thread shows the Sydney day, not the server’s UTC day', () => {
    const note = hold(
      { kind: 'hold', reason: 'supplier', until: LATE_UTC },
      'On hold until 12 Nov 2026: supplier'
    );
    withTz('Australia/Sydney', () => {
      const { unmount } = render(<ThreadNoteItem note={note} />);
      expect(screen.getByText('On hold until 13 Nov 2026: supplier')).toBeInTheDocument();
      unmount();
    });
    withTz('America/New_York', () => {
      const { unmount } = render(<ThreadNoteItem note={note} />);
      expect(screen.getByText('On hold until 12 Nov 2026: supplier')).toBeInTheDocument();
      unmount();
    });
  });

  it('a cleared reason reads "reason removed" and the reason is gone', () => {
    const note = hold({
      kind: 'hold',
      reason: null,
      until: LATE_UTC,
      reasonClearedAt: '2026-11-10T09:00:00Z',
      reasonClearedBy: 1,
    });
    expect(holdNoteText(note, 'America/New_York')).toBe(
      'On hold until 12 Nov 2026 · reason removed'
    );
  });
});

describe('2. Activity tab', () => {
  it('🔴 a hold note is a violet "On hold" row, an un-hold note "Off hold"', () => {
    withTz('Australia/Sydney', () => {
      const items = buildTimeline(
        [],
        [hold({ kind: 'hold', reason: 'supplier', until: LATE_UTC }), unhold(), plain('typed')],
        []
      );
      const byLabel = Object.fromEntries(items.map((item) => [item.label, item.kind]));
      expect(byLabel).toEqual({
        'On hold until 13 Nov 2026: supplier': 'hold',
        'Off hold': 'hold',
        'Internal note': 'note',
      });
    });
    expect(ACTIVITY_DOT.hold).toBe('bg-pending');
    expect(ACTIVITY_DOT.note).toBe('bg-warning');
  });
});

describe('4. Pending is amber, On-hold violet', () => {
  const dotOf = (container: HTMLElement) =>
    (container.querySelector('.rounded-full')?.className ?? '').split(/\s+/);

  it('🔴 the thread table’s Pending dot is amber', () => {
    const { container } = render(<ThreadStatusCell status="pending" />);
    expect(dotOf(container)).toContain('bg-warning');
    expect(dotOf(container)).not.toContain('bg-pending');
  });

  it('the thread table’s On-hold dot stays a violet ring', () => {
    const { container } = render(<ThreadStatusCell status="on_hold" />);
    expect(dotOf(container)).toContain('border-pending');
  });
});

const noop = () => {};
const renderNotesTab = (notes: MessageNote[], extra: Partial<MessagePanelTabsProps> = {}) => {
  const props = {
    message: {
      id: 41,
      sender: 'buyer@example.com',
      channel: 'email',
      createdAt: '2026-11-09T08:00:00Z',
      metadata: {},
    } as unknown as Message,
    tab: 'notes',
    setTab: noop,
    panelOpen: true,
    setPanelOpen: noop,
    notes,
    onNoteUpdated: noop,
    onNoteDeleted: noop,
    noteActivityLog: [],
    messageActivity: [],
    sortedThread: [],
    threadRefreshKey: 0,
    currentUserId: AGENT_ID,
    leadState: null,
    setLeadState: noop,
    leadFieldDefs: [],
    onGhostClick: noop,
    setComposerMode: noop,
    noteEditorRef: createRef(),
    ...extra,
  } as unknown as MessagePanelTabsProps;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<MessagePanelTabs {...props} />, { wrapper });
};
const notesTabButton = () => screen.getByRole('button', { name: /^Notes/ });

const asAgent = () =>
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: AGENT_ID, role: 'user', organizationRole: 'agent' } as unknown as User,
  });
const asOrgAdmin = () =>
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: AGENT_ID, role: 'user', organizationRole: 'org_admin' } as unknown as User,
  });

beforeEach(asAgent);
afterEach(() => vi.restoreAllMocks());

describe('5. plain-text notes keep their "<…>" text (Notes tab)', () => {
  it('🔴 a thread note written as plain text shows "<supplier>"', () => {
    renderNotesTab([plain('waiting for <supplier> quote')]);
    expect(screen.getByText('waiting for <supplier> quote')).toBeInTheDocument();
  });

  it('a note saved from the rich editor still renders its formatting', () => {
    renderNotesTab([plain('<p>call <strong>back</strong></p>')]);
    expect(screen.getByText('back').tagName).toBe('STRONG');
  });

  it('🔴 a hold note’s reason is plain text', () => {
    renderNotesTab([hold({ kind: 'hold', reason: 'waiting for <supplier>', until: null })]);
    expect(screen.getByText('On hold: waiting for <supplier>')).toBeInTheDocument();
  });
});

describe('6. hold notes are listed but not counted', () => {
  it('🔴 a thread with only hold notes shows them and no count', () => {
    renderNotesTab([hold({ kind: 'hold', reason: 'supplier', until: null }), unhold()]);
    expect(screen.getByText('On hold: supplier')).toBeInTheDocument();
    expect(notesTabButton().textContent).toBe('Notes');
  });

  it('counts only the typed notes', () => {
    renderNotesTab([hold({ kind: 'hold', reason: 'supplier', until: null }), plain('typed')]);
    expect(notesTabButton().textContent).toBe('Notes1');
  });
});

describe('7. Clear reason', () => {
  const withReason = () => hold({ kind: 'hold', reason: 'supplier', until: null });

  it('an agent gets no Clear reason', () => {
    renderNotesTab([withReason()], { onNotesChanged: noop });
    expect(screen.queryByRole('button', { name: 'Clear reason' })).toBeNull();
  });

  it('🔴 a workspace admin confirms in the app, then the reason is cleared and notes re-read', async () => {
    asOrgAdmin();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const clear = vi
      .spyOn(messageService, 'clearHoldNoteReason')
      .mockResolvedValue({ success: true, data: withReason() });
    const onNotesChanged = vi.fn();
    renderNotesTab([withReason()], { onNotesChanged });

    await user.click(screen.getByRole('button', { name: 'Clear reason' }));
    expect(clear).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear reason' }));

    await waitFor(() => expect(onNotesChanged).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(41, 21);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('cancelling the confirm calls nothing', async () => {
    asOrgAdmin();
    const user = userEvent.setup();
    const clear = vi.spyOn(messageService, 'clearHoldNoteReason');
    renderNotesTab([withReason()], { onNotesChanged: noop });
    await user.click(screen.getByRole('button', { name: 'Clear reason' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );
    expect(clear).not.toHaveBeenCalled();
  });

  it('a global admin gets it too; not on an un-hold note, a reasonless or a cleared one', () => {
    useAuthStore.setState({
      selectedOrganizationId: 1,
      user: { id: AGENT_ID, role: 'admin' } as unknown as User,
    });
    renderNotesTab(
      [
        withReason(),
        unhold(),
        { ...hold({ kind: 'hold', reason: null, until: null }), id: 31 },
        {
          ...hold({ kind: 'hold', reason: null, until: null, reasonClearedAt: LATE_UTC }),
          id: 32,
        },
      ],
      { onNotesChanged: noop }
    );
    expect(screen.getAllByRole('button', { name: 'Clear reason' })).toHaveLength(1);
    expect(screen.getByText('On hold · reason removed')).toBeInTheDocument();
  });
});
