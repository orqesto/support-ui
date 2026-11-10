/**
 * Moved here with the old /sla page (2026-11-10): the Dashboard's "Avg Response Time" tile opens
 * SLA Performance — now Statistics → Performance — on the SAME window its number came from. A
 * drill-down that lands on another period shows two figures that disagree and nothing saying why.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const page = (total: number) => ({
  success: true,
  data: [],
  pagination: { total, page: 1, limit: 1, totalPages: 1 },
});
const getThreads = vi.fn(() => Promise.resolve(page(7)));
const getStats = vi.fn<() => Promise<{ totalDocs: number }>>();
const getAllTickets = vi.fn(() => Promise.resolve(page(3)));
let periodDays = 7;

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// A backend without POST /threads/board and /tickets/counts: one request per tile, as these tests read.
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads, getThreadBoard: () => Promise.resolve(null) },
}));
vi.mock('@/features/statistics/services/sla.service', () => ({
  slaService: {
    getSummary: () =>
      Promise.resolve({ messages: { avgResponseTime: 42, avgResponsePeriodDays: periodDays } }),
  },
}));
vi.mock('@/features/tickets/services/ticket.service', () => ({
  ticketService: { getAll: getAllTickets },
  fetchTicketViewCounts: () => Promise.resolve(null),
}));
vi.mock('@/features/kb/services/kb.service', () => ({
  kbService: {
    getAll: () => Promise.resolve({ success: true, data: { pagination: { total: '12' } } }),
  },
}));
vi.mock('@/features/kb/services/documentation.service', () => ({
  documentationService: { getStats },
}));
vi.mock('@/features/dashboard/services/ingestion.service', () => ({ ingestionService: {} }));
vi.mock('@/services/integrations.service', () => ({ integrationsService: {} }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'ctx' }));
vi.mock('@/hooks/useEmailProcessing', () => ({ useEmailProcessing: () => ({}) }));
vi.mock('@/features/dashboard/hooks/useSystemHealth', () => ({ useSystemHealth: () => ({}) }));
vi.mock('@/features/dashboard/hooks/useTelegramProcessing', () => ({
  useTelegramProcessing: () => ({}),
}));
vi.mock('@/features/messages/stores/messagesStore', () => ({ useMessagesStore: () => ({}) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
  }),
}));

const { DashboardPage } = await import('../DashboardPage');

const tile = () =>
  screen.getByText('Avg Response Time').closest('[class*="border-l-4"]') as HTMLElement;

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

describe('Avg Response Time tile', () => {
  it.each([
    [7, '/statistics?days=7#performance'],
    // The summary can report a 1-day window the Statistics picker has no button for.
    [1, '/statistics?days=30#performance'],
  ])('a %s-day figure opens Statistics → Performance at %s', async (days, path) => {
    periodDays = days;
    render(<DashboardPage />);
    await waitFor(() => expect(tile()).toHaveTextContent('42'));
    fireEvent.click(tile());
    expect(navigate).toHaveBeenCalledWith(path);
  });
});
