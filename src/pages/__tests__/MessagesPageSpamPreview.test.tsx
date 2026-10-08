/**
 * The spam-rule-record dialog shows the WHOLE message (owner, 2026-10-01: "why i dont see full spam
 * message?"), and says only what is true of it. A `spamlog_` card is a spam-rule record of mail
 * not attached to a conversation in this view — withheld rows are never cards — so this dialog is the
 * only place its body can be read. It used to fold the quoted part behind "show quoted", call
 * every card "Blocked spam", and hide a backend cut; each is pinned below.
 *
 * WIRED: the real MessagesPage opening the real dialog around the real ThreadBubble. A
 * ThreadBubble-only test would stay green if the page stopped passing the prop.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

const MAIN = 'Please refund my order 4411, it never arrived and I have waited two weeks now.';
const QUOTED = 'QUOTED-HISTORY-MARKER our earlier answer about order 4411';
const BODY = `${MAIN}\n\nOn Mon, 28 Sep 2026 at 10:00, Support <support@shop.example> wrote:\n> ${QUOTED}`;

const threads = [
  {
    threadId: 'spamlog_828',
    sender: 'orders@spammer.example',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: -828,
      sender: 'orders@spammer.example',
      subject: 'Re: order 4411',
      content: BODY,
      channel: 'email',
      status: 'filtered',
      isSpamLog: true,
      createdAt: new Date().toISOString(),
      metadata: { spamCheck: { isSpam: true, category: 'spam', redFlags: [] } },
    },
  } as unknown as MessageThread,
  // A catch record of mail that stayed visible, whose conversation is gone and no body kept.
  {
    threadId: 'spamlog_829',
    sender: 'customer@example.com',
    lastMessageAt: new Date(Date.now() - 60_000).toISOString(),
    latestMessage: {
      id: -829,
      sender: 'customer@example.com',
      subject: 'Re: lost reply',
      content: null,
      channel: 'email',
      status: 'filtered',
      isSpamLog: true,
      createdAt: new Date().toISOString(),
      metadata: { spamCheck: { isSpam: false, category: 'legitimate', redFlags: [] } },
    },
  } as unknown as MessageThread,
  // A body the backend cut at its per-card bound (prod max 838,239 characters).
  {
    threadId: 'spamlog_830',
    sender: 'orders@spammer.example',
    lastMessageAt: new Date(Date.now() - 120_000).toISOString(),
    latestMessage: {
      id: -830,
      sender: 'orders@spammer.example',
      subject: 'Re: cut body',
      content: 'y'.repeat(262_144),
      contentTruncatedFrom: 838_239,
      channel: 'email',
      status: 'filtered',
      isSpamLog: true,
      createdAt: new Date().toISOString(),
      metadata: { spamCheck: { isSpam: true, category: 'spam', redFlags: [] } },
    },
  } as unknown as MessageThread,
];

vi.mock('@/hooks/useMessagesData', () => ({
  useMessagesData: () => ({
    threads,
    loading: false,
    refreshing: false,
    setRefreshing: vi.fn(),
    messagesPagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    fetchMessages: vi.fn(() => Promise.resolve()),
    handlePageChange: vi.fn(),
    handleRefresh: vi.fn(),
    clearCache: vi.fn(),
  }),
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    // A spam-log card never fetches a conversation; failing loudly here would mean it tried.
    getById: vi.fn(() => Promise.reject(new Error('a spamlog_ card must not load a conversation'))),
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
vi.mock('@/components/messages/ContactsView', () => ({
  ContactsView: () => <div data-testid="contacts-view" />,
}));
vi.mock('@/components/messages/MessagesKanbanView', () => ({ MessagesKanbanView: () => null }));
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({ message }: { message: { id: number } }) => (
    <div data-testid="detail-pane">{message.id}</div>
  ),
}));

import { ThreadBubble } from '@/components/messages/ThreadBubble';
import { MessagesPage } from '../MessagesPage';

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages']}>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('MessagesPage — spam-rule-record dialog', () => {
  it('shows the quoted part of the message without a click', async () => {
    localStorage.setItem('messages_view_mode', 'threads');
    renderPage();
    fireEvent.click(screen.getByText('Re: order 4411'));

    const dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText(/Please refund my order 4411/)).toBeInTheDocument();
    // The quote is in the DOM straight away, and the toggle offers to HIDE it, not show it.
    expect(within(dialog).getByText(/QUOTED-HISTORY-MARKER/)).toBeInTheDocument();
    expect(within(dialog).queryByText('show quoted')).toBeNull();
    expect(within(dialog).getByText('hide quoted')).toBeInTheDocument();
  });

  it('the dialog says what is known — a rule recorded it, no conversation — never "blocked" or "rejected"', async () => {
    localStorage.setItem('messages_view_mode', 'threads');
    renderPage();
    fireEvent.click(screen.getByText('Re: lost reply'));
    const dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText('Spam-rule record')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /A spam rule recorded this message\. It isn't attached to a conversation in this view — if the message is in a thread, it is linked automatically when spam is viewed in its workspace\./
      )
    ).toBeInTheDocument();
    // Never asserts the conversation is gone: a linkable record beyond the 25-per-load bound, or a
    // view with no workspace selected, still has its message in a thread (audit pass 11).
    expect(
      within(dialog).queryByText(/no longer here|no conversation for this message/)
    ).toBeNull();
    expect(within(dialog).queryByText(/Blocked spam/)).toBeNull();
    expect(within(dialog).queryByText(/rejected by a spam rule/)).toBeNull();
    expect(
      within(dialog).getByText('No message body was kept for this record.')
    ).toBeInTheDocument();
  });

  it('a body the backend cut says so, visibly; a whole body shows no notice', async () => {
    localStorage.setItem('messages_view_mode', 'threads');
    renderPage();
    fireEvent.click(screen.getByText('Re: cut body'));
    let dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(
      within(dialog).getByText(
        'Showing the first 262,144 of 838,239 characters of the stored message source (markup included).'
      )
    ).toBeInTheDocument();
    // A cut body must not be captioned "everything we kept is shown here".
    expect(within(dialog).queryByText(/Everything we kept is shown here/)).toBeNull();
    expect(within(dialog).getByText(/Below is the beginning of what we kept/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByText('Re: order 4411'));
    dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).queryByText(/^Showing the first/)).toBeNull();
    expect(within(dialog).getByText(/Everything we kept is shown here/)).toBeInTheDocument();
  });

  it('control: everywhere else the quote still starts folded (the default is unchanged)', () => {
    render(<ThreadBubble content={BODY} isAgent={false} />);
    expect(screen.getByText(/Please refund my order 4411/)).toBeInTheDocument();
    expect(screen.queryByText(/QUOTED-HISTORY-MARKER/)).toBeNull();
    expect(screen.getByText('show quoted')).toBeInTheDocument();
  });
});
