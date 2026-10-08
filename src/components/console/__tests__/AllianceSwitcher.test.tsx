/**
 * The alliance switcher in the Alliance console's top bar: a static badge for one alliance, a
 * Select for several. Choosing one navigates inside the SPA; an id in the URL that is not one of
 * the admin's alliances is never shown as if it were (AdminShell renders the unauthorized state).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { chooseOption, listOptions } from '@/test/chooseOption';

const navigate = vi.fn<(to: string) => void>();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useNavigate: () => navigate,
}));
let alliances: Array<{ id: number; name: string; orgCount: number }> = [];
vi.mock('@/hooks/useAllianceAdmin', () => ({
  useMyAlliances: () => ({ data: alliances, isLoading: false }),
}));

import { AllianceSwitcher } from '@/components/console/AllianceSwitcher';

const renderAt = (allianceId: number) =>
  render(
    <MemoryRouter initialEntries={[`/console/alliance/${allianceId}`]}>
      <Routes>
        <Route path="/console/alliance/:allianceId" element={<AllianceSwitcher />} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe('AllianceSwitcher', () => {
  it('shows the current alliance and navigates to the one chosen', async () => {
    alliances = [
      { id: 1, name: 'North', orgCount: 1 },
      { id: 2, name: 'South', orgCount: 3 },
    ];
    renderAt(1);
    const control = screen.getByRole('combobox', { name: 'Alliance' });
    // The control shows the name alone, as the old button did; the count is in the menu.
    expect(control.closest('.select__control')?.textContent).toBe('North');
    expect(await listOptions(control)).toEqual(['North — 1 workspace', 'South — 3 workspaces']);
    await chooseOption(control, 'South — 3 workspaces');
    expect(navigate).toHaveBeenCalledWith('/console/alliance/2');
  });

  it('does not label an id outside the list as the current alliance', () => {
    alliances = [
      { id: 1, name: 'North', orgCount: 1 },
      { id: 2, name: 'South', orgCount: 3 },
    ];
    renderAt(9);
    expect(screen.getByText('Select alliance')).toBeInTheDocument();
    expect(screen.queryByText(/North/)).toBeNull();
  });

  it('is a static badge, not a picker, for a single alliance', () => {
    alliances = [{ id: 1, name: 'North', orgCount: 2 }];
    renderAt(1);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('North — 2 workspaces')).toBeInTheDocument();
  });
});
