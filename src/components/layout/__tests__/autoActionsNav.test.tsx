/**
 * "Automatic actions" left the sidebar (owner decision 2026-10-22): it is a section of
 * Settings › AI, reached from the Knowledge Base page's button. The sidebar neither lists it nor
 * asks the backend whether its routes exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: () => false,
    isPreviewing: () => false,
    loading: false,
  }),
}));
const perms = { manageKb: true };
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) =>
      permission === 'manage_knowledge_base' ? perms.manageKb : true,
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
const overviewCall = vi.hoisted(() => ({ getOverview: vi.fn() }));
vi.mock('@/services/kbAutoActions.service', () => ({ kbAutoActionsService: overviewCall }));
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
const { resetAutoActionsAvailability } = await import('@/hooks/useAutoActionsAvailable');

afterEach(cleanup);
beforeEach(() => {
  perms.manageKb = true;
  resetAutoActionsAvailability();
  overviewCall.getOverview.mockReset();
  overviewCall.getOverview.mockResolvedValue({});
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

describe('Automatic actions is not in the sidebar (it lives in Settings › AI)', () => {
  it('a KB manager on a backend with the routes sees no sidebar item, and the sidebar does not probe', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: /Knowledge Base/ })).toBeInTheDocument();
    // Let any availability probe settle before asserting the item is absent.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryAllByRole('link', { name: /Automatic actions/ })).toHaveLength(0);
    expect(
      screen
        .queryAllByRole('link')
        .filter((link) => (link.getAttribute('href') ?? '').includes('automatic'))
    ).toHaveLength(0);
    expect(overviewCall.getOverview).not.toHaveBeenCalled();
  });
});
