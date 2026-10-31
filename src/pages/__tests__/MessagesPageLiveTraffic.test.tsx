/**
 * What the Threads page asks of the API for an agent's everyday actions (only the wire is fake):
 *  - opening a thread mounts it at once from the row, and an earlier, slower open never wins;
 *  - a read toggle patches its row and re-reads the counts — not the page of rows;
 *  - an event that cannot have touched the rows on screen re-reads only the counts;
 *  - a socket that came back re-reads the list at once.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<(data?: unknown) => void>>(),
  getById: vi.fn(),
  fetchMessages: vi.fn(() => Promise.resolve()),
  patchThread: vi.fn(),
  markRead: vi.fn(() => Promise.resolve()),
  granted: new Set<string>(['delete_messages']),
  rowRenders: new Map<string, number>(),
  toastError: vi.fn(),
  setSelected: null as null | ((message: unknown) => void),
}));
const emit = (event: string, data?: unknown) =>
  mocks.listeners.get(event)?.forEach((handler) => handler(data));

const IDS = [11, 12, 13] as const;
const messageFor = (id: number, status = 'open') => ({
  id,
  conversationId: id,
  publicId: `COR-SUP-${id}`,
  type: 'inbound',
  sender: `customer${id}@example.com`,
  subject: `Subject ${id}`,
  content: 'hello',
  channel: 'email',
  status,
  createdAt: new Date().toISOString(),
  metadata: {},
});
const threads = IDS.map(
  (id) =>
    ({
      threadId: `conv_${id}`,
      publicId: `COR-SUP-${id}`,
      sender: `customer${id}@example.com`,
      subject: `Subject ${id}`,
      status: 'open',
      priority: 'medium',
      hasTicket: false,
      isRead: false,
      lastMessageAt: new Date().toISOString(),
      // 13 is a triage thread (filtered): its row offers Mark as read.
      latestMessage: messageFor(id, id === 13 ? 'filtered' : 'open'),
    }) as unknown as MessageThread
);

vi.mock('@/hooks/useMessagesData', () => ({
  useMessagesData: () => ({
    threads,
    loading: false,
    refreshing: false,
    setRefreshing: vi.fn(),
    messagesPagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    fetchMessages: mocks.fetchMessages,
    handlePageChange: vi.fn(),
    handleRefresh: vi.fn(),
    clearCache: vi.fn(),
    patchThread: mocks.patchThread,
  }),
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getById: mocks.getById,
    markRead: mocks.markRead,
    markUnread: vi.fn(() => Promise.resolve()),
    delete: vi.fn(),
    classify: vi.fn(),
    getThreads: vi.fn(() => new Promise(() => undefined)),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// DELETE /api/messages/:id takes DELETE_MESSAGES or MANAGE_ORGANIZATION (BE messageRoutes).
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: (permission: string) => mocks.granted.has(permission) }),
}));
vi.mock('@/services/bulk.service', () => ({
  bulkService: {
    preview: vi.fn(() => new Promise(() => undefined)),
    run: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: vi.fn(),
  subscribeToEvent: (event: string, handler: (data?: unknown) => void) => {
    const set = mocks.listeners.get(event) ?? new Set();
    set.add(handler);
    mocks.listeners.set(event, set);
  },
  unsubscribeFromEvent: (event: string, handler: (data?: unknown) => void) => {
    mocks.listeners.get(event)?.delete(handler);
  },
}));
vi.mock('@/hooks/usePhoneOpensMessageAsPage', () => ({ usePhoneOpensMessageAsPage: () => false }));
// Captures the page's setter so a test can change the open message the way Back / ?id= does —
// without going through a card click, so the captured card goes stale.
vi.mock('@/hooks/useMessagesUrlSync', () => ({
  useMessagesUrlSync: ({
    setSelectedMessage,
  }: {
    setSelectedMessage: (message: unknown) => void;
  }) => {
    mocks.setSelected = setSelectedMessage;
  },
}));
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn() }),
}));
vi.mock('@/hooks/useSharedLinkWorkspace', () => ({ useSharedLinkWorkspace: () => undefined }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: { user: null }) => unknown) =>
    selector ? selector({ user: null }) : { user: null },
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/shared/PageHeader', () => ({
  // `meta` carries the view switch since Messages list v2 (it moved out of the filter bar).
  PageHeader: ({ actions, meta }: { actions?: ReactNode; meta?: ReactNode }) => (
    <div>
      {meta}
      {actions}
    </div>
  ),
}));
vi.mock('@/components/messages/filters/MessageFilterBar', () => ({
  MessageFilterBar: ({ viewSwitch }: { viewSwitch?: ReactNode }) => <div>{viewSwitch}</div>,
}));
vi.mock('@/components/messages/MessagesViewToggle', () => ({
  MessagesViewToggle: ({ onModeChange }: { onModeChange: (mode: string) => void }) => (
    <div>
      <span
        role="link"
        tabIndex={0}
        onClick={() => onModeChange('contacts')}
        onKeyDown={() => onModeChange('contacts')}
      >
        Contacts view
      </span>
    </div>
  ),
}));
vi.mock('@/components/messages/ListScopeNotice', () => ({ ListScopeNotice: () => null }));
vi.mock('@/components/messages/QuickFilterChips', () => ({ QuickFilterChips: () => null }));
// The list caption's Sort is a Select, which needs a ThemeProvider this page test does not mount.
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('@/components/messages/ComposeNewModal', () => ({ ComposeNewModal: () => null }));
vi.mock('@/components/messages/ThreadBubble', () => ({ ThreadBubble: () => null }));
vi.mock('@/components/messages/ContactsView', () => ({
  ContactsView: () => <div data-testid="contacts-view" />,
}));
// Drawn once per row render: counts how often the rows redraw.
vi.mock('@/components/messages/RowAssignee', () => ({
  RowAssignee: ({ thread }: { thread: { threadId: string } }) => {
    mocks.rowRenders.set(thread.threadId, (mocks.rowRenders.get(thread.threadId) ?? 0) + 1);
    return null;
  },
}));
vi.mock('@/components/messages/MessagesKanbanView', () => ({ MessagesKanbanView: () => null }));
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({
    message,
    recordPending,
  }: {
    message: { id: number; subject?: string };
    recordPending?: boolean;
  }) => (
    <div data-testid="detail-pane" data-record-pending={String(Boolean(recordPending))}>
      {message.id}: {message.subject}
    </div>
  ),
}));

import { MessagesPage } from '../MessagesPage';
import { SERVER_EVENT_REFRESH_MS } from '@/hooks/useCoalescedRefresh';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';
import { useMessagesStore } from '@/stores/messagesStore';

/** A getById that answers only when the test says so. */
const deferredGetById = () => {
  const answers = new Map<number, (value: unknown) => void>();
  mocks.getById.mockImplementation(
    (id: number) => new Promise((resolve) => answers.set(id, resolve))
  );
  return (id: number, subject: string) =>
    act(async () => {
      answers.get(id)?.({ success: true, data: { ...messageFor(id), subject } });
      await Promise.resolve();
    });
};

