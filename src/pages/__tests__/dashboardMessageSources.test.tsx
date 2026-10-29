/**
 * The dashboard read "is there a message source?" from `/api/integrations`, which needs
 * VIEW_INTEGRATIONS. A support user lacks it, so the 403 read as "none" and Quick Actions said
 * "No message sources configured. Go to Settings…" on a workspace whose mail was flowing — and
 * the support role DOES have PROCESS_MESSAGES, so the checks it disabled were theirs to run.
 *
 * It now reads `/api/messages/sources` (VIEW_MESSAGES), which every inbox role can read.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { MessageSourceOption } from '@/services/message.service';

const page = (total: number) => ({
  success: true,
  data: [],
  pagination: { total, page: 1, limit: 1, totalPages: 1 },
});
const getThreads = vi.fn(() => Promise.resolve(page(0)));
const getMessageSourcesForFilter = vi.fn<() => Promise<MessageSourceOption[]>>();
// The support user's view of /api/integrations.
const getAllIntegrations = vi.fn(() =>
  Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 }))
);

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/message.service', () => ({
  // A backend without POST /threads/board: one search per tile, which these tests read.
  messageService: {
    getThreads,
    getMessageSourcesForFilter,
    getThreadBoard: () => Promise.resolve(null),
  },
}));
vi.mock('@/services/sla.service', () => ({
  slaService: { getSummary: () => Promise.resolve(null) },
}));
vi.mock('@/services/ticket.service', () => ({
  ticketService: { getAll: () => Promise.resolve(page(0)) },
  fetchTicketViewCounts: () => Promise.resolve(null),
}));
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getAll: () => Promise.resolve({ success: true, data: { pagination: { total: '0' } } }),
  },
}));
vi.mock('@/services/documentation.service', () => ({
  documentationService: { getStats: () => Promise.resolve({ totalDocs: 0 }) },
}));
vi.mock('@/services/ingestion.service', () => ({ ingestionService: {} }));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: getAllIntegrations },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'ctx' }));
vi.mock('@/hooks/useEmailProcessing', () => ({ useEmailProcessing: () => ({}) }));
vi.mock('@/hooks/useSystemHealth', () => ({ useSystemHealth: () => ({}) }));
vi.mock('@/hooks/useTelegramProcessing', () => ({ useTelegramProcessing: () => ({}) }));
vi.mock('@/stores/messagesStore', () => ({ useMessagesStore: () => ({}) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => permission !== 'view_integrations',
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
  }),
}));

const { DashboardPage } = await import('../DashboardPage');

const source = (type: string, enabled = true): MessageSourceOption => ({
  id: 1,
  name: `${type} inbox`,
  type,
  departmentId: 2,
  enabled,
});

const startAll = () => screen.findByRole('button', { name: /Start All Services/ });

afterEach(cleanup);

describe('Quick Actions for a role that cannot read integrations', () => {
  beforeEach(() => {
    getMessageSourcesForFilter.mockReset();
  });

  it('a live Gmail source enables the checks — no "No message sources configured"', async () => {
    getMessageSourcesForFilter.mockResolvedValue([source('gmail')]);
    render(<DashboardPage />);
    await waitFor(() => expect(getMessageSourcesForFilter).toHaveBeenCalled());
    await waitFor(async () => expect(await startAll()).toBeEnabled());
    expect(screen.queryByText(/No message sources configured/)).not.toBeInTheDocument();
  });

  it('CONTROL: only a disabled source still says none are configured', async () => {
    getMessageSourcesForFilter.mockResolvedValue([source('gmail', false)]);
    render(<DashboardPage />);
    await waitFor(() => expect(getMessageSourcesForFilter).toHaveBeenCalled());
    expect(await screen.findByText(/No message sources configured/)).toBeInTheDocument();
    expect(await startAll()).toBeDisabled();
  });

  it('a Telegram-only workspace enables "all" and Telegram, not Email', async () => {
    getMessageSourcesForFilter.mockResolvedValue([source('telegram')]);
    render(<DashboardPage />);
    await waitFor(async () => expect(await startAll()).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Telegram' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Email' })).toBeDisabled();
  });
});
