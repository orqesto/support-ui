/**
 * Opening, closing and status changes racing each other on the Messages page:
 * - an action that closes the thread after a read (Resolve, Not customer work, Move to spam)
 *   closed whatever was open by then — a thread opened meanwhile shut and its card was lost —
 *   and left `?id` naming the closed thread;
 * - a refused or failed open left the page's card refs (and `?id`) naming the thread that never
 *   opened, so J/K and status moves acted on it while the old thread stayed on screen;
 * - closing the panel while an open was still reading its record let that record pop it back.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

const mocks = vi.hoisted(() => ({
  classify: vi.fn(() => Promise.resolve()),
  fetchMessages: vi.fn(() => Promise.resolve()),
  optimisticMove: vi.fn(),
  toastError: vi.fn(),
}));

const IDS = [11, 12, 13] as const;

const messageFor = (id: number) => ({
  id,
  conversationId: id,
  publicId: `SUP-${id}`,
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
      publicId: `SUP-${id}`,
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
    fetchMessages: mocks.fetchMessages,
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
    delete: vi.fn(() => Promise.resolve({ success: true })),
    // The service answers { columns, counts } or null (no route) — never { success }: that shape
    // threw in the view counts once they ran before the test ended (CI #892, unhandled rejection).
    getThreadBoard: vi.fn(() => Promise.resolve({ columns: {}, counts: {} })),
    classify: mocks.classify,
    reopen: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// DELETE /api/messages/:id takes DELETE_MESSAGES or MANAGE_ORGANIZATION (BE messageRoutes).
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
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
      ({ onOpen }: { onOpen: (thread: MessageThread) => void }, ref) => {
        useImperativeHandle(ref, () => ({ optimisticMove: mocks.optimisticMove }));
        return (
          <div data-testid="board">
            {threads.map((thread) => (
              <button key={thread.threadId} type="button" onClick={() => onOpen(thread)}>
                {`open card ${thread.threadId}`}
              </button>
            ))}
          </div>
        );
      }
    ),
  };
});
// Stand-in for the detail: one button per page callback these tests drive.
vi.mock('@/features/messages/components/MessageDetail', () => ({
  MessageDetail: ({
    message,
    onClose,
    onNavigate,
    onOptimisticMove,
    onClassify,
    onReject,
    onResolve,
    onDelete,
  }: {
    message: { id: number };
    onDelete?: () => void;
    onClose?: () => void;
    onClassify?: (action: string) => Promise<void>;
    onReject?: () => void;
    onResolve?: () => void;
    onNavigate?: (direction: 'next' | 'prev') => void;
    onOptimisticMove?: (columnId: string) => void;
  }) => (
    <div data-testid="detail-pane">
      {message.id}
      <button type="button" onClick={onClose}>
        X (close)
      </button>
      {onNavigate && (
        <button type="button" onClick={() => onNavigate('next')}>
          J (next)
        </button>
      )}
      <button type="button" onClick={() => onOptimisticMove?.('awaiting')}>
        Set awaiting
      </button>
      <button type="button" onClick={() => onResolve?.()}>
        Resolve
      </button>
      <button type="button" onClick={() => onReject?.()}>
        Not customer work
      </button>
      <button type="button" onClick={() => void onClassify?.('move_to_spam')}>
        Move to spam
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete}>
          More → Delete thread
        </button>
      )}
    </div>
  ),
}));

import { MessagesPage } from '../MessagesPage';
import { messageService } from '@/services/message.service';

const getById = vi.mocked(messageService.getById);

/** The address bar's `?id`, and Back — the two things an agent can see and do with the URL. */
const UrlProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url-id">{new URLSearchParams(location.search).get('id') ?? ''}</output>
      <button type="button" onClick={() => navigate(-1)}>
        Browser Back
      </button>
    </>
  );
};

beforeEach(() => {
  localStorage.setItem('messages_view_mode', 'threads');
});
afterEach(() => {
  vi.clearAllMocks();
  mocks.fetchMessages.mockImplementation(() => Promise.resolve());
});

const renderPage = (entries = ['/threads']) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <MessagesPage />
        <UrlProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );

