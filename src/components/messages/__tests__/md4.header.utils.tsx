/**
 * Message detail v4 — the header's shared test setup: service and hook mocks, the sample message,
 * renderHeader and the viewport switch. Imported FIRST by every md4.header.*.test.tsx, so its
 * mocks are registered before the header module loads.
 *
 * Areas: H1 sentence-case chips · H2 ticket chip + Related popover · H4 "Merged · n" chip + Same
 * conversation · H5 More menu pickers (+ phone-only items) · H6 tinted label pills.
 * (H3 — the owes-reply prompt — is headerTicketChip.test.tsx.)
 */
import { vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { PHONE_QUERY } from '../useIsPhone';

const perms = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: true,
    isOrgAdmin: true,
    canManage: true,
    hasPermission: (permission: string) => !perms.denied.has(permission),
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

const svc = vi.hoisted(() => ({
  ticketsOfThread: vi.fn(),
  threadsOfTicket: vi.fn(),
  removeThread: vi.fn(),
  addThreads: vi.fn(),
  listMerges: vi.fn(),
  unmerge: vi.fn(),
  merge: vi.fn(),
  getAll: vi.fn(),
  getThreads: vi.fn(),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: {
    ticketsOfThread: svc.ticketsOfThread,
    threadsOfTicket: svc.threadsOfTicket,
    removeThread: svc.removeThread,
    addThreads: svc.addThreads,
  },
}));
vi.mock('@/services/conversationMerge.service', () => ({
  conversationMergeService: {
    listMerges: svc.listMerges,
    unmerge: svc.unmerge,
    merge: svc.merge,
    participants: () => Promise.resolve([]),
  },
  MergeAssigneeConflictError: class extends Error {},
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll: svc.getAll } }));
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'getThreads'
          ? svc.getThreads
          : prop === 'getLinkedTicket'
            ? () => Promise.resolve({ success: true, data: { id: 5, status: 'open' } })
            : () => Promise.resolve({ success: true, data: null }),
    }
  ),
}));
vi.mock('@/services/category.service', () => ({
  categoryService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock('@/services/settings.service', () => ({
  labelService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const message = {
  id: 1,
  publicId: 'SUP-1',
  status: 'open',
  lastReplyFromClient: true, // → In progress
  channel: 'email',
  sender: 'Ada <ada@example.com>',
  subject: 'Hello',
  priority: 'high',
  slaResponseMinutes: 60,
  createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  metadata: { analysis: { category: 'other' } },
} as unknown as Message;

const ticket = (over: Record<string, unknown>) => ({
  ticketId: 7,
  publicId: null,
  title: 'Checkout outage',
  status: 'in_progress',
  priority: 'high',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
  ...over,
});

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const renderHeader = (over: Partial<Parameters<typeof MessageDetailHeader>[0]> = {}) =>
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/messages/1']}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <MessageDetailHeader
                    message={message}
                    showFullPageButton={false}
                    isFullPage
                    threadCount={1}
                    {...over}
                  />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

const setPhone = (phone: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: phone && query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  perms.denied.clear();
  svc.ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 0 });
  svc.threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 0 });
  svc.removeThread.mockResolvedValue(true);
  svc.addThreads.mockResolvedValue({ added: [1], alreadyAttached: [] });
  svc.listMerges.mockResolvedValue([]);
  svc.unmerge.mockResolvedValue(undefined);
  svc.getAll.mockResolvedValue({ data: [{ id: 30, title: 'Login broken', status: 'open' }] });
  svc.getThreads.mockResolvedValue({ data: [] });
});
afterEach(() => {
  // jsdom has no matchMedia; a test that installs one must not leak it.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** True when the element or an ancestor up to the chip row carries an uppercase class. */
const uppercased = (node: Element | null): boolean => {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (el.classList.contains('uppercase')) return true;
  }
  return false;
};

const twoTickets = () =>
  svc.ticketsOfThread.mockResolvedValue({
    unavailable: false,
    hiddenCount: 0,
    rows: [
      ticket({ ticketId: 9, title: 'Refund export', status: 'resolved', externalId: 'OPS-12' }),
      ticket({ ticketId: 7, isPrimary: true }),
    ],
  });

export { perms, svc, message, ticket, Where, renderHeader, setPhone, uppercased, twoTickets };
