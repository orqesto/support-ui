/**
 * Settings simplification (2026-11-23): in Integrations, AI Providers, Object Storage, Database and
 * Custom APIs sit behind "Show advanced settings". Links from banners and copy still open them:
 * #integrations/database (database banner), #integrations/ai-providers (starter allowance, SLA
 * breach item), #integrations/custom-apis (lookup paths).
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser }) => unknown) => selector({ user: mockUser })),
}));
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab }: { tabs: Array<{ id: string; label: string }>; activeTab: string }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.id} data-testid={`int-tab-${tab.id}`} data-active={tab.id === activeTab}>
          {tab.label}
        </span>
      ))}
    </nav>
  ),
}));

import { useAdvancedStore } from '@/features/settings/advanced';
import { ConnectedServicesSettings } from '@/features/settings/components/ConnectedServicesSettings';

const Hash = () => <span data-testid="hash">{useLocation().hash}</span>;
const FromHash = () => {
  const hash = useLocation().hash;
  return (
    <ConnectedServicesSettings section={hash.startsWith('#integrations/') ? hash.slice(14) : undefined} />
  );
};
const renderAdmin = (section?: string) => {
  mockUser = { id: 12, role: 'user', organizationRole: 'org_admin' };
  return render(
    <MemoryRouter initialEntries={[section ? `/settings#integrations/${section}` : '/settings']}>
      <FromHash />
      <Hash />
    </MemoryRouter>
  );
};

describe('Settings › Integrations with "Show advanced settings"', () => {
  beforeEach(() => {
    useAdvancedStore.setState({ show: null });
  });
  afterEach(cleanup);

  it('Advanced off: mail, tickets, chat widgets and import; no AI providers, storage, database, custom APIs', () => {
    renderAdmin();
    for (const id of ['ai-providers', 'object-storage', 'database', 'custom-apis'])
      expect(screen.queryByTestId(`int-tab-${id}`)).toBeNull();
    expect(screen.getByTestId('int-tab-message-sources')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('int-tab-chat-widgets')).toBeInTheDocument();
  });

  it.each(['database', 'ai-providers', 'custom-apis'])('the link #integrations/%s still opens it', (id) => {
    renderAdmin(id);
    expect(screen.getByTestId(`int-tab-${id}`)).toHaveAttribute('data-active', 'true');
  });

  it('switching Advanced off on Database moves to Message Sources and the tab goes', () => {
    useAdvancedStore.setState({ show: true });
    renderAdmin('database');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('hash')).toHaveTextContent('#integrations/message-sources');
    expect(screen.queryByTestId('int-tab-database')).toBeNull();
  });
});
