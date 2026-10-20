/**
 * Tickets is in the sidebar for a role that may view tickets even before the workspace has one:
 * it used to stay hidden until the first ticket, and New ticket lives on that page, so a workspace
 * with none could never make one (prod 2026-10-20).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: () => false,
    isPreviewing: () => false,
    loading: false,
  }),
}));
const perms = { viewTickets: true };
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) =>
      permission === 'view_tickets' ? perms.viewTickets : true,
    isOrgAdmin: false,
    orgRole: 'member',
    isAllianceAdmin: false,
  }),
}));
const nothing = () => null;
vi.mock('@/hooks/useEmailProcessing', () => ({
  useEmailProcessing: () => ({ sessions: new Map(), removeSession: vi.fn() }),
}));
vi.mock('@/hooks/useProcessingSummary', () => ({ useProcessingSummary: () => ({ entries: [] }) }));
vi.mock('@/hooks/useAllianceAdmin', () => ({ useMyAlliances: () => ({ data: [] }) }));
vi.mock('@/hooks/useFeatures', () => ({ useFeatures: () => ({ hasFeature: () => true }) }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
  useNotificationCounts: () => ({ counts: {} }),
}));
vi.mock('@/hooks/useTicketsCount', () => ({ useTicketsCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/useSLANotifications', () => ({ useSLANotifications: () => ({}) }));
vi.mock('@/hooks/useLearningNotifications', () => ({ useLearningNotifications: () => ({}) }));
vi.mock('@/lib/socketManager', () => ({
  joinOrganizationRoom: vi.fn(),
  leaveOrganizationRoom: vi.fn(),
}));
vi.mock('@/components/layout/OrganizationSwitcher', () => ({ OrganizationSwitcher: nothing }));
vi.mock('@/components/layout/WorkspaceBanner', () => ({ WorkspaceBanner: nothing }));
vi.mock('@/components/layout/DepartmentSwitcher', () => ({ DepartmentSwitcher: nothing }));
vi.mock('@/components/layout/VersionStatus', () => ({ VersionStatus: nothing }));
vi.mock('@/components/layout/ThemeToggle', () => ({ ThemeToggle: nothing }));
vi.mock('@/components/layout/NotificationCenter', () => ({ NotificationCenter: nothing }));
vi.mock('@/components/layout/DatabaseBanner', () => ({ DatabaseBanner: nothing }));
vi.mock('@/components/layout/LicenseExpiryBanner', () => ({ LicenseExpiryBanner: nothing }));
vi.mock('@/components/layout/ResumeSetupBanner', () => ({ ResumeSetupBanner: nothing }));
vi.mock('@/components/layout/TrialBanner', () => ({ TrialBanner: nothing }));
vi.mock('@/components/layout/MessageCapBanner', () => ({ MessageCapBanner: nothing }));
vi.mock('@/components/subscription/SubscriptionGateOverlay', () => ({
  SubscriptionGateOverlay: nothing,
}));
vi.mock('@/components/shared/WebSocketStatus', () => ({ WebSocketStatus: nothing }));
vi.mock('@/components/shared/WebSocketDebug', () => ({ WebSocketDebug: nothing }));
vi.mock('@/components/messages/MessageProcessingProgress', () => ({
  MessageProcessingProgress: nothing,
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/layout/SidebarNav', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSidebarShell: () => {},
}));
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (selector: (state: unknown) => unknown) =>
    selector({ status: 'complete', fetchOnce: vi.fn() }),
}));

const { Layout } = await import('../Layout');
const { useAuthStore } = await import('@/stores/authStore');

afterEach(cleanup);
beforeEach(() => {
  perms.viewTickets = true;
});

const renderLayout = () => {
  useAuthStore.setState({
    user: { id: 9, email: 'm@x.y', role: 'user', organizationId: 1 } as never,
    isAuthenticated: true,
    selectedOrganizationId: 2,
  });
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Layout>
        <p>page</p>
      </Layout>
    </MemoryRouter>
  );
};

const ticketsLinks = () =>
  screen.queryAllByRole('link').filter((link) => link.getAttribute('href') === '/tickets');

describe('Tickets in the sidebar', () => {
  it('shown with no tickets yet, for a role that may view tickets', () => {
    renderLayout();
    expect(ticketsLinks().length).toBeGreaterThan(0);
  });

  it('CONTROL: not shown to a role that may not view tickets', () => {
    perms.viewTickets = false;
    renderLayout();
    expect(ticketsLinks()).toHaveLength(0);
  });
});
