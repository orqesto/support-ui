/**
 * Inbox select mode, WIRED: the real MessagesPage owning the real selection, rendering real
 * MessageListItem rows and the real BulkActionBar. Children that fetch or draw unrelated
 * surfaces are stubbed; nothing on the selection path is.
 *
 * The component tests prove each piece; these prove the page hands the pieces the right
 * arguments — the page's own shift-click order, `selectMode`, and when `x` / Esc are live.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

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

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages']}>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const row = (id: number) => document.querySelector(`[data-select-id="${id}"]`) as HTMLElement;
const box = (id: number) =>
  within(row(id)).getByRole<HTMLInputElement>('checkbox', { name: /select message/i });
const boxWrapper = (id: number) => box(id).closest('[class*="absolute"]') as HTMLElement;
const checkedIds = () => IDS.filter((id) => box(id).checked);
const bar = () => screen.queryByText(/^\d+ selected$/);

describe('MessagesPage — select mode wiring', () => {
  it('(1) click A, shift-click C ⇒ A, B, C selected and the bar says 3', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(box(11));
    await user.keyboard('{Shift>}');
    await user.click(box(13));
    await user.keyboard('{/Shift}');

    expect(checkedIds()).toEqual([11, 12, 13]);
    expect(bar()?.textContent).toBe('3 selected');
    // Ticking is not opening.
    expect(screen.queryByTestId('detail-pane')).toBeNull();
  });

  it('(2) x on a focused row selects it; Esc clears', () => {
    renderPage();
    act(() => row(12).focus());
    fireEvent.keyDown(row(12), { key: 'x' });
    expect(checkedIds()).toEqual([12]);
    expect(bar()?.textContent).toBe('1 selected');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(checkedIds()).toEqual([]);
    expect(bar()).toBeNull();
  });

  it('(2) x and Esc are inert while the detail pane is open', async () => {
    renderPage();
    fireEvent.keyDown(row(11), { key: 'x' });
    expect(checkedIds()).toEqual([11]);

    // Open row 13: the click leaves focus on the row, behind the pane.
    fireEvent.click(row(13));
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toBeInTheDocument());

    fireEvent.keyDown(row(13), { key: 'x' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(checkedIds()).toEqual([11]);
    expect(bar()?.textContent).toBe('1 selected');
  });

  it('(2) x and Esc are inert in the contacts view', async () => {
    renderPage();
    fireEvent.keyDown(row(11), { key: 'x' });
    expect(bar()?.textContent).toBe('1 selected');

    fireEvent.click(screen.getByText('Contacts view'));
    await waitFor(() => expect(screen.getByTestId('contacts-view')).toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(bar()?.textContent).toBe('1 selected');
  });

  it('(3) nothing selected ⇒ every box hidden; one selected ⇒ every box visible', async () => {
    renderPage();
    for (const id of IDS) expect(boxWrapper(id).className).toContain('opacity-0');

    await userEvent.setup().click(box(12));
    for (const id of IDS) {
      expect(boxWrapper(id).className).toContain('opacity-100');
      expect(boxWrapper(id).className).not.toContain('opacity-0');
    }
  });
});
