/**
 * Mutation batch (message detail v4), chunk 8: the list's empty state — every mutant of the
 * "N are outside this view" line and of the filters wording had no coverage. The line is the
 * bound reporting that it bit: an empty page is not "no messages" when the lens hides some.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ threads: [] as unknown[] }));

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


vi.mock('@/hooks/useMessagesData', () => ({
  useMessagesData: () => ({
    threads: state.threads,
    loading: false,
    refreshing: false,
    setRefreshing: vi.fn(),
    messagesPagination: { page: 1, limit: 50, total: state.threads.length, totalPages: 1 },
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
  },
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
vi.mock('@/hooks/useMessagesUrlSync', () => ({ useMessagesUrlSync: () => undefined }));
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
vi.mock('@/components/messages/MessagesKanbanView', () => ({ MessagesKanbanView: () => null }));
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({ message }: { message: { id: number } }) => (
    <div data-testid="detail-pane">{message.id}</div>
  ),
}));

import { MessagesPage } from '../MessagesPage';

beforeEach(() => {
  localStorage.setItem('messages_view_mode', 'threads');
});


const { useMessagesStore } = await import('@/stores/messagesStore');

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages']}>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const defaults = useMessagesStore.getState();
beforeEach(() => {
  state.threads = [];
  useMessagesStore.setState({ listScope: null, filters: defaults.filters });
});
afterEach(cleanup);

describe('MessagesPage — the empty list says what it is', () => {
  it('an empty page under a lens that hides some says how many are outside this view', () => {
    useMessagesStore.setState({
      listScope: { withoutLens: 1203, hidden: 1200 } as never,
    });
    renderPage();
    expect(screen.getByText('No messages found')).toBeInTheDocument();
    expect(screen.getByText('No messages available')).toBeInTheDocument();
    expect(screen.getByText(/are outside this view/)).toHaveTextContent(
      /^1,200 are outside this view — use Not shown above to jump to them\.$/
    );
  });

  it('CONTROL: nothing hidden, no such line; an active filter changes the wording', () => {
    useMessagesStore.setState({
      listScope: { withoutLens: 0, hidden: 0 } as never,
      filters: { ...defaults.filters, priority: 'high' },
    });
    renderPage();
    expect(screen.getByText('No messages match your filters')).toBeInTheDocument();
    expect(screen.queryByText(/are outside this view/)).toBeNull();
  });

  it('CONTROL: with no scope answer at all, no line either', () => {
    renderPage();
    expect(screen.getByText('No messages available')).toBeInTheDocument();
    expect(screen.queryByText(/are outside this view/)).toBeNull();
  });
});
