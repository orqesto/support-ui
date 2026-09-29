/**
 * KB consolidation #873 (FE audit L2): the two doors to the Cases report — the sidebar item
 * "KB Cases" and the KB page's "Cases report" button — open only for a knowledge-base moderator,
 * and only while `ui.kb_cases` is visible to them. The FE reaches production on merge, the
 * backend ships on a tag: an ungated door would lead to a page whose API does not exist yet.
 *
 * `isSurfaceVisibleToMe` is true for a GLOBAL admin even with the flag off (staff preview, see
 * useUiFlags) — so staff do see "KB Cases", marked as a preview. That is the flag design, not a
 * leak; this test drives the gate through that same function.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let flagVisible = false;
let preview = false;
let canManageKb = true;
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: (key: string) => key === 'ui.kb_cases' && flagVisible,
    isPreviewing: (key: string) => key === 'ui.kb_cases' && preview,
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
vi.mock('@/hooks/useNotificationCounts', () => ({ useNotificationCounts: () => ({ counts: {} }) }));
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
  preview = false;
  canManageKb = true;
});
afterEach(cleanup);

describe('sidebar "KB Cases" (L2)', () => {
  it('is hidden while ui.kb_cases is not visible to the viewer', () => {
    renderLayout();
    expect(kbCasesLinks()).toHaveLength(0);
  });

  it('is shown to a moderator once the flag is on', () => {
    flagVisible = true;
    renderLayout();
    expect(kbCasesLinks()[0]).toHaveAttribute('href', '/knowledge-base/cases');
  });

  it('is hidden from someone without manage_knowledge_base even with the flag on', () => {
    flagVisible = true;
    canManageKb = false;
    renderLayout();
    expect(kbCasesLinks()).toHaveLength(0);
  });

  it('staff preview (flag off, global admin): shown and marked as not launched', () => {
    flagVisible = true;
    preview = true;
    renderLayout();
    expect(kbCasesLinks()[0]).toHaveTextContent('KB CasesWIP');
  });
});
