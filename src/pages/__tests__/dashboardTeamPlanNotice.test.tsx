import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let teamPlan: unknown;
let viewer: { role: string; organizationRole: string } | null = null;
let billing = true;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: viewer && { id: 1, ...viewer }, selectedOrganizationId: 1 }),
}));
let flagOn = true;
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({ isSurfaceEnabled: (key: string) => flagOn && key === 'ui.team_builder' }),
}));
let workspaceAdmin = true;
vi.mock('@/hooks/useIsWorkspaceAdmin', () => ({ useIsWorkspaceAdmin: () => workspaceAdmin }));
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { billingEnabled: billing } }),
}));
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

const admin = { role: 'user', organizationRole: 'org_admin' };
const OVER = { activeTeams: 3, teamLimit: 2, overLimit: true };

describe('Dashboard team plan notice', () => {
  beforeEach(() => {
    viewer = admin;
    flagOn = true;
    workspaceAdmin = true;
    billing = true;
    teamPlan = OVER;
  });

  it('admin with billing: the text, the Upgrade link and the Teams link', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('team-plan-notice')).toHaveTextContent(
      'Your plan allows 2 teams; 3 are on. Upgrade or switch some off.'
    );
    expect(screen.getByRole('link', { name: 'Upgrade plan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage teams' })).toBeInTheDocument();
  });
  it('flag OFF: nothing, even for an admin', () => {
    flagOn = false;
    render(<DashboardPage />);
    expect(screen.queryByTestId('team-plan-notice')).toBeNull();
  });
  it('not an admin of THIS workspace (e.g. admin of another): nothing', () => {
    workspaceAdmin = false;
    render(<DashboardPage />);
    expect(screen.queryByTestId('team-plan-notice')).toBeNull();
  });
  it('global admin sees it too', () => {
    viewer = { role: 'admin', organizationRole: 'member' };
    render(<DashboardPage />);
    expect(screen.getByTestId('team-plan-notice')).toBeInTheDocument();
  });
  it('admin without billing: the notice, no Upgrade link', () => {
    billing = false;
    render(<DashboardPage />);
    expect(screen.getByTestId('team-plan-notice')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upgrade plan' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage teams' })).toBeInTheDocument();
  });
  it('a non-admin member sees no notice', () => {
    viewer = { role: 'user', organizationRole: 'member' };
    workspaceAdmin = false;
    render(<DashboardPage />);
    expect(screen.queryByTestId('team-plan-notice')).toBeNull();
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
