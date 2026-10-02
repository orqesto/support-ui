/**
 * FE audit 2026-09-29, D-H1: the dashboard ran 17 requests in one `Promise.all` with no per-call
 * catch. `/api/documentation/stats` needs VIEW_AI_SETTINGS, so for every support and associate
 * user that one 403 rejected the whole batch, and the page showed every tile as 0 — stamped
 * "updated just now". The numbers were false, not missing.
 *
 * Now each request settles on its own: a failed one leaves ITS tile unknown (a dash), the others
 * true; and a role that may not read the documentation stats is not asked for them at all.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const page = (total: number) => ({
  success: true,
  data: [],
  pagination: { total, page: 1, limit: 1, totalPages: 1 },
});
const getThreads = vi.fn(() => Promise.resolve(page(7)));
const getStats = vi.fn<() => Promise<{ totalDocs: number }>>();
const getAllTickets = vi.fn(() => Promise.resolve(page(3)));
let canReadAiSettings = true;

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads } }));
vi.mock('@/services/sla.service', () => ({
  slaService: { getSummary: () => Promise.resolve(null) },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll: getAllTickets } }));
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getAll: () => Promise.resolve({ success: true, data: { pagination: { total: '12' } } }),
  },
}));
vi.mock('@/services/documentation.service', () => ({
  documentationService: { getStats },
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
    hasPermission: (permission: string) =>
      permission === 'view_ai_settings' ? canReadAiSettings : true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
  }),
}));

const { DashboardPage } = await import('../DashboardPage');

const slaBreachTile = () => screen.getByText('SLA Breach').closest('[class*="border-l-4"]');

afterEach(cleanup);

describe('one forbidden request does not blank the dashboard', () => {
  beforeEach(() => {
    getThreads.mockClear();
    getStats.mockReset();
    canReadAiSettings = true;
  });

  it('the documentation stats answering 403 leaves every other tile true and its own unknown', async () => {
    getStats.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    render(<DashboardPage />);
    await waitFor(() => expect(getStats).toHaveBeenCalled());
    // The SLA breach tile shows the 7 its own request answered, not 0.
    await waitFor(() => expect(slaBreachTile()).toHaveTextContent('7'));
    expect(slaBreachTile()).not.toHaveTextContent('0');
    // The documentation tile says it does not know.
    const docs = screen.getByText('Documentation').closest('[class*="border-l-4"]');
    expect(docs).toHaveTextContent('—');
    expect(docs).not.toHaveTextContent('0');
    // Tickets came through on their own too.
    expect(screen.getByText('Open').parentElement).toHaveTextContent('3');
  });

  it('CONTROL: with the documentation stats answering, the tile shows the number', async () => {
    getStats.mockResolvedValue({ totalDocs: 5 });
    render(<DashboardPage />);
    const docs = await screen.findByText('Documentation');
    await waitFor(() => expect(docs.closest('[class*="border-l-4"]')).toHaveTextContent('5'));
  });

  it('a role without VIEW_AI_SETTINGS is not asked for the documentation stats, and sees a dash', async () => {
    canReadAiSettings = false;
    getStats.mockResolvedValue({ totalDocs: 5 });
    render(<DashboardPage />);
    await waitFor(() => expect(slaBreachTile()).toHaveTextContent('7'));
    expect(getStats).not.toHaveBeenCalled();
    expect(screen.getByText('Documentation').closest('[class*="border-l-4"]')).toHaveTextContent(
      '—'
    );
  });

  it('a message count that fails on its own reads as unknown in the status rows, not as 0', async () => {
    getStats.mockResolvedValue({ totalDocs: 5 });
    getThreads.mockImplementation((filters?: Record<string, unknown>) =>
      filters && (filters as { view?: string }).view === 'suspicious'
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve(page(7))
    );
    render(<DashboardPage />);
    await waitFor(() => expect(slaBreachTile()).toHaveTextContent('7'));
    const suspicious = screen.getByText('Suspicious').closest('button');
    expect(suspicious).toHaveTextContent('—');
    expect(suspicious).not.toHaveTextContent('0');
    // The row total says what it is: a sum of the KNOWN counts.
    expect(screen.getByText(/known$/)).toBeInTheDocument();
  });
});
