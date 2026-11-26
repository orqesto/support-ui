import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * The Rule library nav entry is behind `ui.rule_library_console`. A global admin (the viewer here)
 * gets NO staff preview: off or absent hides it, on shows it.
 */
let flags: Record<string, boolean> = {};
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    flags,
    loading: false,
    canPreviewUnfinished: true,
    isSurfaceEnabled: (key: string) => flags[key] === true,
    isSurfaceVisibleToMe: () => true,
    isPreviewing: () => false,
  }),
}));
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
const renderPlatform = () =>
  render(
    <MemoryRouter initialEntries={['/console/platform']}>
      <Routes>
        <Route path="/console/platform/*" element={<AdminShell scope="platform" />} />
      </Routes>
    </MemoryRouter>
  );
const nav = () => within(screen.getByRole('navigation'));

afterEach(cleanup);

describe('AdminShell: Rule library nav entry', () => {
  it.each([
    ['off', { 'ui.rule_library_console': false }],
    ['absent', {}],
  ])('is hidden when the flag is %s, other entries stay', (_n, value) => {
    flags = value;
    renderPlatform();
    expect(nav().queryByRole('link', { name: 'Rule library' })).toBeNull();
    expect(nav().getByRole('link', { name: 'Audit' })).toBeInTheDocument();
  });

  it('is shown when the flag is on', () => {
    flags = { 'ui.rule_library_console': true };
    renderPlatform();
    expect(nav().getByRole('link', { name: 'Rule library' })).toBeInTheDocument();
  });
});
