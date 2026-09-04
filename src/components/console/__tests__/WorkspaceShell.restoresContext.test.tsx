/**
 * The console's WorkspaceShell BORROWS `selectedOrganizationId` — it must give it back.
 *
 * It repoints the persisted org context at `:orgId` on mount so the embedded pages' calls
 * carry `X-Organization-Context: <orgId>`. It used to leave it there ("no teardown …
 * harmless"), and `partialize` persists the field, so "Back to app" walked the whole app —
 * every list, every write — into the workspace the admin had merely been looking at, and
 * a reload kept it there. Audit u37 P0-3 / u39 P0-3.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  type State = {
    user: { id: number; role: string } | null;
    selectedOrganizationId: number | null;
    setSelectedOrganization: (organizationId: number) => void;
  };
  const useAuthStore = create<State>((set) => ({
    user: { id: 1, role: 'admin' },
    selectedOrganizationId: 7,
    setSelectedOrganization: (organizationId) => set({ selectedOrganizationId: organizationId }),
  }));
  return { useAuthStore };
});
// Stable, like the real store's action — a fresh function per render would re-run the
// shell's repoint effect on every render and test the mock rather than the shell.
const scopeState = { clearScope: () => {} };
vi.mock('@/stores/scopeStore', () => ({
  useScopeStore: (selector: (state: { clearScope: () => void }) => unknown) =>
    selector(scopeState),
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => new Promise(() => {}) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { WorkspaceShell } = await import('../WorkspaceShell');
const { useAuthStore } = await import('@/stores/authStore');

const selected = () => useAuthStore.getState().selectedOrganizationId;

const renderAt = (orgId: string) =>
  render(
    <MemoryRouter initialEntries={[`/console/workspace/${orgId}`]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/console/workspace/:orgId" element={<WorkspaceShell />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 7 });
});
afterEach(cleanup);

describe('WorkspaceShell — the org context is borrowed, not moved', () => {
  it('points the context at the viewed workspace while mounted', () => {
    renderAt('42');
    expect(selected()).toBe(42);
  });

  it('THE FIX: restores the previously selected workspace on unmount', () => {
    const view = renderAt('42');
    expect(selected()).toBe(42);
    view.unmount();
    // "Back to app" must land the admin where they came from, not on the tenant they
    // were inspecting.
    expect(selected()).toBe(7);
  });

  it('restores the ORIGINAL context after moving between workspaces inside the shell', () => {
    // A child route with a link to another workspace, rendered through the shell's Outlet.
    const Jump = () => <Link to="/console/workspace/43">next workspace</Link>;
    const view = render(
      <MemoryRouter initialEntries={['/console/workspace/42']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/console/workspace/:orgId" element={<WorkspaceShell />}>
            <Route index element={<Jump />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(selected()).toBe(42);
    fireEvent.click(screen.getByText('next workspace'));
    expect(selected()).toBe(43);
    view.unmount();
    // Not 42 — the workspace passed through on the way — but where the admin started.
    expect(selected()).toBe(7);
  });

  it('CONTROL: does not touch a context that was already the viewed workspace', () => {
    useAuthStore.setState({ selectedOrganizationId: 42 });
    const view = renderAt('42');
    view.unmount();
    expect(selected()).toBe(42);
  });

  it('CONTROL: does not resurrect a context that a logout cleared while the shell was open', () => {
    const view = renderAt('42');
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: null });
    });
    view.unmount();
    // Restoring 7 here would hand a signed-out tab a workspace context.
    expect(selected()).toBeNull();
  });
});