const row = (id: number) => document.querySelector(`[data-select-id="${id}"]`) as HTMLElement;
const detail = () => screen.queryByTestId('detail-pane');
const urlId = () => screen.getByTestId('url-id').textContent;
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const openDetail = async (id: number) => {
  fireEvent.click(row(id));
  await waitFor(() => expect(detail()).toHaveTextContent(String(id)));
};
/** The next call of `mock` waits until the returned function is called. */
const holdNext = <T,>(
  mock: { mockImplementationOnce: (fn: () => Promise<T>) => unknown },
  value: T
) => {
  let land: () => void = () => {};
  mock.mockImplementationOnce(
    () =>
      new Promise<T>((resolve) => {
        land = () => resolve(value);
      })
  );
  return async () => {
    await act(async () => {
      land();
      await Promise.resolve();
    });
  };
};

describe('MessagesPage — a close that waits on a read closes only the thread it was for', () => {
  it.each(['Resolve', 'Not customer work', 'Move to spam'])(
    '%s on 12, then 11 opened before the list re-read lands: 11 stays open',
    async (action) => {
      renderPage();
      await openDetail(12);
      const land = holdNext(mocks.fetchMessages, undefined);
      press(action);
      await waitFor(() => expect(mocks.fetchMessages).toHaveBeenCalled());
      await openDetail(11);
      await land();
      expect(detail()).toHaveTextContent('11');
      expect(urlId()).toBe('COR-SUP-11');
      // 11's card is still the remembered one: J steps from 11, to 12.
      press('J (next)');
      await waitFor(() => expect(detail()).toHaveTextContent('12'));
    }
  );

  it('board: Resolve on 12, then card 13 opened: a status change moves 13’s card', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'open card conv_12' }));
    await waitFor(() => expect(detail()).toHaveTextContent('12'));
    const land = holdNext(mocks.fetchMessages, undefined);
    press('Resolve');
    await waitFor(() => expect(mocks.fetchMessages).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'open card conv_13' }));
    await waitFor(() => expect(detail()).toHaveTextContent('13'));
    await land();
    mocks.optimisticMove.mockClear();
    press('Set awaiting');
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_13', 'awaiting');
  });

  it.each(['Resolve', 'Not customer work', 'Move to spam'])(
    'CONTROL: %s while staying on 12 closes it and drops ?id',
    async (action) => {
      renderPage();
      await openDetail(12);
      expect(urlId()).toBe('COR-SUP-12');
      press(action);
      await waitFor(() => expect(detail()).toBeNull());
      expect(urlId()).toBe('');
    }
  );

  it('CONTROL: Resolve on 12, J to 13 still loading when the re-read lands: 13 opens', async () => {
    renderPage();
    await openDetail(12);
    const landList = holdNext(mocks.fetchMessages, undefined);
    press('Resolve');
    await waitFor(() => expect(mocks.fetchMessages).toHaveBeenCalled());
    const landOpen = holdNext(getById, { success: true, data: messageFor(13) } as never);
    press('J (next)');
    await waitFor(() => expect(getById).toHaveBeenLastCalledWith(13));
    await landList();
    await landOpen();
    await waitFor(() => expect(detail()).toHaveTextContent('13'));
    expect(urlId()).toBe('COR-SUP-13');
  });
});

describe('MessagesPage — a refused or failed open gives the open thread back its place', () => {
  it.each([
    ['refused', () => holdNext(getById, { success: false } as never)],
    [
      'failed',
      () => {
        getById.mockImplementationOnce(() => Promise.reject(new Error('network')));
        return async () => {};
      },
    ],
  ])(
    'J from 11 to 12 is %s: 11 stays, ?id names 11, the next J steps from 11',
    async (_, setUp) => {
      renderPage();
      await openDetail(11);
      const land = setUp();
      press('J (next)');
      await waitFor(() => expect(getById).toHaveBeenLastCalledWith(12));
      await land();
      await waitFor(() => expect(urlId()).toBe('COR-SUP-11'));
      expect(detail()).toHaveTextContent('11');
      expect(row(12)).not.toHaveAttribute('aria-busy');
      press('J (next)');
      await waitFor(() => expect(detail()).toHaveTextContent('12'));
    }
  );

  it('board: card 12’s open is refused while 11 is open: a status change moves 11’s card', async () => {
    localStorage.setItem('messages_view_mode', 'kanban');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'open card conv_11' }));
    await waitFor(() => expect(detail()).toHaveTextContent('11'));
    getById.mockImplementationOnce(() => Promise.resolve({ success: false } as never));
    fireEvent.click(screen.getByRole('button', { name: 'open card conv_12' }));
    await waitFor(() => expect(getById).toHaveBeenLastCalledWith(12));
    await waitFor(() => expect(urlId()).toBe('COR-SUP-11'));
    mocks.optimisticMove.mockClear();
    press('Set awaiting');
    expect(mocks.optimisticMove).toHaveBeenCalledWith('conv_11', 'awaiting');
  });
});

