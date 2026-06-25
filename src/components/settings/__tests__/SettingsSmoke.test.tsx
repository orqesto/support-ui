import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock authStore before importing the page
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: { id: number; email: string; role: string; firstName: string; lastName: string; position: string | null; createdAt: string } | null }) => unknown) =>
    selector({
      user: {
        id: 1,
        email: 'admin@example.com',
        role: 'user',
        firstName: 'Test',
        lastName: 'User',
        position: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    })
  ),
}));

// Mock Layout to avoid sidebar/nav complexity
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

// Mock Tabs to render a simplified nav
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({
    tabs,
    children,
  }: {
    tabs: Array<{ id: string; label: string }>;
    activeTab: string;
    onTabChange: (id: string) => void;
    children?: React.ReactNode;
    variant?: string;
    size?: string;
    fullWidth?: boolean;
  }) => (
    <div>
      <nav data-testid="settings-tabs">
        {tabs.map((tab) => (
          <button key={tab.id} data-testid={`tab-${tab.id}`}>
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  ),
}));

// Mock all settings sub-components. Mocks for the deep-link-aware components
// expose the `section` prop on the rendered test id so we can assert that
// `SettingsPage` parses the hash correctly and passes the section down.
vi.mock('@/components/settings/ProfileSettings', () => ({
  ProfileSettings: () => <div data-testid="profile-settings">Profile Settings</div>,
}));

vi.mock('@/components/settings/NotificationPreferencesSettings', () => ({
  NotificationPreferencesSettings: () => (
    <div data-testid="notification-settings">Notification Settings</div>
  ),
}));

vi.mock('@/components/settings/OrganizationSettings', () => ({
  OrganizationSettings: ({ section }: { section?: string }) => (
    <div data-testid="organization-settings" data-section={section ?? ''}>
      Organization Settings
    </div>
  ),
}));

vi.mock('@/components/settings/AIConfigSettings', () => ({
  AIConfigSettings: ({ section }: { section?: string }) => (
    <div data-testid="ai-settings" data-section={section ?? ''}>
      AI Settings
    </div>
  ),
}));

vi.mock('@/components/settings/ConnectedServicesSettings', () => ({
  ConnectedServicesSettings: ({ section }: { section?: string }) => (
    <div data-testid="integrations-settings" data-section={section ?? ''}>
      Connected Services
    </div>
  ),
}));

vi.mock('@/components/settings/RulesSettings', () => ({
  RulesSettings: ({ section }: { section?: string }) => (
    <div data-testid="rules-settings" data-section={section ?? ''}>
      Rules Settings
    </div>
  ),
}));

vi.mock('@/components/settings/SystemManagementSettings', () => ({
  SystemManagementSettings: () => (
    <div data-testid="system-settings">System Management</div>
  ),
}));

import { SettingsPage } from '@/pages/SettingsPage';

describe('SettingsSmoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the settings page without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('layout')).toBeTruthy();
  });

  it('renders the settings title', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders the settings tabs navigation', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('settings-tabs')).toBeTruthy();
  });

  it('renders the Profile tab', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('tab-profile')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('renders expected tab labels', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    // Non-admin user sees 5 tabs (no System tab)
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Organization')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText('Integrations')).toBeTruthy();
    expect(screen.getByText('Rules')).toBeTruthy();
  });

  it('does not render System tab for non-admin user', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('tab-system')).toBeNull();
  });

  // Deep-link parsing — added 2026-06-25 with the `#<tab>/<section>` rollout.

  it('deep-links to a sub-section via #<tab>/<section>', () => {
    render(
      <MemoryRouter initialEntries={['/settings#ai/learning']}>
        <SettingsPage />
      </MemoryRouter>
    );
    const aiSettings = screen.getByTestId('ai-settings');
    expect(aiSettings.getAttribute('data-section')).toBe('learning');
  });

  it('passes empty section when hash has no sub-section', () => {
    render(
      <MemoryRouter initialEntries={['/settings#rules']}>
        <SettingsPage />
      </MemoryRouter>
    );
    const rulesSettings = screen.getByTestId('rules-settings');
    expect(rulesSettings.getAttribute('data-section')).toBe('');
  });

  it('strips ?query inside the hash before passing section down', () => {
    render(
      <MemoryRouter initialEntries={['/settings#ai/learning?focus=42']}>
        <SettingsPage />
      </MemoryRouter>
    );
    const aiSettings = screen.getByTestId('ai-settings');
    expect(aiSettings.getAttribute('data-section')).toBe('learning');
  });

  it('falls back to the default tab when the top-level id is unknown', () => {
    render(
      <MemoryRouter initialEntries={['/settings#bogus/whatever']}>
        <SettingsPage />
      </MemoryRouter>
    );
    // Unknown tab id → DEFAULT_TAB_ID (profile). Profile has no sub-section
    // routing, so no data-section assertion — just verify the profile content
    // renders rather than a sub-tabbed page.
    expect(screen.getByTestId('profile-settings')).toBeTruthy();
  });
});
