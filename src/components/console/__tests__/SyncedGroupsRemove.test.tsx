/**
 * Removing a synced IdP group from the console.
 *
 * Reported as: a group assigned by mistake sits on this card with no way to delete it.
 * There genuinely was none — the only destructive control was Unwire, which removes the
 * MAPPING, and an unwired group has no mapping, so nothing was clickable at all.
 *
 * ⛔ The assertion that matters most is the negative one: a WIRED group must not offer
 * Remove. That group grants access, and dropping it here would withdraw it with nothing
 * on screen saying so. Unwire is the reversible step that explains itself; the backend
 * refuses the wired case with a 409 as well, so this is defence in depth, not the only
 * guard.
 *
 * ⚠️ Also pinned: the confirm text tells the admin this does NOT reach the identity
 * provider. If the IdP still has the group in scope it comes back on the next push, and
 * an admin who was not told reads that as a removal that failed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SyncedGroupsCard } from '@/components/console/SyncedGroupsCard';
import type { SyncedGroup } from '@/services/alliance-scim.service';

const syncedGroups: SyncedGroup[] = [];
const removeMutate = vi.fn();

vi.mock('@/hooks/useAllianceProvisioning', () => ({
  useAllianceSyncedGroups: () => ({ data: syncedGroups, isLoading: false }),
  useWireSyncedGroup: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ usersReconciled: 0 }),
    isPending: false,
  }),
  useResyncAllianceProvisioning: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllianceGroupMap: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSyncedGroup: () => ({ mutate: removeMutate, isPending: false }),
}));

vi.mock('@/hooks/useAllianceGroups', () => ({
  useAllianceGroups: () => ({ data: [{ id: 9, name: 'Support EU' }], refetch: vi.fn() }),
  useOrgDepartments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceOrgs: () => ({
    data: [{ id: 3, name: 'Acme', slug: 'acme', active: true }],
    isLoading: false,
  }),
}));

const baseGroup = (overrides: Partial<SyncedGroup> = {}): SyncedGroup => ({
  id: 41,
  externalId: '6a9682552edf7f000181510f',
  displayName: 'SSO - Atlassian - Confluence - Admin - ODL-MPO',
  memberCount: 1,
  members: [{ userId: 7, name: 'Dwain', email: 'dwain@example.test' }],
  wiredGroup: null,
  wiredRole: null,
  suggestion: null,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const renderCard = () =>
  render(
    <ThemeProvider>
      <SyncedGroupsCard allianceId={1} />
    </ThemeProvider>
  );

beforeEach(() => {
  cleanup();
  syncedGroups.length = 0;
  removeMutate.mockClear();
});

describe('SyncedGroupsCard — removing a group', () => {
  it('offers Remove on an unwired group — the reported case', () => {
    syncedGroups.push(baseGroup());
    renderCard();
    expect(screen.getByRole('button', { name: /remove SSO - Atlassian/i })).toBeInTheDocument();
  });

  it('does NOT offer Remove on a wired group', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 5, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();
    expect(screen.queryByRole('button', { name: /^remove/i })).not.toBeInTheDocument();
  });

  it('does NOT offer Remove on a group wired only to a legacy alliance role', () => {
    syncedGroups.push(baseGroup({ wiredRole: { mappingId: 2, mappedRole: 'alliance_admin' } }));
    renderCard();
    expect(screen.queryByRole('button', { name: /^remove/i })).not.toBeInTheDocument();
  });

  it('warns that the IdP can push the group back, then removes it by id', () => {
    syncedGroups.push(baseGroup());
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /remove SSO - Atlassian/i }));

    // The honest half: nothing here reaches the provider.
    expect(screen.getByText(/does not change your identity provider/i)).toBeInTheDocument();
    expect(screen.getByText(/nobody loses access/i)).toBeInTheDocument();
    // Not removed until the admin confirms.
    expect(removeMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(removeMutate).toHaveBeenCalledWith(41);
  });
});
