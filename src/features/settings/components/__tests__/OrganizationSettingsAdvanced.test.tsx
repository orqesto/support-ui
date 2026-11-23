/**
 * Settings simplification (2026-11-23): in the Workspace tab, Routing Skills, Open Threads and
 * Automated email subjects sit behind "Show advanced settings"; a link still opens them.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser; selectedOrganizationId: number }) => unknown) =>
    selector({ user: mockUser, selectedOrganizationId: 3 })
  ),
}));
vi.mock('@/features/settings/services/notificationRoleDefaultsShared', () => ({
  loadRoleDefaults: vi.fn(() => Promise.resolve({ roles: [] })),
}));
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab }: { tabs: Array<{ id: string; label: string }>; activeTab: string }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.id} data-testid={`org-tab-${tab.id}`} data-active={tab.id === activeTab}>
          {tab.label}
        </span>
      ))}
    </nav>
  ),
}));

import { useAdvancedStore } from '@/features/settings/advanced';
import { OrganizationSettings } from '@/features/settings/components/OrganizationSettings';

const Hash = () => <span data-testid="hash">{useLocation().hash}</span>;
const renderAdmin = (section?: string) => {
  mockUser = { id: 9, role: 'user', organizationRole: 'org_admin' };
  return render(
    <MemoryRouter>
      <OrganizationSettings section={section} />
      <Hash />
    </MemoryRouter>
  );
};
const tabIds = () =>
  screen.queryAllByTestId(/^org-tab-/).map((tab) => tab.getAttribute('data-testid')?.replace('org-tab-', ''));

describe('Settings › Workspace with "Show advanced settings"', () => {
  beforeEach(() => {
    useAdvancedStore.setState({ show: null });
  });
  afterEach(cleanup);

  it('Advanced off: the 8 business sections, no engine ones', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByTestId('org-tab-notification-roles')).toBeInTheDocument());
    expect(tabIds()).toEqual([
      'details',
      'categories',
      'labels',
      'sla-config',
      'business-hours',
      'security',
      'ai-usage',
      'notification-roles',
    ]);
  });

  it('a link into a hidden section still opens it (#organization/open-conversations)', () => {
    renderAdmin('open-conversations');
    expect(screen.getByTestId('org-tab-open-conversations')).toHaveAttribute('data-active', 'true');
  });

  it('switching Advanced off on Routing Skills moves to Details and rewrites the link', () => {
    useAdvancedStore.setState({ show: true });
    renderAdmin('routing-skills');
    expect(screen.getByTestId('org-tab-routing-skills')).toHaveAttribute('data-active', 'true');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('org-tab-details')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('hash')).toHaveTextContent('#organization/details');
  });

  it('switching Advanced off on Categories (still shown) keeps you there', () => {
    useAdvancedStore.setState({ show: true });
    renderAdmin('categories');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('org-tab-categories')).toHaveAttribute('data-active', 'true');
    // Not moved: no navigation happens (this harness starts with no hash).
    expect(screen.getByTestId('hash')).not.toHaveTextContent('#organization/details');
  });
});
