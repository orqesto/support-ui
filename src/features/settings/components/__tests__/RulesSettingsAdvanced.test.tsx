/**
 * Settings simplification (2026-11-23): Spam, Detection, KB Detection and Routing rules sit behind
 * "Show advanced settings". Priority rules and Reply templates stay visible (customers change them).
 * A link into a hidden section still opens it; switching Advanced off moves off a hidden section.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser }) => unknown) => selector({ user: mockUser })),
}));
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab, children }: { tabs: Array<{ id: string; label: string }>; activeTab: string; children: React.ReactNode }) => (
    <div>
      <nav>
        {tabs.map((tab) => (
          <span key={tab.id} data-testid={`rule-tab-${tab.id}`} data-active={tab.id === activeTab}>
            {tab.label}
          </span>
        ))}
      </nav>
      {children}
    </div>
  ),
}));
vi.mock('@/features/settings/components/SpamRulesSettings', () => ({ SpamRulesSettings: () => <div data-testid="spam-content" /> }));
vi.mock('@/features/settings/components/DetectionRulesSettings', () => ({ DetectionRulesSettings: () => <div data-testid="detection-content" /> }));
vi.mock('@/features/settings/components/KnowledgeDetectionRulesSettings', () => ({ KnowledgeDetectionRulesSettings: () => <div /> }));
vi.mock('@/features/settings/components/RoutingRulesSettings', () => ({ RoutingRulesSettings: () => <div data-testid="routing-content" /> }));
vi.mock('@/features/settings/components/PriorityRulesSettings', () => ({ PriorityRulesSettings: () => <div data-testid="priority-content" /> }));
vi.mock('@/features/settings/components/ReplyTemplatesSettings', () => ({ ReplyTemplatesSettings: () => <div data-testid="templates-content" /> }));

import { useAdvancedStore } from '@/features/settings/advanced';
import { RulesSettings } from '@/features/settings/components/RulesSettings';

const Hash = () => <span data-testid="hash">{useLocation().hash}</span>;

const renderAs = (organizationRole: string, section?: string) => {
  mockUser = { id: 7, role: 'user', organizationRole };
  return render(
    <MemoryRouter>
      <RulesSettings section={section} />
      <Hash />
    </MemoryRouter>
  );
};

const tabIds = () =>
  screen.queryAllByTestId(/^rule-tab-/).map((tab) => tab.getAttribute('data-testid')?.replace('rule-tab-', ''));

describe('Settings › Rules with "Show advanced settings"', () => {
  beforeEach(() => {
    useAdvancedStore.setState({ show: null });
  });
  afterEach(cleanup);

  it('Advanced off: only Priority rules and Reply templates; it opens on Priority, not on the hidden Spam', () => {
    renderAs('org_admin');
    expect(tabIds()).toEqual(['priority', 'templates']);
    expect(screen.getByTestId('priority-content')).toBeVisible();
    expect(screen.getByTestId('rule-tab-priority')).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId('spam-content')).toBeNull();
  });

  it('a link into a hidden section still opens it (#rules/detection)', () => {
    renderAs('org_admin', 'detection');
    expect(screen.getByTestId('detection-content')).toBeVisible();
    expect(screen.getByTestId('rule-tab-detection')).toHaveAttribute('data-active', 'true');
  });

  it('Advanced on: every section is back', () => {
    renderAs('org_admin');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(tabIds()).toEqual(['spam', 'detection', 'knowledge', 'routing', 'priority', 'templates']);
  });

  it('switching Advanced off on Spam moves to Priority and rewrites the link', () => {
    useAdvancedStore.setState({ show: true });
    renderAs('org_admin', 'spam');
    expect(screen.getByTestId('spam-content')).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('priority-content')).toBeVisible();
    expect(screen.getByTestId('hash')).toHaveTextContent('#rules/priority');
  });
});
