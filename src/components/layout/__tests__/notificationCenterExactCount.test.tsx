/**
 * The bell badge and the tab title show the SAME number, and it is the server's exact count —
 * the real SLA hook feeding the real bell, with more rows than the 20-row page. Staging
 * 2026-11-04: the title read the unread rows on the page, so it moved whenever other rows took
 * the page (an admin lock) instead of when something was read.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';

type Config = { params?: { kind?: string; excludeKinds?: string } };
const get = vi.fn<(url: string, config?: Config) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: Config) => get(url, config),
    patch: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: {} }),
  },
}));
vi.mock('@/services/notificationsByKind.service', () => ({
  fetchNotificationsOfKind: (kind: string) => Promise.resolve({ data: { data: byKindPage(kind) } }),
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'support' } }),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/hooks/useTokenLimitAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useTokenLimitAlerts');
  return {
    ...actual,
    useTokenLimitAlerts: () => ({ alerts: [], badged: 0, dismiss: () => {}, refresh: () => {} }),
  };
});

const emptyPage = { notifications: [], total: 0, unreadTotal: 0, hasMore: false };
let aiPage: Record<string, unknown> = emptyPage;
const byKindPage = (kind: string) => (kind === 'ai_provider_down' ? aiPage : emptyPage);

const { NotificationCenter } = await import('../NotificationCenter');
const { useSLANotifications } = await import('@/hooks/useSLANotifications');

type CenterProps = ComponentProps<typeof NotificationCenter>;
const learningProp: CenterProps['learning'] = {
  notifications: [],
  suggestions: [],
  unreadCount: 0,
  fetchError: false,
  isOrgAdmin: false,
  showLearning: false,
  markAllRead: vi.fn(),
  refresh: vi.fn(),
};

const Harness = () => <NotificationCenter sla={useSLANotifications()} learning={learningProp} />;

const breach = (id: number, isRead: boolean) => ({
  id,
  kind: 'sla_message_breach',
  entityType: 'message',
  entityId: 100 + id,
  organizationId: 4,
  severity: 'warning',
  breachAmount: 5,
  createdAt: '2026-10-01T10:00:00.000Z',
  isRead,
  details: {},
});
/** 20 rows on the page, 3 of them unread. */
const PAGE = Array.from({ length: 20 }, (_, index) => breach(index + 1, index >= 3));

const respond = (payload: Record<string, unknown>) =>
  get.mockImplementation((url) =>
    url === '/api/notifications'
      ? Promise.resolve({ data: { data: payload } })
      : Promise.reject(new Error(`unmocked ${url}`))
  );

beforeEach(() => {
  vi.clearAllMocks();
  aiPage = emptyPage;
  document.title = 'Odly';
});
afterEach(() => {
  cleanup();
});

const bellBadge = () => screen.getAllByRole('button')[0].querySelector('span')?.textContent;

describe('bell badge and tab title: one exact number', () => {
  it('more than 20 rows: both show the server count, not the page', async () => {
    respond({ notifications: PAGE, total: 31, unreadTotal: 7, hasMore: true });
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );
    await waitFor(() => expect(document.title).toBe('(7) Odly'));
    expect(bellBadge()).toBe('7');
  });

  it('an older backend: both show the page count, as before', async () => {
    respond({ notifications: PAGE, total: 31, hasMore: true });
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );
    await waitFor(() => expect(document.title).toBe('(3) Odly'));
    expect(bellBadge()).toBe('3');
  });

  it('a standing alert kind past its page counts by the server total', async () => {
    respond({ notifications: [], total: 0, unreadTotal: 0, hasMore: false });
    aiPage = {
      notifications: [
        {
          ...breach(70, false),
          kind: 'ai_provider_down',
          entityType: 'ai_provider',
          details: { provider: 'Example AI' },
        },
      ],
      total: 4, // three more beyond the page (as if the page were full)
      unreadTotal: 4,
      hasMore: true,
    };
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );
    await waitFor(() => expect(document.title).toBe('(4) Odly'));
    expect(bellBadge()).toBe('4');
  });
});
