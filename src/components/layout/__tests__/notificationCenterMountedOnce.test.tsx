/**
 * ONE notification centre. The sidebar copy serves wide screens and the header copy narrow ones;
 * both used to mount (one hidden by CSS), so every alert hook in it ran — and refetched on every
 * notification event — twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: () => false,
    isPreviewing: () => false,
    loading: false,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    isOrgAdmin: false,
    orgRole: 'member',
    isAllianceAdmin: false,
  }),
}));
const nothing = () => null;
vi.mock('@/hooks/useEmailProcessing', () => ({
  useEmailProcessing: () => ({ sessions: new Map(), removeSession: vi.fn() }),
}));
// With a workspace selected the summary would fetch for real (jsdom XHR, unhandled teardown).
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
const joinOrganizationRoom = vi.fn();
const leaveOrganizationRoom = vi.fn();
vi.mock('@/lib/socketManager', () => ({
  joinOrganizationRoom: (id: number) => {
    joinOrganizationRoom(id);
  },
  leaveOrganizationRoom: (id: number) => {
    leaveOrganizationRoom(id);
  },
}));
vi.mock('@/components/layout/OrganizationSwitcher', () => ({ OrganizationSwitcher: nothing }));
vi.mock('@/components/layout/WorkspaceBanner', () => ({ WorkspaceBanner: nothing }));
vi.mock('@/components/layout/DepartmentSwitcher', () => ({ DepartmentSwitcher: nothing }));
vi.mock('@/components/layout/VersionStatus', () => ({ VersionStatus: nothing }));
vi.mock('@/components/layout/ThemeToggle', () => ({ ThemeToggle: nothing }));
const bells = vi.hoisted(() => ({ mounted: 0 }));
vi.mock('@/components/layout/NotificationCenter', async () => {
  const { useEffect } = await import('react');
  return {
    NotificationCenter: () => {
      useEffect(() => {
        bells.mounted += 1;
      }, []);
      return null;
    },
  };
});
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
const screenWidth = vi.hoisted(() => ({ desktop: true }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => screenWidth.desktop }));
// The shell's mount counter: useSidebarShell runs once per <Layout> shell, so an effect in it
// fires once per MOUNT (not per render).
const shellMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/layout/SidebarNav', async (importOriginal) => {
  const { useEffect } = await import('react');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useSidebarShell: () => {
      useEffect(() => {
        shellMounts.count += 1;
      }, []);
    },
  };
});
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (selector: (state: unknown) => unknown) =>
    selector({ status: 'complete', fetchOnce: vi.fn() }),
}));

const { Layout } = await import('../Layout');
const { useAuthStore } = await import('@/stores/authStore');

afterEach(cleanup);
beforeEach(() => {
  bells.mounted = 0;
  useAuthStore.setState({
    user: { id: 9, email: 'm@x.y', role: 'user', organizationId: 1 } as never,
    isAuthenticated: true,
    selectedOrganizationId: 2,
  });
});

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/threads']}>
      <Routes>
        <Route
          path="/threads"
          element={
            <Layout>
              <h1>Threads page</h1>
            </Layout>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('the notification centre mounts once', () => {
  it('on a wide screen', async () => {
    screenWidth.desktop = true;
    renderShell();
    await screen.findByRole('heading', { name: 'Threads page' });
    expect(bells.mounted).toBe(1);
  });

  it('on a narrow screen', async () => {
    screenWidth.desktop = false;
    renderShell();
    await screen.findByRole('heading', { name: 'Threads page' });
    expect(bells.mounted).toBe(1);
  });
});