describe('MessagesPage — closing while an open is still loading', () => {
  const holdOpen = (id: number) =>
    holdNext(getById, { success: true, data: messageFor(id) } as never);

  it.each(['X (close)', 'Close'])(
    '11 open, 12 clicked, %s pressed before 12 arrives: nothing pops back',
    async (closeButton) => {
      renderPage();
      await openDetail(11);
      const land = holdOpen(12);
      fireEvent.click(row(12));
      await waitFor(() => expect(row(12)).toHaveAttribute('aria-busy', 'true'));
      press(closeButton);
      await waitFor(() => expect(detail()).toBeNull());
      // The row stops saying it is busy at once.
      expect(row(12)).not.toHaveAttribute('aria-busy');
      await land();
      expect(detail()).toBeNull();
      expect(urlId()).toBe('');
    }
  );

  it('Back while the first open is still loading: nothing pops back', async () => {
    renderPage();
    const land = holdOpen(12);
    fireEvent.click(row(12));
    await waitFor(() => expect(urlId()).toBe('COR-SUP-12'));
    press('Browser Back');
    await waitFor(() => expect(urlId()).toBe(''));
    expect(row(12)).not.toHaveAttribute('aria-busy');
    await land();
    expect(detail()).toBeNull();
  });

  it('CONTROL: an open nobody closed still arrives', async () => {
    renderPage();
    const land = holdOpen(12);
    fireEvent.click(row(12));
    await waitFor(() => expect(row(12)).toHaveAttribute('aria-busy', 'true'));
    await land();
    await waitFor(() => expect(detail()).toHaveTextContent('12'));
    expect(row(12)).not.toHaveAttribute('aria-busy');
  });
});

// A link (or a history entry) naming a thread is read by useMessagesUrlSync. An answer for a link
// the agent already left used to open that thread anyway.
describe('MessagesPage — a deep-link read for an id the URL no longer names', () => {
  const holdOpen = (id: number) =>
    holdNext(getById, { success: true, data: messageFor(id) } as never);

  it('Back to ?id=11, then Back to no id while 11 is still loading: nothing pops open', async () => {
    renderPage(['/threads', '/threads?id=COR-SUP-11', '/threads?id=COR-SUP-12']);
    await waitFor(() => expect(detail()).toHaveTextContent('12'));
    const land = holdOpen(11);
    press('Browser Back');
    await waitFor(() => expect(getById).toHaveBeenLastCalledWith('COR-SUP-11', undefined));
    press('Browser Back');
    await waitFor(() => expect(detail()).toBeNull());
    await land();
    expect(detail()).toBeNull();
    expect(urlId()).toBe('');
  });

  it('a link read still loading when a row is opened: the row’s thread stays', async () => {
    const land = holdOpen(11);
    renderPage(['/threads?id=COR-SUP-11']);
    await waitFor(() => expect(getById).toHaveBeenLastCalledWith('COR-SUP-11', undefined));
    await openDetail(12);
    await land();
    expect(detail()).toHaveTextContent('12');
    expect(urlId()).toBe('COR-SUP-12');
  });

  it('CONTROL: a link that stays still opens when its read lands', async () => {
    const land = holdOpen(11);
    renderPage(['/threads?id=COR-SUP-11']);
    await waitFor(() => expect(getById).toHaveBeenLastCalledWith('COR-SUP-11', undefined));
    await land();
    await waitFor(() => expect(detail()).toHaveTextContent('11'));
    expect(urlId()).toBe('COR-SUP-11');
  });
});

describe('MessagesPage — delete closes the thread and drops ?id', () => {
  const confirmDelete = async () => {
    press('More → Delete thread');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  };

  it('the deleted thread’s ?id leaves the address bar', async () => {
    renderPage();
    await openDetail(12);
    await confirmDelete();
    await waitFor(() => expect(detail()).toBeNull());
    expect(urlId()).toBe('');
  });

  it('CONTROL: 11 opened while the delete of 12 ran: 11 and its ?id stay', async () => {
    renderPage();
    await openDetail(12);
    const land = holdNext(vi.mocked(messageService.delete), { success: true } as never);
    await confirmDelete();
    await waitFor(() => expect(messageService.delete).toHaveBeenCalledWith(12));
    await openDetail(11);
    await land();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(detail()).toHaveTextContent('11');
    expect(urlId()).toBe('COR-SUP-11');
  });
});
