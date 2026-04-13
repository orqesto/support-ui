import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock authStore before importing the page
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: { id: number; email: string; role: string } | null }) => unknown) =>
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

// Mock all settings sub-components
vi.mock('@/components/settings/ProfileSettings', () => ({
  ProfileSettings: () => <div data-testid="profile-settings">Profile Settings</div>,
}));

vi.mock('@/components/settings/NotificationPreferencesSettings', () => ({
  NotificationPreferencesSettings: () => (
    <div data-testid="notification-settings">Notification Settings</div>
  ),
}));

vi.mock('@/components/settings/OrganizationSettings', () => ({
  OrganizationSettings: () => (
    <div data-testid="organization-settings">Organization Settings</div>
  ),
}));

vi.mock('@/components/settings/AIConfigSettings', () => ({
  AIConfigSettings: () => <div data-testid="ai-settings">AI Settings</div>,
}));

vi.mock('@/components/settings/ConnectedServicesSettings', () => ({
  ConnectedServicesSettings: () => (
    <div data-testid="integrations-settings">Connected Services</div>
  ),
}));

vi.mock('@/components/settings/RulesSettings', () => ({
  RulesSettings: () => <div data-testid="rules-settings">Rules Settings</div>,
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
});
