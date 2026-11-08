/**
 * Inbox slide-over → More → Delete message:
 * - the detail stays open behind the question; Cancel leaves it as it was (it used to close
 *   BEFORE the confirm, so Cancel left nothing open and nothing deleted);
 * - a failed delete says what the full page says — the server's reason, else a generic line —
 *   as a toast (it used to be a "Delete Failed" alert with generic text only);
 * - only a viewer the backend lets delete is offered it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  classify: vi.fn(() => Promise.resolve()),
  optimisticMove: vi.fn(),
  toastError: vi.fn(),
  setSelected: null as null | ((message: unknown) => void),
  granted: new Set<string>(['delete_messages']),
}));

const IDS = [11, 12, 13] as const;

const messageFor = (id: number) => ({
  id,
  conversationId: id,
  publicId: `COR-SUP-${id}`,
  type: 'inbound',
  sender: `customer${id}@example.com`,
  subject: `Subject ${id}`,
  content: 'hello',
  channel: 'email',
  status: 'open',
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
      lastMessageAt: new Date().toISOString(),
      latestMessage: messageFor(id),
    }) as unknown as MessageThread
);

vi.mock('@/features/messages/hooks/useMessagesData', () => ({
  useMessagesData: () => ({
    threads,
    loading: false,
    refreshing: false,
    setRefreshing: vi.fn(),
    messagesPagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    fetchMessages: vi.fn(() => Promise.resolve()),
    handlePageChange: vi.fn(),
    handleRefresh: vi.fn(),
    clearCache: vi.fn(),
  }),
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getById: vi.fn((id: number) => Promise.resolve({ success: true, data: messageFor(id) })),
    markRead: vi.fn(() => Promise.resolve()),
    markUnread: vi.fn(() => Promise.resolve()),
    delete: mocks.del,
    classify: mocks.classify,
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// DELETE /api/messages/:id takes DELETE_MESSAGES or MANAGE_ORGANIZATION (BE messageRoutes).
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: (permission: string) => mocks.granted.has(permission) }),
}));
vi.mock('@/features/messages/services/bulk.service', () => ({
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
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/features/messages/hooks/usePhoneOpensMessageAsPage', () => ({
  usePhoneOpensMessageAsPage: () => false,
}));
// Captures the page's setter so a test can change the open message the way Back / ?id= does —
// without going through a card click, so the captured card goes stale.
vi.mock('@/features/messages/hooks/useMessagesUrlSync', () => ({
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
vi.mock('@/features/messages/hooks/useSharedLinkWorkspace', () => ({
  useSharedLinkWorkspace: () => undefined,
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
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
vi.mock('@/features/messages/components/filters/MessageFilterBar', () => ({
  MessageFilterBar: ({ viewSwitch }: { viewSwitch?: ReactNode }) => <div>{viewSwitch}</div>,
}));
vi.mock('@/features/messages/components/MessagesViewToggle', () => ({
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
vi.mock('@/features/messages/components/ListScopeNotice', () => ({ ListScopeNotice: () => null }));
// The list caption's Sort is a Select, which needs a ThemeProvider this page test does not mount.
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('@/features/messages/components/ComposeNewModal', () => ({ ComposeNewModal: () => null }));
vi.mock('@/features/messages/components/ThreadBubble', () => ({ ThreadBubble: () => null }));
vi.mock('@/features/messages/components/ContactsView', () => ({
  ContactsView: () => <div data-testid="contacts-view" />,
}));
// The board: opens a card the way a click does, and exposes its optimistic move to the page.
vi.mock('@/features/messages/components/MessagesKanbanView', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    MessagesKanbanView: forwardRef(
      (
        { onOpen, refreshKey }: { onOpen: (thread: MessageThread) => void; refreshKey: number },
        ref
      ) => {
        useImperativeHandle(ref, () => ({ optimisticMove: mocks.optimisticMove }));
        return (
          <div data-testid="board" data-refresh-key={refreshKey}>
            <button type="button" onClick={() => onOpen(threads[1])}>
              open card 12
            </button>
          </div>
        );
      }
    ),
  };
});
// Stand-in for the detail: its More → Delete message calls the page's onDelete, when given one;
// J and a status change call the page's onNavigate / onOptimisticMove.
vi.mock('@/features/messages/components/MessageDetail', () => ({
  MessageDetail: ({
    message,
    onDelete,
    onNavigate,
    onOptimisticMove,
    onClassify,
  }: {
    message: { id: number };
    onDelete?: () => void;
    onClassify?: (action: string) => Promise<void>;
    onNavigate?: (direction: 'next' | 'prev') => void;
    onOptimisticMove?: (columnId: string) => void;
  }) => (
    <div data-testid="detail-pane">
      {message.id}
      {onDelete && (
        <button type="button" onClick={onDelete}>
          More → Delete thread
        </button>
      )}
      {onNavigate && (
        <button type="button" onClick={() => onNavigate('next')}>
          J (next)
        </button>
      )}
      <button type="button" onClick={() => onOptimisticMove?.('awaiting')}>
        Set awaiting
      </button>
      {onClassify && (
        <button type="button" onClick={() => void onClassify('move_to_spam')}>
          Move to spam
        </button>
      )}
    </div>
  ),
}));

import { MessagesPage } from '../MessagesPage';
import { subscribeToEvent } from '@/lib/socketManager';
import { SERVER_EVENT_REFRESH_MS } from '@/hooks/useCoalescedRefresh';

beforeEach(() => {
  localStorage.setItem('messages_view_mode', 'threads');
  mocks.del.mockResolvedValue({ success: true });
});
afterEach(() => {
  vi.clearAllMocks();
  mocks.granted = new Set(['delete_messages']);
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
const openDetail = async (id: number) => {
  fireEvent.click(row(id));
  await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent(String(id)));
};
const pressDelete = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More → Delete thread' }));

describe('MessagesPage — slide-over More → Delete thread', () => {
  it('the detail stays open behind the question; Cancel leaves it open, nothing deleted', async () => {
    renderPage();
    await openDetail(12);
    pressDelete();
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete thread');
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12');
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('Delete: one DELETE for that message, then the detail closes', async () => {
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.del).toHaveBeenCalledWith(12);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('a refused delete toasts the server’s reason (as the full page does); dialog and detail stay', async () => {
    mocks.del.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: 'You cannot delete messages in this department' } },
    });
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastError).toHaveBeenCalledWith('You cannot delete messages in this department');
    expect(screen.queryByText('Delete Failed')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete thread');
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeInactive();
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('12');
  });

  it('a refused delete can be retried: Delete again sends a second DELETE', async () => {
    mocks.del.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: 'The message is being processed' } },
    });
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.del).toHaveBeenCalledTimes(1);
    // The dialog stayed up for exactly this: the second press is not swallowed as "in flight".
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.del).toHaveBeenCalledTimes(2);
    expect(mocks.del).toHaveBeenLastCalledWith(12);
  });

  it('a server error (5xx) never shows its body: the generic line', async () => {
    mocks.del.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: 'relation "x" does not exist' } },
    });
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to delete thread');
  });

  it('a viewer without DELETE_MESSAGES or MANAGE_ORGANIZATION is not offered Delete', async () => {
    mocks.granted = new Set(['view_messages']);
    renderPage();
    await openDetail(12);
    expect(screen.queryByRole('button', { name: 'More → Delete thread' })).toBeNull();
  });

  it('board: the deleted thread’s card leaves the board (no delete socket event would move it)', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    // The board is downloaded when first shown (lazy): wait for it.
    fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.optimisticMove).toHaveBeenCalledTimes(1);
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_12', null);
  });

  // The card opened before (12) is forgotten when the open message changes; the one now open
  // (11) is recovered from the list, so the deleted thread's own card leaves — never 12.
  it('board: the open message changed without a click (Back): no LIVE card is taken; the deleted one leaves', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    // The board is downloaded when first shown (lazy): wait for it.
    fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    act(() => mocks.setSelected?.(messageFor(11)));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.del).toHaveBeenCalledWith(11);
    expect(mocks.optimisticMove).not.toHaveBeenCalledWith('conv_12', expect.anything());
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_11', null);
  });

  it('CONTROL board: Cancel leaves the card where it is', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    // The board is downloaded when first shown (lazy): wait for it.
    fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.optimisticMove).not.toHaveBeenCalled();
  });

  it('the open message changed to another while the delete ran: its detail stays open when the delete lands', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.del.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith(12));
    act(() => mocks.setSelected?.(messageFor(11)));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
    act(() => finish({ success: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('11');
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  describe('after a delete, the next thread opened by URL is the one J/K and moves act on', () => {
    it('J steps from the thread now open, not from the deleted one', async () => {
      renderPage();
      await openDetail(12);
      pressDelete();
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
      act(() => mocks.setSelected?.(messageFor(11)));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
      fireEvent.click(screen.getByRole('button', { name: 'J (next)' }));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    });

    it('board: a status change moves the card now open, not the deleted one', async () => {
      localStorage.setItem('messages_view_mode', 'kanban');
      renderPage();
      // The board is downloaded when first shown (lazy): wait for it.
      fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
      pressDelete();
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
      mocks.optimisticMove.mockClear();
      act(() => mocks.setSelected?.(messageFor(13)));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('13'));
      fireEvent.click(screen.getByRole('button', { name: 'Set awaiting' }));
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
    });

    // The backdrop's fallback close (the detail has not registered its prompt-aware close yet)
    // used to leave the closed card remembered, so the next thread's move went to that card.
    it('board: after a backdrop close, a status change moves the card now open, not the closed one', async () => {
      localStorage.setItem('messages_view_mode', 'kanban');
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
      mocks.optimisticMove.mockClear();
      act(() => mocks.setSelected?.(messageFor(13)));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('13'));
      fireEvent.click(screen.getByRole('button', { name: 'Set awaiting' }));
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
    });
  });

  // The remembered card belongs to the thread it was opened for. It used to be forgotten only by
  // the detail's own close, so any other way the open thread changed (a classification, Back
  // removing ?id, a link to another thread) left it pointing at the old card — and the next
  // thread's status change moved THAT card.
  describe('board: the remembered card follows the open thread, however it changed', () => {
    const openCard12 = async () => {
      localStorage.setItem('messages_view_mode', 'kanban');
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'open card 12' }));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    };
    const showByUrl = async (id: number) => {
      act(() => mocks.setSelected?.(messageFor(id)));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent(String(id)));
    };
    const setAwaiting = () => {
      mocks.optimisticMove.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Set awaiting' }));
    };

    it('after Move to spam closes the detail', async () => {
      await openCard12();
      fireEvent.click(screen.getByRole('button', { name: 'Move to spam' }));
      await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
      await showByUrl(13);
      setAwaiting();
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
    });

    it('after Back removes ?id (the open message goes to none)', async () => {
      await openCard12();
      act(() => mocks.setSelected?.(null));
      await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
      await showByUrl(13);
      setAwaiting();
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
    });

    it('after a link switches straight to another thread', async () => {
      await openCard12();
      await showByUrl(13);
      setAwaiting();
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
    });

    it('CONTROL: the card just opened is the one moved (its record arrives after the click)', async () => {
      await openCard12();
      setAwaiting();
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_12', 'awaiting');
    });

    it('CONTROL: a refresh of the same thread keeps the card', async () => {
      await openCard12();
      await showByUrl(12);
      setAwaiting();
      expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_12', 'awaiting');
    });
  });

  it('MANAGE_ORGANIZATION alone is enough (an org admin)', async () => {
    mocks.granted = new Set(['manage_organization']);
    renderPage();
    await openDetail(12);
    expect(screen.getByRole('button', { name: 'More → Delete thread' })).toBeInTheDocument();
  });
});

// Every action here that can empty a queue refreshes the sidebar badge's own query
// (useNotificationCounts) at once, instead of leaving the old count up until the 60 s poll.
describe('MessagesPage — the sidebar badge refreshes', () => {
  let invalidate: MockInstance<QueryClient['invalidateQueries']>;
  beforeEach(() => {
    invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
  });
  afterEach(() => invalidate.mockRestore());
  const badgeRefreshes = () =>
    invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === '["notification-counts"]'
    ).length;

  it('after a delete', async () => {
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(badgeRefreshes()).toBe(1);
  });

  it('control: not after a refused delete', async () => {
    mocks.del.mockRejectedValueOnce(new Error('refused'));
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(badgeRefreshes()).toBe(0);
  });

  it('after a classification from the open detail (Move to spam)', async () => {
    renderPage();
    await openDetail(12);
    fireEvent.click(screen.getByRole('button', { name: 'Move to spam' }));
    await waitFor(() => expect(mocks.classify).toHaveBeenCalled());
    expect(mocks.classify.mock.calls[0]).toEqual(expect.arrayContaining([12, 'move_to_spam']));
    await waitFor(() => expect(badgeRefreshes()).toBe(1));
  });

  it('when another agent routes a thread (the conversation:routed ping)', async () => {
    renderPage();
    // Every subscriber, as the socket would: the page listens to this event twice (the
    // routing handler and the coalesced view-count re-read), and which one registered last
    // is an accident of effect order.
    const routed = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([event]) => event === 'conversation:routed')
      .map(([, handler]) => handler as () => void);
    expect(routed.length).toBeGreaterThan(0);
    act(() => routed.forEach((handler) => handler()));
    await waitFor(() => expect(badgeRefreshes()).toBe(1));
  });
});

// Another agent's change arrives as a socket event. Every one used to re-read the list and the
// whole board at once — per event, per open tab — which kept a customer's database at its ceiling
// (2026-10). They now join one refresh per SERVER_EVENT_REFRESH_MS.
describe("MessagesPage — other people's changes refresh the board once per window", () => {
  const EVENTS = [
    'conversation:updated',
    'conv:status_changed',
    'message:replied',
    'conversation:routed',
    'ticket:updated',
  ];
  const fire = (event: string) =>
    vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === event)
      .forEach(([, handler]) => (handler as () => void)());
  const boardKey = () => Number(screen.getByTestId('board').dataset.refreshKey);

  afterEach(() => vi.useRealTimers());

  it('a burst of every event kind = ONE board refresh, after the window', () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    vi.useFakeTimers();
    const before = boardKey();
    act(() => {
      for (let round = 0; round < 3; round += 1) EVENTS.forEach(fire);
    });
    expect(boardKey()).toBe(before);
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS);
    });
    expect(boardKey()).toBe(before + 1);
  });

  it('new mail AND a state change in one window = ONE board refresh, not two', () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    vi.useFakeTimers();
    const before = boardKey();
    act(() => {
      fire('conversation:new');
      fire('conversation:updated');
    });
    // Long enough for both the 1 s new-mail delay and the shared window behind it.
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS + 2000);
    });
    expect(boardKey()).toBe(before + 1);
    // Control: new mail on its own still refreshes the board.
    act(() => {
      fire('conversation:new');
    });
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS + 2000);
    });
    expect(boardKey()).toBe(before + 2);
  });

  it.each(EVENTS)('%s alone still refreshes the board', (event) => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    vi.useFakeTimers();
    const before = boardKey();
    act(() => fire(event));
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS);
    });
    expect(boardKey()).toBe(before + 1);
  });
});
