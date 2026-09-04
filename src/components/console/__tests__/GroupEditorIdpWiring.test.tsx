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

vi.mock('@/hooks/useAllianceGroups', () => ({
  useSaveGroup: () => ({ mutate: vi.fn(), isPending: false }),
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

  // A minted backing group is named "<IdP group> — <Role>" and the Provisioning row finds
  // it by that name; renaming it here would detach the two while the mapping kept working.
  it('keeps the name read-only for an IdP-fed group', () => {
    renderEditor(
      group({ idpGroup: { mappingId: 7, externalId: 'ext-1', displayName: 'SSO - Support' } })
    );

    const nameInput = screen.getByLabelText<HTMLInputElement>('Name');
    expect(nameInput.readOnly).toBe(true);
    fireEvent.change(nameInput, { target: { value: 'Renamed by hand' } });
    expect(screen.getByText(/the name follows the mapping/)).toBeInTheDocument();
  });

  // CONTROL: an authored group's name stays editable — otherwise "read-only" would just
  // be "nobody can rename anything".
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
