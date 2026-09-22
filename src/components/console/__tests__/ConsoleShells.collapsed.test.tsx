import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { useSidebarStore } from '@/stores/sidebarStore';

/**
 * Collapsed sidebar in the console shells: the rail keeps every destination
 * reachable by name (aria-label) while no label text is rendered, and expanded
 * mode is unchanged.
 */

vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: vi.fn(() => new Promise(() => {})), getById: vi.fn() },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { setSelectedOrganization: () => void }) => unknown) =>
    selector({ setSelectedOrganization: vi.fn() }),
}));
vi.mock('@/stores/scopeStore', () => ({
  useScopeStore: (selector: (s: { setScope: () => void; clearScope: () => void }) => unknown) =>
    selector({ setScope: vi.fn(), clearScope: vi.fn() }),
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/useAllianceAdmin', () => ({
  useMyAlliances: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('../AllianceSwitcher', () => ({ AllianceSwitcher: () => null }));

const { AdminShell } = await import('../AdminShell');
const { WorkspaceShell } = await import('../WorkspaceShell');

const renderPlatform = () =>
  render(
    <MemoryRouter initialEntries={['/console/platform']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/console/platform/*" element={<AdminShell scope="platform" />} />
      </Routes>
    </MemoryRouter>
  );
const renderWorkspace = () =>
  render(
    <MemoryRouter initialEntries={['/console/workspace/42']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/console/workspace/:orgId/*" element={<WorkspaceShell />} />
      </Routes>
    </MemoryRouter>
  );

const nav = () => within(screen.getByRole('navigation'));

beforeEach(() => useSidebarStore.setState({ collapsed: false }));
afterEach(cleanup);

describe('console shells — collapsed sidebar', () => {
  it('AdminShell expanded: labels and title rendered, no aria-label override', () => {
    renderPlatform();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    const back = nav().getByRole('link', { name: 'Back to app' });
    expect(back).toHaveTextContent('Back to app');
    expect(back.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('AdminShell collapsed: no label text, every link still named', () => {
    useSidebarStore.setState({ collapsed: true });
    renderPlatform();
    expect(screen.queryByText('Platform Admin')).not.toBeInTheDocument();
    const links = nav().getAllByRole('link');
    expect(links.length).toBeGreaterThan(2);
    for (const link of links) {
      expect(link.textContent).toBe('');
      expect(link.getAttribute('aria-label')).toBeTruthy();
    }
    expect(nav().getByRole('link', { name: 'Back to app' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('WorkspaceShell collapsed: no label text, links named', () => {
    useSidebarStore.setState({ collapsed: true });
    renderWorkspace();
    for (const name of ['Back to app', 'Users', 'Workspace', 'Departments']) {
      const link = nav().getByRole('link', { name });
      expect(link.textContent).toBe('');
    }
  });

  it('WorkspaceShell expanded: labels visible', () => {
    renderWorkspace();
    expect(nav().getByRole('link', { name: 'Departments' })).toHaveTextContent('Departments');
  });
});
