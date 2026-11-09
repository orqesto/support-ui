/**
 * Hold notes (2026-11-09): the backend writes an internal note when a thread goes on hold and when
 * it comes off hold (`source: 'hold'`). They are drawn violet — the On-hold colour — not the amber
 * of an ordinary note, and they offer no edit or delete (they record an event). An ordinary note,
 * and a note from a backend that sends no `source`, must look exactly as before.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { WORKFLOW_STATUS_META } from '../inboxCardHelpers';
import { LIFECYCLE_COLUMN_BADGE } from '@/lib/kanbanColumns';
import { useAuthStore } from '@/stores/authStore';
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

const holdNote = {
  id: 11,
  messageId: 41,
  userId: AGENT_ID,
  authorName: 'Sam Agent',
  content: 'On hold until 12 Nov 2026: waiting for supplier',
  isInternal: true,
  createdAt: '2026-11-09T10:00:00Z',
  updatedAt: '2026-11-09T10:00:00Z',
  source: 'hold',
  // Midday UTC: the same calendar day in every zone the suite may run in.
  metadata: { kind: 'hold', reason: 'waiting for supplier', until: '2026-11-12T12:00:00Z' },
} satisfies MessageNote;

const unholdNote = {
  ...holdNote,
  id: 12,
  userId: null,
  authorName: 'Odly',
  content: 'Taken off hold: customer replied',
  metadata: { kind: 'unhold', cause: 'customer replied' },
} satisfies MessageNote;

/** An ordinary note as an older backend sends it: no `source`, no `metadata`. */
const plainNote = {
  id: 13,
  messageId: 41,
  userId: AGENT_ID,
  authorName: 'Sam Agent',
  content: 'Called them back',
  isInternal: true,
  createdAt: '2026-11-09T09:00:00Z',
  updatedAt: '2026-11-09T09:00:00Z',
} satisfies MessageNote;

const classes = (el: Element | null) => (el?.className ?? '').split(/\s+/);

describe('ThreadNoteItem — hold notes in the thread', () => {
  it('a hold note is violet, labelled, and carries no amber', () => {
    render(<ThreadNoteItem note={holdNote} />);
    const bubble = screen.getByText(holdNote.content);
    expect(classes(bubble)).toEqual(
      expect.arrayContaining(['bg-pending-muted', 'border-pending-line'])
    );
    expect(classes(bubble)).not.toContain('bg-warning-muted');
    const label = screen.getByText('Internal · On hold');
    expect(classes(label.parentElement)).toContain('text-pending');
    expect(classes(label.parentElement)).not.toContain('text-warning');
  });

  it('the note written when a thread leaves hold says Off hold', () => {
    render(<ThreadNoteItem note={unholdNote} />);
    expect(screen.getByText('Internal · Off hold')).toBeInTheDocument();
    expect(screen.getByText('Odly')).toBeInTheDocument();
  });

  it('an ordinary note (no source) is unchanged: amber, "Internal note"', () => {
    render(<ThreadNoteItem note={plainNote} />);
    const bubble = screen.getByText(plainNote.content);
    expect(classes(bubble)).toEqual(
      expect.arrayContaining(['bg-warning-muted', 'border-warning-line'])
    );
    expect(classes(bubble)).not.toContain('bg-pending-muted');
    const label = screen.getByText('Internal note');
    expect(classes(label.parentElement)).toContain('text-warning');
  });
});

const noop = () => {};
const renderNotesTab = (notes: MessageNote[]) => {
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
  } as unknown as MessagePanelTabsProps;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<MessagePanelTabs {...props} />, { wrapper });
};

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: AGENT_ID } as User });
});

describe('MessagePanelTabs Notes tab — hold notes', () => {
  it('🔴 the author of a hold note gets no edit or delete; it is violet', () => {
    // RED without the change: isOwner alone shows Edit/Delete on the agent's own hold note.
    renderNotesTab([holdNote]);
    expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete note' })).toBeNull();
    const card = screen.getByText(/waiting for supplier/).closest('.rounded-\\[9px\\]');
    expect(classes(card)).toEqual(
      expect.arrayContaining(['bg-pending-muted', 'border-pending-line', 'border-l-pending'])
    );
    expect(classes(card)).not.toContain('border-l-note-line');
  });

  it('the author of an ordinary note still gets edit and delete, in the old colours', () => {
    renderNotesTab([plainNote]);
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete note' })).toBeInTheDocument();
    const card = screen.getByText('Called them back').closest('.rounded-\\[9px\\]');
    expect(classes(card)).toEqual(
      expect.arrayContaining(['bg-card', 'border-border', 'border-l-note-line'])
    );
    expect(classes(card)).not.toContain('bg-pending-muted');
  });
});

describe('On-hold chip colour', () => {
  it('is violet in the inbox, the header and the kanban card', () => {
    for (const meta of [WORKFLOW_STATUS_META.on_hold, LIFECYCLE_COLUMN_BADGE.on_hold]) {
      expect(meta.className).toContain('text-pending');
      expect(meta.className).not.toMatch(/warning/);
    }
  });
});
