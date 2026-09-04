/**
 * The IdP wiring, seen from the group editor.
 *
 * A group's membership can come from an identity provider, but the editor used to show
 * one undifferentiated member list with a remove button on every entry — inviting an
 * admin to remove someone the next sync would put straight back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GroupEditor } from '@/components/console/GroupEditor';
import type { AllianceGroup } from '@/services/alliance-groups.service';
import type { AllianceMember } from '@/services/alliance-admin.service';
import { backingGroupName } from '@/components/console/backingGroupName';

const saveMutate = vi.fn();
vi.mock('@/hooks/useAllianceGroups', () => ({
  useSaveGroup: () => ({ mutate: saveMutate, isPending: false }),
  useOrgDepartments: () => ({ data: [], isLoading: false }),
}));

const members: AllianceMember[] = [
  {
    userId: 11,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    allianceRole: 'alliance_agent',
    effectiveRoles: [],
  },
  {
    userId: 22,
    name: 'Bea Manual',
    email: 'bea@example.com',
    allianceRole: 'alliance_agent',
    effectiveRoles: [],
  },
];

const group = (overrides: Partial<AllianceGroup> = {}): AllianceGroup =>
  ({
    id: 5,
    name: 'Support EU',
    description: null,
    orgRole: 'support',
    orgIds: [],
    departmentIdsByOrg: {},
    memberIds: [11, 22],
    memberCount: 2,
    ...overrides,
  }) as AllianceGroup;

const renderEditor = (value: AllianceGroup | null) =>
  render(
    <ThemeProvider>
      <GroupEditor
        open
        onClose={vi.fn()}
        allianceId={1}
        group={value}
        orgs={[]}
        members={members}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  saveMutate.mockReset();
  cleanup();
});

describe('GroupEditor — IdP wiring', () => {
  it('names the IdP group a wired group syncs from', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' } })
    );

    expect(screen.getByText(/Members are synced from IdP group/)).toBeInTheDocument();
    expect(screen.getByText('SSO - Support')).toBeInTheDocument();
  });

  // CONTROL: a hand-authored group must show no banner, or the banner would be noise
  // rather than information.
  it('CONTROL: shows nothing for a group with no IdP wiring', () => {
    renderEditor(group());
    expect(screen.queryByText(/synced from IdP group/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unwire' })).not.toBeInTheDocument();
  });

  // The Provisioning row is the ONE unwire control: its confirm knows whether the backing
  // group is retired with the wire. A second button here carried older, softer copy.
  it('offers no Unwire of its own, and points at the Provisioning screen', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' } })
    );

    expect(screen.queryByRole('button', { name: 'Unwire' })).not.toBeInTheDocument();
    expect(screen.getByText(/unwire it on the Provisioning screen/)).toBeInTheDocument();
  });

  // A MINTED backing group is named "<IdP group> — <Role>" and both the Groups list and the
  // Provisioning row read it as "the mapping for that IdP group". So the name is derived —
  // it follows the role picked here — and is never typed: a role edit that left
  // "— Associate" on a group granting Moderator would lie on every screen.
  it('derives a minted group\'s name from the IdP group and the role, and saves that', () => {
    renderEditor(
      group({
        name: 'SSO - Support — Support',
        idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support', mintedByWire: true },
      })
    );

    const nameInput = screen.getByLabelText<HTMLInputElement>('Name');
    expect(nameInput.readOnly).toBe(true);
    fireEvent.change(nameInput, { target: { value: 'Renamed by hand' } });
    expect(nameInput.value).toBe(backingGroupName('SSO - Support', 'support'));
    expect(screen.getByText(/the name follows the mapping/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Grants role'), { target: { value: 'moderator' } });
    expect(nameInput.value).toBe(backingGroupName('SSO - Support', 'moderator'));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(saveMutate).toHaveBeenCalledTimes(1);
    expect((saveMutate.mock.calls[0][0] as { draft: { name: string } }).draft.name).toBe(backingGroupName('SSO - Support', 'moderator'));
  });

  // A hand-authored group wired LATER is the admin's — their name, kept on unwire — so it
  // must stay renamable, or "read-only" would just be "nobody can rename a wired group".
  it('CONTROL: leaves the name editable for a hand-wired (not minted) group', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support', mintedByWire: false } })
    );

    const nameInput = screen.getByLabelText<HTMLInputElement>('Name');
    expect(nameInput.readOnly).toBe(false);
    fireEvent.change(nameInput, { target: { value: 'Renamed by hand' } });
    expect(nameInput.value).toBe('Renamed by hand');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((saveMutate.mock.calls[0][0] as { draft: { name: string } }).draft.name).toBe('Renamed by hand');
  });

  // Skew: an older backend omits mintedByWire. Deriving would overwrite a name we cannot
  // classify, so nothing is derived and the field stays editable.
  it('CONTROL: derives nothing when the backend omits mintedByWire', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' } })
    );

    expect(screen.getByLabelText<HTMLInputElement>('Name').readOnly).toBe(false);
    expect(screen.queryByText(/the name follows the mapping/)).not.toBeInTheDocument();
  });

  // CONTROL: an authored group's name stays editable.
  it('CONTROL: leaves the name editable for a hand-authored group', () => {
    renderEditor(group());

    const nameInput = screen.getByLabelText<HTMLInputElement>('Name');
    expect(nameInput.readOnly).toBe(false);
    fireEvent.change(nameInput, { target: { value: 'Renamed by hand' } });
    expect(nameInput.value).toBe('Renamed by hand');
  });

  it('gives IdP-managed members no remove control', () => {
    renderEditor(
      group({
        idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' },
        idpManagedMemberIds: [11],
      })
    );

    expect(screen.queryByLabelText('Remove Ada Lovelace')).not.toBeInTheDocument();
    // CONTROL: the hand-added member keeps theirs — otherwise the feature would just be
    // "nobody can remove anyone".
    expect(screen.getByLabelText('Remove Bea Manual')).toBeInTheDocument();
  });

  // Skew: an older backend sends no idpManagedMemberIds. Marking nobody is the honest
  // answer; marking everybody would strip controls an admin legitimately has.
  it('marks nobody as IdP-managed when the backend omits the field', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' } })
    );

    expect(screen.getByLabelText('Remove Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove Bea Manual')).toBeInTheDocument();
  });
});