beforeEach(() => {
  localStorage.setItem('messages_view_mode', 'threads');
  mocks.getById.mockImplementation((id: number) =>
    Promise.resolve({ success: true, data: messageFor(id) })
  );
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.listeners.clear();
  useMessagesStore.getState().clearFilters();
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/threads']}>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
const row = (id: number) => document.querySelector(`[data-select-id="${id}"]`) as HTMLElement;

describe('opening a thread', () => {
  it('mounts the detail from the row at once — before the full record answers', async () => {
    deferredGetById();
    renderPage();
    fireEvent.click(row(12));
    expect(await screen.findByTestId('detail-pane')).toHaveTextContent('12: Subject 12');
    expect(mocks.getById).toHaveBeenCalledWith(12);
    // The row says its record is still on the way.
    expect(row(12)).toHaveAttribute('aria-busy', 'true');
  });

  it('the full record replaces the row record when it lands, and the row is no longer busy', async () => {
    const answer = deferredGetById();
    renderPage();
    fireEvent.click(row(12));
    await screen.findByTestId('detail-pane');
    // Until it lands the detail knows its record is only the row's (Send waits).
    expect(screen.getByTestId('detail-pane').dataset.recordPending).toBe('true');
    await answer(12, 'Full record 12');
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12: Full record 12');
    expect(row(12)).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('detail-pane').dataset.recordPending).toBe('false');
  });

  it('an earlier, slower open never wins (click A, then B; A answers last)', async () => {
    const answer = deferredGetById();
    renderPage();
    fireEvent.click(row(11));
    await screen.findByTestId('detail-pane');
    fireEvent.click(row(12));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    await answer(12, 'Full record 12');
    await answer(11, 'Full record 11');
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12: Full record 12');
    expect(row(12)).not.toHaveAttribute('aria-busy');
  });
  it("the earlier open's answer landing first neither shows it nor clears the new row's busy mark", async () => {
    const answer = deferredGetById();
    renderPage();
    fireEvent.click(row(11));
    await screen.findByTestId('detail-pane');
    fireEvent.click(row(12));
    await answer(11, 'Full record 11');
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12: Subject 12');
    expect(row(12)).toHaveAttribute('aria-busy', 'true');
  });
});

describe('the rows are memoised', () => {
  it('opening a thread redraws only the row it opened (busy on, busy off)', async () => {
    const answer = deferredGetById();
    renderPage();
    await waitFor(() => expect(mocks.rowRenders.get('conv_11')).toBeGreaterThan(0));
    mocks.rowRenders.clear();
    fireEvent.click(row(12));
    await screen.findByTestId('detail-pane');
    await answer(12, 'Full record 12');
    expect(mocks.rowRenders.get('conv_11') ?? 0).toBe(0);
    expect(mocks.rowRenders.get('conv_13') ?? 0).toBe(0);
    expect(mocks.rowRenders.get('conv_12')).toBeLessThanOrEqual(2);
  });
});

describe('a read toggle on a row', () => {
  it('patches the row and re-reads no page of rows', async () => {
    renderPage();
    fireEvent.click(within13('Mark as read'));
    await waitFor(() =>
      expect(mocks.patchThread).toHaveBeenCalledWith('conv_13', { isRead: true })
    );
    expect(mocks.markRead).toHaveBeenCalledWith(13);
    expect(mocks.fetchMessages).not.toHaveBeenCalled();
  });

  it('control: under an Unread filter the row leaves the view — the list is read', async () => {
    // `read` only applies under a triage lane (scopeReadToTriage).
    useMessagesStore.getState().setFilters({ columnId: 'not_analysed', read: 'unread' });
    renderPage();
    mocks.fetchMessages.mockClear();
    fireEvent.click(within13('Mark as read'));
    await waitFor(() => expect(mocks.fetchMessages).toHaveBeenCalled());
    expect(mocks.patchThread).not.toHaveBeenCalled();
  });
});

describe('server events on the thread list', () => {
  const afterWindow = () =>
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS);
    });

  it('a ticket changing while no row on screen has one re-reads the counts, not the list', () => {
    renderPage();
    vi.useFakeTimers();
    mocks.fetchMessages.mockClear();
    act(() => emit('ticket:updated', { ticketId: 7, status: 'resolved' }));
    afterWindow();
    expect(mocks.fetchMessages).not.toHaveBeenCalled();
  });

  it('control: a status change elsewhere re-reads the list once, after the window', () => {
    renderPage();
    vi.useFakeTimers();
    mocks.fetchMessages.mockClear();
    act(() => emit('conversation:updated', { conversationId: 99, status: 'open' }));
    expect(mocks.fetchMessages).not.toHaveBeenCalled();
    afterWindow();
    expect(mocks.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('a socket that came back re-reads the list at once, not a window later', () => {
    renderPage();
    vi.useFakeTimers();
    mocks.fetchMessages.mockClear();
    act(() => emit(SOCKET_RECONNECTED_EVENT));
    expect(mocks.fetchMessages).toHaveBeenCalledTimes(1);
    afterWindow();
    expect(mocks.fetchMessages).toHaveBeenCalledTimes(1);
  });
});

/** Row 13's own button (the triage row). */
function within13(name: string): HTMLElement {
  const button = Array.from(row(13).querySelectorAll('button')).find(
    (element) => element.getAttribute('aria-label') === name
  );
  if (!button) throw new Error(`row 13 has no "${name}" button`);
  return button;
}
