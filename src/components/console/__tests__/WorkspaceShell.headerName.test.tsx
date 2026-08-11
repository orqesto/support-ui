import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { organizationService } from '@/services/organization.service';

/**
 * #4: the WorkspaceShell header must resolve the workspace name via `getCurrent`
 * (org-context, VIEW_MESSAGES) — NOT `getById` (global-admin only), which 403s for
 * an alliance_admin and left them with the generic "Manage workspace" title. Guarded
 * on the returned id so a not-yet-settled org context never shows a wrong name.
 */

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getCurrent: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { setSelectedOrganization: () => void }) => unknown) =>
    selector({ setSelectedOrganization: vi.fn() }),
}));

vi.mock('@/stores/scopeStore', () => ({
  useScopeStore: (selector: (s: { clearScope: () => void }) => unknown) =>
    selector({ clearScope: vi.fn() }),
}));

const getCurrent = vi.mocked(organizationService.getCurrent);
const getById = vi.mocked(organizationService.getById);

// Only id/name matter to the header; cast a partial to the full Organization shape.
type Org = Awaited<ReturnType<typeof organizationService.getCurrent>>;
const org = (id: number, name: string) => ({ id, name }) as unknown as Org;

const { WorkspaceShell } = await import('../WorkspaceShell');

const renderAt = (orgId: string) =>
  render(
    <MemoryRouter initialEntries={[`/console/workspace/${orgId}`]}>
      <Routes>
        <Route path="/console/workspace/:orgId" element={<WorkspaceShell />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  getCurrent.mockReset();
  getById.mockReset();
});
afterEach(cleanup);

describe('WorkspaceShell — header name (#4)', () => {
  it('resolves the name via getCurrent (never getById) and renders it', async () => {
    getCurrent.mockResolvedValue(org(42, 'Acme Ops'));
    renderAt('42');

    expect(await screen.findByText('Acme Ops')).toBeInTheDocument();
    expect(getCurrent).toHaveBeenCalledTimes(1);
    expect(getById).not.toHaveBeenCalled();
  });

  it('ignores a mismatched org (stale context) and keeps the generic title', async () => {
    getCurrent.mockResolvedValue(org(999, 'Wrong Workspace'));
    renderAt('42');

    await waitFor(() => expect(getCurrent).toHaveBeenCalled());
    expect(screen.queryByText('Wrong Workspace')).not.toBeInTheDocument();
  });
});
