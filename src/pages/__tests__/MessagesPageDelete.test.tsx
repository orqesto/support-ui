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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
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

vi.mock('@/hooks/useMessagesData', () => ({
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
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
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
  PageHeader: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
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
vi.mock('@/components/messages/ComposeNewModal', () => ({ ComposeNewModal: () => null }));
vi.mock('@/components/messages/ThreadBubble', () => ({ ThreadBubble: () => null }));
vi.mock('@/components/messages/ContactsView', () => ({
  ContactsView: () => <div data-testid="contacts-view" />,
}));
// The board: opens a card the way a click does, and exposes its optimistic move to the page.
vi.mock('@/components/messages/MessagesKanbanView', async () => {
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
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({
    message,
    onDelete,
    onNavigate,
    onOptimisticMove,
  }: {
    message: { id: number };
    onDelete?: () => void;
    onNavigate?: (direction: 'next' | 'prev') => void;
    onOptimisticMove?: (columnId: string) => void;
  }) => (
    <div data-testid="detail-pane">
      {message.id}
      {onDelete && (
        <button type="button" onClick={onDelete}>
          More → Delete message
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
    </div>
  ),
}));

import { MessagesPage } from '../MessagesPage';

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
      <MemoryRouter initialEntries={['/messages']}>
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
  fireEvent.click(screen.getByRole('button', { name: 'More → Delete message' }));

describe('MessagesPage — slide-over More → Delete message', () => {
  it('the detail stays open behind the question; Cancel leaves it open, nothing deleted', async () => {
    renderPage();
    await openDetail(12);
    pressDelete();
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete message');
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete message');
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
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
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to delete message');
  });

  it('a viewer without DELETE_MESSAGES or MANAGE_ORGANIZATION is not offered Delete', async () => {
    mocks.granted = new Set(['view_messages']);
    renderPage();
    await openDetail(12);
    expect(screen.queryByRole('button', { name: 'More → Delete message' })).toBeNull();
  });

  it('board: the deleted thread’s card leaves the board (no delete socket event would move it)', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.optimisticMove).toHaveBeenCalledTimes(1);
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_12', null);
  });

  it('board: the open message changed without a click (Back): no LIVE card is taken; the board refetches', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    const keyBefore = Number(screen.getByTestId('board').dataset.refreshKey);
    act(() => mocks.setSelected?.(messageFor(11)));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(mocks.del).toHaveBeenCalledWith(11);
    expect(mocks.optimisticMove).not.toHaveBeenCalled();
    expect(Number(screen.getByTestId('board').dataset.refreshKey)).toBeGreaterThan(keyBefore);
  });

  it('CONTROL board: Cancel leaves the card where it is', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'open card 12' }));
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
      fireEvent.click(screen.getByRole('button', { name: 'open card 12' }));
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
  });

  it('MANAGE_ORGANIZATION alone is enough (an org admin)', async () => {
    mocks.granted = new Set(['manage_organization']);
    renderPage();
    await openDetail(12);
    expect(screen.getByRole('button', { name: 'More → Delete message' })).toBeInTheDocument();
  });
});
