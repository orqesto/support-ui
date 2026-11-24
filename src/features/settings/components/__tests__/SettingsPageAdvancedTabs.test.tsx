import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup , act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type MockUser = {
  id: number;
  email: string;
  role: string;
  organizationRole?: string;
  firstName: string;
  lastName: string;
  position: string | null;
  createdAt: string;
} | null;

let mockUser: MockUser = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: MockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs }: { tabs: Array<{ id: string; label: string }> }) => (
    <nav data-testid="settings-tabs">
      {tabs.map((tab) => (
        <button key={tab.id} data-testid={`tab-${tab.id}`}>
          {tab.label}
        </button>
      ))}
    </nav>
  ),
}));

// Mock the sub-components so importing SettingsPage stays cheap.
vi.mock('@/features/settings/components/ProfileSettings', () => ({ ProfileSettings: () => <div /> }));
vi.mock('@/features/settings/components/NotificationPreferencesSettings', () => ({ NotificationPreferencesSettings: () => <div /> }));
vi.mock('@/features/settings/components/OrganizationSettings', () => ({ OrganizationSettings: () => <div /> }));
vi.mock('@/features/settings/components/AIConfigSettings', () => ({ AIConfigSettings: () => <div /> }));
vi.mock('@/features/settings/components/ConnectedServicesSettings', () => ({ ConnectedServicesSettings: () => <div /> }));
vi.mock('@/features/settings/components/RulesSettings', () => ({ RulesSettings: () => <div /> }));
vi.mock('@/features/settings/components/SystemSettings', () => ({ SystemSettings: () => <div data-testid="system-content" /> }));
vi.mock('@/features/settings/components/SSOConfigSettings', () => ({ SSOConfigSettings: () => <div /> }));
vi.mock('@/features/settings/components/SCIMConfigSettings', () => ({ SCIMConfigSettings: () => <div /> }));
vi.mock('@/features/settings/components/SlackNotificationsSettings', () => ({ SlackNotificationsSettings: () => <div /> }));

import { useAdvancedStore } from '@/features/settings/advanced';
import { SettingsPage } from '@/pages/SettingsPage';

const renderAt = (hash = '/settings') =>
  render(
    <MemoryRouter initialEntries={[hash]}>
      <SettingsPage />
    </MemoryRouter>
  );

const asWorkspaceAdmin = () => {
  mockUser = {
    id: 21,
    email: 'admin@example.com',
    role: 'user',
    organizationRole: 'org_admin',
    firstName: 'A',
    lastName: 'B',
    position: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
};

describe('Settings top tabs: SSO and SCIM behind "Show advanced settings"', () => {
  beforeEach(() => {
    useAdvancedStore.setState({ show: null });
    asWorkspaceAdmin();
  });
  afterEach(cleanup);

  it('Advanced off: no SSO or SCIM tab for a workspace admin', () => {
    renderAt();
    expect(screen.queryByTestId('tab-sso')).toBeNull();
    expect(screen.queryByTestId('tab-scim')).toBeNull();
    expect(screen.getByTestId('tab-rules')).toBeInTheDocument();
  });

  it('a link to #sso (or ?tab=scim) still shows that tab', () => {
    renderAt('/settings#sso');
    expect(screen.getByTestId('tab-sso')).toBeInTheDocument();
    cleanup();
    renderAt('/settings?tab=scim');
    expect(screen.getByTestId('tab-scim')).toBeInTheDocument();
  });

  it('switching Advanced on anywhere shows both at once, without a reload', () => {
    renderAt('/settings#rules');
    expect(screen.queryByTestId('tab-sso')).toBeNull();
    act(() => {
      useAdvancedStore.setState({ show: true });
    });
    expect(screen.getByTestId('tab-sso')).toBeInTheDocument();
    expect(screen.getByTestId('tab-scim')).toBeInTheDocument();
  });
});
