/**
 * Inbox slide-over → More → Delete message, the paths around the confirm that the existing suite
 * (MessagesPageDelete.test.tsx, whose harness this copies) does not reach:
 * - a double press before the re-render disables the button sends ONE DELETE;
 * - the detail closing (Back, the phone close) while the confirm is up, or while the DELETE runs,
 *   neither throws nor loses the delete;
 * - another card opened while the confirm is up keeps its card for J/K and status moves.
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
            {threads.map((thread, index) => (
              <button key={thread.threadId} type="button" onClick={() => onOpen(threads[index])}>
                open card {IDS[index]}
              </button>
            ))}
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

const confirmButton = () => screen.getByRole('button', { name: 'Delete' });
const hangingDelete = () => {
  const settle = { resolve: (_value: unknown) => {} };
  mocks.del.mockReturnValue(
    new Promise((resolve) => {
      settle.resolve = resolve;
    })
  );
  return settle;
};

describe('MessagesPage — slide-over delete, around the confirm', () => {
  it('a double press before the re-render sends ONE DELETE', async () => {
    const settle = hangingDelete();
    renderPage();
    await openDetail(12);
    pressDelete();
    const button = confirmButton();
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(mocks.del).toHaveBeenCalled());
    expect(mocks.del).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle.resolve({ success: true });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  it('the detail closed while the confirm was up: Delete still deletes that message', async () => {
    renderPage();
    await openDetail(12);
    pressDelete();
    act(() => mocks.setSelected?.(null));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete message');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the detail closed while the DELETE ran: it lands without a crash and the confirm closes', async () => {
    const settle = hangingDelete();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    await openDetail(12);
    pressDelete();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith(12));
    act(() => mocks.setSelected?.(null));
    await waitFor(() => expect(screen.queryByTestId('detail-pane')).toBeNull());
    await act(async () => {
      settle.resolve({ success: true });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // CONTROL for the crash: the page is still there.
    expect(row(11)).toBeInTheDocument();
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/TypeError|Cannot read/);
    errors.mockRestore();
  });

  it('board: another card opened while the confirm was up keeps its card for status moves', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'open card 12' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('12'));
    pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'open card 11' }));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.del).toHaveBeenCalledWith(12);
    // The deleted card was not the open one: no optimistic removal of a card.
    expect(mocks.optimisticMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('detail-pane')).toHaveTextContent('11');
    fireEvent.click(screen.getByRole('button', { name: 'Set awaiting' }));
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_11', 'awaiting');
  });
});
