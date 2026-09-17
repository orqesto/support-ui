/**
 * Owner, 2026-09-17: moderators can view and edit routing and priority rules. The tabs were hidden
 * from them because the gate was MANAGE_ORGANIZATION (workspace admin only). Driven through the
 * REAL role → permission map (usePermissions + types/roles), so a role losing the permission, or
 * the gate going back to MANAGE_ORGANIZATION, turns this red.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser }) => unknown) => selector({ user: mockUser })),
}));

vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, children }: { tabs: Array<{ id: string; label: string }>; children: React.ReactNode }) => (
    <div>
      <nav>
        {tabs.map((tab) => (
          <span key={tab.id} data-testid={`rule-tab-${tab.id}`}>
            {tab.label}
          </span>
        ))}
      </nav>
      {children}
    </div>
  ),
}));
vi.mock('@/components/settings/SpamRulesSettings', () => ({ SpamRulesSettings: () => <div /> }));
vi.mock('@/components/settings/DetectionRulesSettings', () => ({ DetectionRulesSettings: () => <div /> }));
vi.mock('@/components/settings/KnowledgeDetectionRulesSettings', () => ({ KnowledgeDetectionRulesSettings: () => <div /> }));
vi.mock('@/components/settings/RoutingRulesSettings', () => ({ RoutingRulesSettings: () => <div data-testid="routing-content" /> }));
vi.mock('@/components/settings/PriorityRulesSettings', () => ({ PriorityRulesSettings: () => <div data-testid="priority-content" /> }));

import { RulesSettings } from '@/components/settings/RulesSettings';

const renderAs = (organizationRole: string, section?: string) => {
  mockUser = { id: 1, role: 'user', organizationRole };
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <RulesSettings section={section} />
    </MemoryRouter>
  );
};

describe('Settings › Rules — routing and priority tabs by role', () => {
  afterEach(cleanup);

  it('a moderator sees the Routing and Priority tabs', () => {
    renderAs('moderator');
    expect(screen.getByTestId('rule-tab-routing')).toBeInTheDocument();
    expect(screen.getByTestId('rule-tab-priority')).toBeInTheDocument();
  });

  it('a moderator deep-linked to #rules/routing lands on routing, not spam', () => {
    renderAs('moderator', 'routing');
    expect(screen.getByTestId('routing-content')).toBeInTheDocument();
  });

  it('CONTROL — a workspace admin sees them too', () => {
    renderAs('org_admin');
    expect(screen.getByTestId('rule-tab-priority')).toBeInTheDocument();
  });

  it('support still does not — the backend would refuse every request', () => {
    renderAs('support');
    expect(screen.queryByTestId('rule-tab-routing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rule-tab-priority')).not.toBeInTheDocument();
  });
});
