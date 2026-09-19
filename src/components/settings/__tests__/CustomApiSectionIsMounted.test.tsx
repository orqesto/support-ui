/**
 * CA-5 Task 2: the Custom APIs section is REACHABLE.
 *
 * ⛔ THIS IS THE TEST THE PHASE EXISTS FOR. `CustomApiSettings` shipped in Task 1 and nothing
 * rendered it — the component's own suite was green while an admin still had no screen. A
 * component test cannot see that; only mounting the real Integrations tab can.
 *
 * Driven through the REAL role → permission map (usePermissions + types/roles), like the rules-tab
 * suite, so a role losing MANAGE_INTEGRATIONS turns this red rather than passing on a mock.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({
    tabs,
    children,
  }: {
    tabs: Array<{ id: string; label: string }>;
    children: React.ReactNode;
  }) => (
    <div>
      <nav>
        {tabs.map((tab) => (
          <span key={tab.id} data-testid={`service-tab-${tab.id}`}>
            {tab.label}
          </span>
        ))}
      </nav>
      {children}
    </div>
  ),
}));

// The sibling sections are not under test; each pulls its own network stack.
vi.mock('@/components/settings/MessageSourcesSettings', () => ({
  MessageSourcesSettings: () => <div />,
}));
vi.mock('@/components/settings/TicketAutomationSettings', () => ({
  TicketAutomationSettings: () => <div />,
}));
vi.mock('@/components/settings/AIProvidersSettings', () => ({
  AIProvidersSettings: () => <div />,
}));
vi.mock('@/components/settings/ChatWidgetSettings', () => ({ ChatWidgetSettings: () => <div /> }));
vi.mock('@/components/settings/providers/DatabaseConfigCard', () => ({
  DatabaseConfigCard: () => <div />,
}));
vi.mock('@/components/settings/providers/ObjectStorageConfigCard', () => ({
  ObjectStorageConfigCard: () => <div />,
}));

// ⛔ The custom-API section is NOT mocked — it is the thing under test. Only its network call is.
vi.mock('@/services/customApi.service', () => ({
  customApiService: {
    list: () => Promise.resolve([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { ConnectedServicesSettings } from '@/components/settings/ConnectedServicesSettings';

const renderAs = (organizationRole: string, section?: string) => {
  mockUser = { id: 1, role: 'user', organizationRole };
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <ConnectedServicesSettings section={section} />
    </MemoryRouter>
  );
};

describe('Settings › Integrations › Custom APIs', () => {
  afterEach(cleanup);

  it('is a tab an org admin can see', () => {
    renderAs('org_admin');
    // ⛔ RED: leave the section out of `ConnectedServicesSettings` — the state CA-5 Task 1 shipped
    // in — and this is null, which is the whole defect: working code, no screen.
    expect(screen.getByTestId('service-tab-custom-apis')).toBeTruthy();
  });

  it('a moderator sees it too — they own the LOOKUPS (D40)', () => {
    renderAs('moderator');
    expect(screen.getByTestId('service-tab-custom-apis')).toBeTruthy();
  });

  it('a support agent never sees it — configuration is not their surface (D28)', () => {
    renderAs('support');
    // POSITIVE CONTROL: they still get the sections everyone gets, so this is the gate refusing
    // the tab and not the component failing to render at all.
    expect(screen.getByTestId('service-tab-message-sources')).toBeTruthy();
    expect(screen.queryByTestId('service-tab-custom-apis')).toBeNull();
  });

  it('deep-links straight to it, and renders the real section', async () => {
    renderAs('org_admin', 'custom-apis');
    await waitFor(() => expect(screen.getByText('Your systems')).toBeTruthy());
    // D40: an org_admin may add a vendor. `getAllBy`, because an empty list offers the action
    // twice on purpose — in the header and in the empty state that explains what this is for.
    expect(screen.getAllByRole('button', { name: 'Connect a system' }).length).toBeGreaterThan(0);
  });

  it('⛔ a moderator reaches the section but is offered NO way to add a vendor (D40)', async () => {
    renderAs('moderator', 'custom-apis');
    await waitFor(() => expect(screen.getByText('Your systems')).toBeTruthy());
    // ⛔ RED: pass `canManageVendors={canManageIntegrations}` instead of `isOrgAdmin` and a
    // department-scoped moderator is offered a form whose save is a 403 — a screen that lies
    // about what it can do. The backend refuses either way; this is about not asking.
    expect(screen.queryAllByRole('button', { name: 'Connect a system' })).toHaveLength(0);
  });
});
