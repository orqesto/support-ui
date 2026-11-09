/**
 * Split view: the row marked as open (aria-current) follows the thread the pane reads, also when
 * a link switches straight to another thread. Harness copied from MessagesPageDelete.test.tsx.
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
    reopen: vi.fn(() => Promise.resolve()),
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
  useAuthStore: Object.assign(
    (selector?: (state: { user: null }) => unknown) =>
      selector ? selector({ user: null }) : { user: null },
    { getState: () => ({ user: null, selectedOrganizationId: null }) }
  ),
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
    onRefresh,
    onReopen,
  }: {
    message: { id: number; subject?: string };
    onRefresh?: () => Promise<void>;
    onReopen?: () => Promise<void>;
    onDelete?: () => void;
    onClassify?: (action: string) => Promise<void>;
    onNavigate?: (direction: 'next' | 'prev') => void;
    onOptimisticMove?: (columnId: string) => void;
  }) => (
    <div data-testid="detail-pane" data-subject={message.subject}>
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
      <button type="button" onClick={() => void onRefresh?.()}>
        Refresh thread
      </button>
      <button type="button" onClick={() => void onReopen?.()}>
        Reopen thread
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

describe('MessagesPage — split view', () => {
  // Split view marks the row it is reading. The remembered card is read DURING render, and is
  // only forgotten in an effect afterwards, so the row must not trust a card remembered for
  // another message.
  describe('split view: the row marked as open follows the open thread', () => {
    let matchMediaSpy: MockInstance | undefined;
    beforeEach(() => {
      localStorage.setItem('messages_list_layout', 'split');
      const mql = (query: string) =>
        ({
          matches: query.includes('min-width: 1024px'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList;
      if (typeof window.matchMedia === 'function') {
        matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(mql);
      } else {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: mql,
        });
      }
    });
    afterEach(() => {
      localStorage.removeItem('messages_list_layout');
      matchMediaSpy?.mockRestore();
    });

    it('a link switching straight to another thread moves the mark to that row', async () => {
      renderPage();
      await openDetail(12);
      expect(row(12)).toHaveAttribute('aria-current', 'true');
      act(() => mocks.setSelected?.(messageFor(11)));
      await waitFor(() => expect(screen.getByTestId('detail-pane')).toHaveTextContent('11'));
      expect(row(11)).toHaveAttribute('aria-current', 'true');
      expect(row(12)).not.toHaveAttribute('aria-current');
    });
  });
});
