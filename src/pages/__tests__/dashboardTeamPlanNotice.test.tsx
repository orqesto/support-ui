import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let teamPlan: unknown;
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ teamPlan }) }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreads: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } }),
    getThreadBoard: () => Promise.resolve(null),
  },
}));
vi.mock('@/features/statistics/services/sla.service', () => ({
  slaService: { getSummary: () => Promise.resolve({ messages: {} }) },
}));
vi.mock('@/features/tickets/services/ticket.service', () => ({
  ticketService: {
    getAll: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } }),
  },
  fetchTicketViewCounts: () => Promise.resolve(null),
}));
vi.mock('@/features/kb/services/kb.service', () => ({
  kbService: {
    getAll: () => Promise.resolve({ success: true, data: { pagination: { total: '0' } } }),
  },
}));
vi.mock('@/features/kb/services/documentation.service', () => ({
  documentationService: { getStats: () => Promise.resolve({ totalDocs: 0 }) },
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
afterEach(cleanup);

describe('Dashboard team plan notice', () => {
  it('shows with the Teams link when over the limit', () => {
    teamPlan = { activeTeams: 3, teamLimit: 2, overLimit: true };
    render(<DashboardPage />);
    expect(screen.getByTestId('team-plan-notice')).toHaveTextContent(
      'Your plan allows 2 teams; 3 are on. Upgrade or switch some off.'
    );
    expect(screen.getByRole('link', { name: 'Manage teams' })).toBeInTheDocument();
  });
  it.each([[undefined], [null], [{ activeTeams: 1, teamLimit: 1, overLimit: false }]])(
    'nothing for %j',
    (plan) => {
      teamPlan = plan;
      render(<DashboardPage />);
      expect(screen.queryByTestId('team-plan-notice')).toBeNull();
    }
  );
});
