/**
 * The dashboard reads its thread tiles in ONE board request (counts only) and its ticket tiles in
 * ONE `/tickets/counts` request, where it sent ten thread searches and three ticket lists: 40
 * requests per open on a 130,000-thread workspace (staging, 2026-10-29). A count the server could
 * not answer stays unknown, and a failed request does not fall back to the thirteen it replaced.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const getThreads = vi.fn(() => Promise.reject(new Error('the dashboard must not search per tile')));
const getAllTickets = vi.fn(() =>
  Promise.reject(new Error('the dashboard must not list tickets per tile'))
);
const getThreadBoard = vi.fn();
const fetchTicketViewCounts = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads, getThreadBoard } }));
vi.mock('@/services/sla.service', () => ({
  slaService: { getSummary: () => Promise.resolve(null) },
}));
vi.mock('@/services/ticket.service', () => ({
  ticketService: { getAll: getAllTickets },
  fetchTicketViewCounts,
}));
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getAll: () => Promise.resolve({ success: true, data: { pagination: { total: '12' } } }),
  },
}));
vi.mock('@/services/documentation.service', () => ({
  documentationService: { getStats: () => Promise.resolve({ totalDocs: 5 }) },
}));
vi.mock('@/services/ingestion.service', () => ({ ingestionService: {} }));
vi.mock('@/services/integrations.service', () => ({ integrationsService: {} }));
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
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
  }),
}));

const { DashboardPage } = await import('../DashboardPage');

const tile = (label: string) => screen.getByText(label).closest('[class*="border-l-4"]');
const counted = (total: number) => ({
  pagination: { total, page: 1, limit: 1, totalPages: total },
  scope: null,
});

afterEach(cleanup);

describe('the dashboard counts in two requests', () => {
  beforeEach(() => {
    getThreads.mockClear();
    getAllTickets.mockClear();
    getThreadBoard
      .mockReset()
      .mockImplementation((request: { counts: Array<{ id: string }>; columns: unknown[] }) =>
        Promise.resolve({
          columns: {},
          counts: Object.fromEntries(
            request.counts.map(({ id }) => [id, id === 'suspicious' ? null : counted(7)])
          ),
        })
      );
    fetchTicketViewCounts.mockReset().mockResolvedValue({ open: 3, inProgress: 2, pending: null });
  });

  it('one board request for every thread tile, one ticket-counts request, no per-tile reads', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(tile('SLA Breach')).toHaveTextContent('7'));
    expect(screen.getByText('Open').parentElement).toHaveTextContent('3');
    expect(getThreadBoard).toHaveBeenCalledTimes(1);
    const [request] = getThreadBoard.mock.calls[0] as [
      { columns: unknown[]; counts: Array<{ id: string; filters: Record<string, string> }> },
    ];
    // Counts only, no rows; the ten tiles' filters, unchanged.
    expect(request.columns).toEqual([]);
    expect(request.counts).toHaveLength(10);
    expect(request.counts).toContainEqual({
      id: 'slaBreach',
      filters: { view: 'work_queue', slaBreached: 'true' },
    });
    expect(fetchTicketViewCounts).toHaveBeenCalledTimes(1);
    expect(fetchTicketViewCounts).toHaveBeenCalledWith([
      { id: 'open', filters: { status: 'open' } },
      { id: 'inProgress', filters: { status: 'in_progress' } },
      { id: 'pending', filters: { status: 'pending' } },
    ]);
    // CONTROL: nothing went the per-tile way.
    expect(getThreads).not.toHaveBeenCalled();
    expect(getAllTickets).not.toHaveBeenCalled();
  });

  it('a count the server could not answer stays unknown, not 0', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(tile('SLA Breach')).toHaveTextContent('7'));
    const suspicious = screen.getByText('Suspicious').closest('button');
    expect(suspicious).toHaveTextContent('—');
    expect(suspicious).not.toHaveTextContent('0');
  });

  it('a failed board request leaves the thread tiles unknown and sends no per-tile searches', async () => {
    getThreadBoard.mockRejectedValue(new Error('server error'));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('Open').parentElement).toHaveTextContent('3'));
    expect(tile('SLA Breach')).toHaveTextContent('—');
    expect(getThreads).not.toHaveBeenCalled();
  });
});
