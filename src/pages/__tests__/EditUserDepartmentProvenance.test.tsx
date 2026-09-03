/**
 * A workspace admin manages departments — but only the layer that is theirs.
 *
 * The dual-source model (Role-Model v2) splits `user_departments` into 'provisioned' rows
 * the identity provider owns and 'manual' rows a human owns. The alliance/SCIM reconcile
 * clears and relinks ONLY the provisioned half, so:
 *
 *   · an admin's ADDITIONS survive every sync, and
 *   · an admin cannot durably REMOVE a directory grant — the next reconcile restores it.
 *
 * The old screen expressed none of that. It locked the whole field on a guess
 * (`isScimManaged && orgHasDeptMapping`, where the mapping came from a SCIM-only endpoint
 * that never saw an alliance group's department mapping), which was wrong in both
 * directions: it blocked additions that would have worked, and left the field editable for
 * alliance-managed members, whose every save then wiped the provenance of all their rows.
 *
 * ⛔ THE TRAP THIS FILE EXISTS FOR: directory departments render as CHECKED. The payload is
 * a full replacement set for the manual layer, and the server CLAIMS anything requested as
 * 'manual'. So if the page posted `selectedDepartmentIds` unfiltered, an ordinary save would
 * convert every IdP-granted department to human-owned — reintroducing the exact wipe from the
 * client that was just fixed on the server. The payload tests below are the ones that matter.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type * as ReactRouterDom from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { EditUserPage } from '@/pages/EditUserPage';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const DEPT_DIRECTORY = 1;
const DEPT_MANUAL = 2;
const DEPT_SPARE = 3;

type FetchedUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  position: string | null;
  role: 'user';
  organizationRole: 'support';
  organizationId: number;
  departmentIds: number[];
  provisionedDepartmentIds?: number[];
  permissionOverrides: Record<string, never>;
  scimManaged: boolean;
};

const baseUser: FetchedUser = {
  id: 7,
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  position: null,
  role: 'user',
  organizationRole: 'support',
  organizationId: 3,
  departmentIds: [DEPT_DIRECTORY, DEPT_MANUAL],
  provisionedDepartmentIds: [DEPT_DIRECTORY],
  permissionOverrides: {},
  scimManaged: true,
};

let fetchedUser: FetchedUser = baseUser;
const updateSpy = vi.fn();

vi.mock('@/services/user.service', () => ({
  userService: {
    getById: () => Promise.resolve(fetchedUser),
    getAll: () => Promise.resolve({ data: [], pagination: {} }),
    update: (...args: unknown[]) => {
      updateSpy(...args);
      return Promise.resolve();
    },
    getSkillValues: () => Promise.resolve({}),
    getCanEditSkills: () => Promise.resolve(false),
    setSkillValues: () => Promise.resolve(),
    setCanEditSkills: () => Promise.resolve(),
  },
}));

vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: () =>
      Promise.resolve([
        { id: DEPT_DIRECTORY, name: 'Directory Dept', slug: 'directory', active: true },
        { id: DEPT_MANUAL, name: 'Manual Dept', slug: 'manual', active: true },
        { id: DEPT_SPARE, name: 'Spare Dept', slug: 'spare', active: true },
      ]),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () => Promise.resolve({ data: [] }),
    getRoutingKeys: () => Promise.resolve([]),
    removeMember: () => Promise.resolve(),
    addMember: () => Promise.resolve(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({ user: { id: 1 } }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: false, canManageUsers: true }),
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

const renderPage = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/users/7/edit']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/users/:id/edit" element={<EditUserPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

/** The checkbox belonging to a department, found via its visible label text. */
const checkboxFor = (name: string): HTMLInputElement => {
  const label = screen.getByText(name).closest('label');
  if (!label) throw new Error(`no label around "${name}"`);
  const input = label.querySelector('input[type="checkbox"]');
  if (!input) throw new Error(`no checkbox inside the label for "${name}"`);
  return input as HTMLInputElement;
};

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(updateSpy).toHaveBeenCalled());
  return updateSpy.mock.calls[0][1] as Record<string, unknown>;
};

