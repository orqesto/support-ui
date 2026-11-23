/**
 * Settings simplification (2026-11-23): in the AI tab, Lead Qualification, Automatic actions and
 * Learning Trust sit behind "Show advanced settings"; a link still opens them.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

let mockUser: { id: number; role: string; organizationRole?: string } | null = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: typeof mockUser }) => unknown) => selector({ user: mockUser })),
}));
vi.mock('@/features/kb', () => ({
  ConfluenceCatalogSection: () => null,
  KbAutoActionsPanel: () => null,
  useAutoActionsAvailable: () => true,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(() => Promise.resolve({ data: { data: { plan: { features: {} } } } })) },
}));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('../AiDraftsSettings', () => ({ AiDraftsSettings: () => null }));
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab }: { tabs: Array<{ id: string; label: string }>; activeTab: string }) => (
    <nav>
      {tabs.map((tab) => (
        <span key={tab.id} data-testid={`ai-tab-${tab.id}`} data-active={tab.id === activeTab}>
          {tab.label}
        </span>
      ))}
    </nav>
  ),
}));

import { useAdvancedStore } from '@/features/settings/advanced';
import { AUTO_ACTIONS_HREF } from '@/features/kb/shell';
import { AIConfigSettings } from '@/features/settings/components/AIConfigSettings';

const Hash = () => <span data-testid="hash">{useLocation().hash}</span>;
/** As SettingsPage does: the section comes from the URL hash (#ai/<section>). */
const FromHash = () => {
  const hash = useLocation().hash;
  return <AIConfigSettings section={hash.startsWith('#ai/') ? hash.slice(4) : undefined} />;
};
const renderAdmin = (section?: string) => {
  mockUser = { id: 11, role: 'user', organizationRole: 'org_admin' };
  return render(
    <MemoryRouter initialEntries={[section ? `/settings#ai/${section}` : '/settings']}>
      <FromHash />
      <Hash />
    </MemoryRouter>
  );
};

describe('Settings › AI with "Show advanced settings"', () => {
  beforeEach(() => {
    useAdvancedStore.setState({ show: null });
  });
  afterEach(cleanup);

  it('Advanced off: no Lead Qualification, Automatic actions or Learning Trust', () => {
    renderAdmin();
    for (const id of ['lead-qualification', 'automatic-actions', 'learning-trust'])
      expect(screen.queryByTestId(`ai-tab-${id}`)).toBeNull();
    expect(screen.getByTestId('ai-tab-prompts')).toBeInTheDocument();
    expect(screen.getByTestId('ai-tab-auto-reply')).toBeInTheDocument();
  });

  it('links into hidden sections still open them (#ai/learning-trust, #ai/automatic-actions)', () => {
    renderAdmin('learning-trust');
    expect(screen.getByTestId('ai-tab-learning-trust')).toHaveAttribute('data-active', 'true');
    cleanup();
    renderAdmin('automatic-actions');
    expect(screen.getByTestId('ai-tab-automatic-actions')).toHaveAttribute('data-active', 'true');
  });

  it('switching Advanced off on Learning Trust moves off it and rewrites the link', () => {
    useAdvancedStore.setState({ show: true });
    renderAdmin('learning-trust');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('hash').textContent).toMatch(/^#ai\/(prompts|auto-reply)$/);
    expect(screen.queryByTestId('ai-tab-learning-trust')).toBeNull();
  });

  it('the automatic-actions link (its exported path) opens it with Advanced off', () => {
    renderAdmin(AUTO_ACTIONS_HREF.split('#ai/')[1]);
    expect(screen.getByTestId('ai-tab-automatic-actions')).toHaveAttribute('data-active', 'true');
  });

  it('switching Advanced off on Auto-reply (still shown) keeps you there', () => {
    useAdvancedStore.setState({ show: true });
    renderAdmin('auto-reply');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('ai-tab-auto-reply')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('hash')).toHaveTextContent('#ai/auto-reply');
  });
});
