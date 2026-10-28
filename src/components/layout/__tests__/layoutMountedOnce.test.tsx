/**
 * The app shell mounts ONCE. Every authenticated page sits under one layout route
 * (`AppShellRoute`), so clicking from one page to another keeps <Layout> mounted: its data
 * hooks (learning, processing summary, SLA, notification centre) do not re-run their fetches
 * and the socket does not leave and rejoin the workspace room on every click.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

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
const { AppShellRoute } = await import('../AppShellRoute');
const { useAuthStore } = await import('@/stores/authStore');

afterEach(cleanup);
beforeEach(() => {
  shellMounts.count = 0;
  joinOrganizationRoom.mockClear();
  leaveOrganizationRoom.mockClear();
  useAuthStore.setState({
    user: { id: 9, email: 'm@x.y', role: 'user', organizationId: 1 } as never,
    isAuthenticated: true,
    selectedOrganizationId: 2,
  });
});

const ThreadsPage = () => (
  <div>
    <h1>Threads page</h1>
    <Link to="/tickets">to tickets</Link>
  </div>
);
// Like DashboardPage until its own <Layout> wrapper is removed: a page that still wraps itself.
const TicketsPage = () => (
  <Layout>
    <h1>Tickets page</h1>
    <Link to="/threads">to threads</Link>
  </Layout>
);

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/threads']}>
      <Routes>
        <Route element={<AppShellRoute />}>
          <Route path="/threads" element={<ThreadsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('app shell', () => {
  it('stays mounted and in its socket room while the user clicks between pages', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Threads page' });
    expect(shellMounts.count).toBe(1);
    expect(joinOrganizationRoom).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('link', { name: 'to tickets' }));
    await screen.findByRole('heading', { name: 'Tickets page' });
    fireEvent.click(screen.getByRole('link', { name: 'to threads' }));
    await screen.findByRole('heading', { name: 'Threads page' });

    expect(shellMounts.count).toBe(1);
    expect(joinOrganizationRoom).toHaveBeenCalledTimes(1);
    expect(leaveOrganizationRoom).not.toHaveBeenCalled();
  });

  it('a page that still wraps itself in <Layout> gets no second shell', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('link', { name: 'to tickets' }));
    await screen.findByRole('heading', { name: 'Tickets page' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