/**
 * Wait until the fetched member has been SEEDED into the form — not merely rendered.
 *
 * ⛔ This is the root of a CI-only flake that hit three unrelated PRs (#321, #322, #327).
 * `loadUser` sets `user` and `loading=false` in one batch, so the form (and every
 * department checkbox, all UNCHECKED) can be in the DOM before the `[user]` effect that
 * seeds `selectedDepartmentIds` has run. Under CI load a `fireEvent.click` (or a name
 * change) landing in that gap is silently wiped by the seed. `findByText('Spare Dept')`
 * only proves the render; 'Manual Dept' being CHECKED proves the seed, because nothing but
 * the seed checks it. An earlier fix (#324) waited for the click to stick, which merely
 * turned the wipe into a timeout — the click was already gone.
 */
const seeded = async () => {
  await screen.findByText('Manual Dept');
  await waitFor(() => expect(checkboxFor('Manual Dept').checked).toBe(true));
};

/** Click a department checkbox after the seed has landed, and wait for the click to stick. */
const toggleDept = async (label: string, expected: boolean) => {
  await seeded();
  fireEvent.click(checkboxFor(label));
  await waitFor(() => expect(checkboxFor(label).checked).toBe(expected));
};

beforeEach(() => {
  fetchedUser = { ...baseUser };
  navigateSpy.mockReset();
  updateSpy.mockReset();
});
afterEach(cleanup);

describe('department provenance in the member editor', () => {
  it('locks a directory-granted department and says where it came from', async () => {
    renderPage();
    await seeded();

    expect(checkboxFor('Directory Dept').checked).toBe(true);
    expect(checkboxFor('Directory Dept').disabled).toBe(true);
    expect(screen.getByText('from directory')).toBeInTheDocument();
  });

  /**
   * CONTROL. The lock is per department, not a return of the old whole-field lock — which
   * is the regression a careless reading of "IdP-managed member" would reintroduce. This
   * member IS `scimManaged: true`, and their non-directory departments must still be theirs
   * to change.
   */
  it('leaves the rest of the field editable for the same IdP-managed member', async () => {
    renderPage();
    await seeded();

    expect(checkboxFor('Manual Dept').disabled).toBe(false);
    expect(checkboxFor('Spare Dept').disabled).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS. Adding a department must post the manual layer ALONE. Posting the
   * directory's department too would have the server claim it as 'manual' and detach it from
   * the IdP for good.
   */
  it('never posts a directory-granted department, even though it renders checked', async () => {
    renderPage();
    await seeded();

    await toggleDept('Spare Dept', true);
    const payload = await save();

    expect(payload.departmentIds).toEqual([DEPT_MANUAL, DEPT_SPARE]);
    expect(payload.departmentIds).not.toContain(DEPT_DIRECTORY);
  });

  /**
   * An untouched form must send nothing at all. The directory's departments sit in
   * `selectedDepartmentIds`, so a naive changed-check would compare a filtered list against
   * an unfiltered one, see a difference on every load, and post a department set on every
   * save of an unrelated field.
   */
  it('sends no departmentIds when the departments were not touched', async () => {
    renderPage();
    await seeded();

    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Adalovelace' } });
    const payload = await save();

    expect(payload.firstName).toBe('Adalovelace');
    expect(payload.departmentIds).toBeUndefined();
  });

  it('removing a manual department posts the narrowed manual set', async () => {
    renderPage();
    await seeded();

    await toggleDept('Manual Dept', false);
    const payload = await save();

    expect(payload.departmentIds).toEqual([]);
  });

  /**
   * FE/BE SKEW. `provisionedDepartmentIds` ships with a backend release this bundle cannot
   * assume. Against an older API the field is absent, and the page must degrade to "nothing
   * is from the directory" rather than crash or lock everything.
   *
   * ⚠️ This is a graceful-degradation test, NOT a statement that the pair is safe to deploy
   * in either order. It is not: against an old backend the save path still wipes provenance
   * server-side, so the BE must be released first.
   */
  it('degrades to an unlocked field when the backend does not send provenance', async () => {
    fetchedUser = { ...baseUser, provisionedDepartmentIds: undefined };
    renderPage();
    await seeded();

    expect(checkboxFor('Directory Dept').disabled).toBe(false);
    expect(screen.queryByText('from directory')).not.toBeInTheDocument();
  });
});
