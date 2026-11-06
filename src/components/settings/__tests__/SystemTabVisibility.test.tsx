/**
 * Regression: the Settings › System tab (Cleanup / Queue / Nuclear) must be
 * GLOBAL-ADMIN only. The backend locked /api/system/* to global-admin (BE #272),
 * so an org_admin who still saw these buttons would get a 403 on every click.
 * Previously the tab was visible to `isGlobalAdmin || isOrgAdmin`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

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
vi.mock('@/components/settings/ProfileSettings', () => ({ ProfileSettings: () => <div /> }));
vi.mock('@/components/settings/NotificationPreferencesSettings', () => ({ NotificationPreferencesSettings: () => <div /> }));
vi.mock('@/components/settings/OrganizationSettings', () => ({ OrganizationSettings: () => <div /> }));
vi.mock('@/components/settings/AIConfigSettings', () => ({ AIConfigSettings: () => <div /> }));
vi.mock('@/components/settings/ConnectedServicesSettings', () => ({ ConnectedServicesSettings: () => <div /> }));
vi.mock('@/components/settings/RulesSettings', () => ({ RulesSettings: () => <div /> }));
vi.mock('@/components/settings/SystemSettings', () => ({ SystemSettings: () => <div data-testid="system-content" /> }));
vi.mock('@/components/settings/SSOConfigSettings', () => ({ SSOConfigSettings: () => <div /> }));
vi.mock('@/components/settings/SCIMConfigSettings', () => ({ SCIMConfigSettings: () => <div /> }));
vi.mock('@/components/settings/SlackNotificationsSettings', () => ({ SlackNotificationsSettings: () => <div /> }));

import { SettingsPage } from '@/pages/SettingsPage';

const renderAt = (hash = '/settings') =>
  render(
    <MemoryRouter initialEntries={[hash]} future={ROUTER_FUTURE}>
      <SettingsPage />
    </MemoryRouter>
  );

describe('Settings › System tab visibility (global-admin only)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    mockUser = null;
  });

  const base = { id: 1, email: 'a@ex.com', firstName: 'A', lastName: 'B', position: null, createdAt: '2026-01-01T00:00:00Z' };

  it('HIDES the System tab from an org_admin (the regression)', () => {
    mockUser = { ...base, role: 'user', organizationRole: 'org_admin' };
    renderAt();
    expect(screen.queryByTestId('tab-system')).toBeNull();
  });

  it('SHOWS the System tab to a global admin', () => {
    mockUser = { ...base, role: 'admin', organizationRole: 'org_admin' };
    renderAt();
    expect(screen.getByTestId('tab-system')).toBeTruthy();
  });

  it('HIDES the System tab from a plain member', () => {
    mockUser = { ...base, role: 'user' };
    renderAt();
    expect(screen.queryByTestId('tab-system')).toBeNull();
  });
});

describe('Settings › Slack notifications tab visibility (workspace admins and global admins)', () => {
  afterEach(() => {
    cleanup();
    mockUser = null;
  });

  const base = { id: 1, email: 'a@ex.com', firstName: 'A', lastName: 'B', position: null, createdAt: '2026-01-01T00:00:00Z' };

  it('SHOWS the Notifications tab to a workspace admin', () => {
    mockUser = { ...base, role: 'user', organizationRole: 'org_admin' };
    renderAt('/settings?tab=notifications');
    expect(screen.getByTestId('tab-notifications')).toBeTruthy();
    // Named for what it holds, so it is not mistaken for the personal notification preferences.
    expect(screen.getByTestId('tab-notifications')).toHaveTextContent(/^Slack notifications$/);
  });

  it('SHOWS the Notifications tab to a global admin', () => {
    mockUser = { ...base, role: 'admin' };
    renderAt();
    expect(screen.getByTestId('tab-notifications')).toBeTruthy();
  });

  it('HIDES the Notifications tab from a plain member', () => {
    mockUser = { ...base, role: 'user', organizationRole: 'member' };
    renderAt('/settings?tab=notifications');
    expect(screen.queryByTestId('tab-notifications')).toBeNull();
  });
});

// Bug 2026-11-06: only the sidebar link was hidden, so an Associate who opened /settings by URL
// saw every workspace tab. Each workspace tab now needs the permission its reads need; Profile
// (signature, password, notification preferences) stays for every member.
describe('Settings › workspace tabs follow the role in the active workspace', () => {
  afterEach(() => {
    cleanup();
    mockUser = null;
  });

  const base = { id: 1, email: 'a@ex.com', firstName: 'A', lastName: 'B', position: null, createdAt: '2026-01-01T00:00:00Z' };
  const WORKSPACE_TABS = ['organization', 'ai', 'integrations', 'rules'];
  const shownTabs = () =>
    screen.getAllByRole('button').map((button) => button.getAttribute('data-testid')?.replace('tab-', ''));

  it.each(['associate', 'support'])('a %s opening /settings#ai by URL sees Profile only', (role) => {
    mockUser = { ...base, role: 'user', organizationRole: role };
    renderAt('/settings#ai');
    expect(shownTabs()).toEqual(['profile']);
  });

  it('a moderator keeps the workspace tabs (CONTROL: the gate does not hide them from everyone)', () => {
    mockUser = { ...base, role: 'user', organizationRole: 'moderator' };
    renderAt('/settings#ai');
    expect(shownTabs()).toEqual(expect.arrayContaining(['profile', ...WORKSPACE_TABS]));
  });

  it('a global admin keeps the workspace tabs', () => {
    mockUser = { ...base, role: 'admin' };
    renderAt();
    expect(shownTabs()).toEqual(expect.arrayContaining(['profile', ...WORKSPACE_TABS]));
  });
});
