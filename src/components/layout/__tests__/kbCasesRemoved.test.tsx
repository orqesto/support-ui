/**
 * KB Cases is removed (KB engine Stage 1, F1): no sidebar item for anyone, even a moderator with the
 * old `ui.kb_cases` flag on or a global admin previewing; the old link lands on the Questions view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let flagVisible = false;
let canManageKb = true;
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: (key: string) => key === 'ui.kb_cases' && flagVisible,
    isPreviewing: () => false,
    loading: false,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm !== 'manage_knowledge_base' || canManageKb,
    isOrgAdmin: false,
    orgRole: 'member',
    isAllianceAdmin: false,
  }),
}));
const nothing = () => null;
vi.mock('@/hooks/useEmailProcessing', () => ({
  useEmailProcessing: () => ({ sessions: new Map(), removeSession: vi.fn() }),
}));
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
const { kbSubRoutes } = await import('@/pages/kbConsolidationRoutes');

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Layout>
        <p>page</p>
      </Layout>
    </MemoryRouter>
  );

const kbCasesLinks = () => screen.queryAllByRole('link', { name: /KB Cases/ });

beforeEach(() => {
  flagVisible = false;
  canManageKb = true;
});
afterEach(cleanup);

describe('KB Cases is removed', () => {
  it('sidebar has no KB Cases item', () => {
    flagVisible = true;
    canManageKb = true;
    renderLayout();
    expect(kbCasesLinks()).toHaveLength(0);
    expect(document.querySelector('a[href="/knowledge-base/cases"]')).toBeNull();
  });

  it('/knowledge-base/cases redirects to the questions view', () => {
    const Where = () => {
      const location = useLocation();
      return <p data-testid="where">{location.pathname + location.search}</p>;
    };
    render(
      <MemoryRouter initialEntries={['/knowledge-base/cases']}>
        <Routes>
          {kbSubRoutes((page) => page)}
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/knowledge-base?view=questions');
  });
});
