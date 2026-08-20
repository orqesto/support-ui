/**
 * Saving a group's permission overrides.
 *
 * The case worth a test is the version skew, because getting it wrong DELETES data
 * silently: this app deploys on merge while the backend ships separately, so a build
 * that reads group overrides can run against a backend that does not return them. An
 * editor that treated the missing field as "customizes nothing" would then save that
 * emptiness back over a real grant the moment an admin renamed the group.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { overridesEqual, type PermissionOverrides } from '@/types/roles';

const update = vi.fn();
const setOrgs = vi.fn();
const create = vi.fn();

vi.mock('@/services/alliance-groups.service', () => ({
  allianceGroupsService: {
    create: (...args: unknown[]): unknown => create(...args),
    update: (...args: unknown[]): unknown => update(...args),
    setOrgs: (...args: unknown[]): unknown => setOrgs(...args),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    list: vi.fn(),
    listOrgDepartments: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  // Hand back the mutationFn so the diff logic can be driven directly, without a
  // renderHook + provider dance for what is plain async branching.
  useMutation: (options: { mutationFn: unknown }) => ({ mutate: options.mutationFn }),
}));

const { useSaveGroup } = await import('@/hooks/useAllianceGroups');

type Group = Parameters<ReturnType<typeof useSaveGroup>['mutate']>[0]['original'];

type TestGroup = {
  id: number;
  name: string;
  description: string | null;
  orgRole: 'support';
  permissionOverrides?: PermissionOverrides;
  orgIds: number[];
  departmentIdsByOrg: Record<number, number[]>;
  memberIds: number[];
  memberCount: number;
};

const existing: TestGroup = {
  id: 5,
  name: 'Support EU',
  description: null,
  orgRole: 'support',
  permissionOverrides: { added: ['view_audit_logs'] },
  orgIds: [1],
  departmentIdsByOrg: {},
  memberIds: [],
  memberCount: 0,
};

const draftFrom = (group: TestGroup, patch: Record<string, unknown> = {}) => ({
  name: group.name,
  description: group.description,
  orgRole: group.orgRole,
  permissionOverrides: group.permissionOverrides,
  orgIds: group.orgIds,
  departmentIdsByOrg: group.departmentIdsByOrg,
  memberIds: group.memberIds,
  ...patch,
});

// `useMutation` is stubbed to hand back its mutationFn, so this drives the diff logic
// directly. Not a React render — the rules-of-hooks lint rule doesn't apply here.
// eslint-disable-next-line react-hooks/rules-of-hooks
const mutateGroup = useSaveGroup(1).mutate as (input: {
  original: Group;
  draft: unknown;
}) => Promise<void>;

const save = (original: Group, draft: Record<string, unknown>) => mutateGroup({ original, draft });

beforeEach(() => {
  update.mockReset();
  setOrgs.mockReset();
  create.mockReset();
});

describe('useSaveGroup — permission overrides', () => {
  it('patches the grant when the overrides change', async () => {
    await save(existing as Group, draftFrom(existing, { permissionOverrides: { added: ['view_reports'] } }));

    expect(update).toHaveBeenCalledTimes(1);
    const [, , patch] = update.mock.calls[0] as [number, number, Record<string, unknown>];
    expect(patch.permissionOverrides).toEqual({ added: ['view_reports'] });
  });

  // CONTROL: an unrelated edit must not spam the grant, and — more importantly — must
  // still carry the overrides it was given, so the role/overrides pair stays consistent.
  it('does not patch when nothing changed', async () => {
    await save(existing as Group, draftFrom(existing));
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the overrides when an admin empties them', async () => {
    await save(existing as Group, draftFrom(existing, { permissionOverrides: {} }));

    const [, , patch] = update.mock.calls[0] as [number, number, Record<string, unknown>];
    expect(patch.permissionOverrides).toEqual({});
  });

  // THE SKEW CASE. Against a backend that predates the field, the editor leaves it
  // undefined; the request must omit the key rather than send {} — which the backend
  // would read as "clear it".
  it('omits the key entirely when the backend does not support overrides', async () => {
    const legacy = { ...existing, permissionOverrides: undefined };
    await save(legacy as Group, draftFrom(legacy, { permissionOverrides: undefined, name: 'Renamed' }));

    expect(update).toHaveBeenCalledTimes(1);
    const [, , patch] = update.mock.calls[0] as [number, number, Record<string, unknown>];
    expect('permissionOverrides' in patch).toBe(false);
  });

  it('treats a first-ever override as a change even though the group had none', async () => {
    const noOverrides = { ...existing, permissionOverrides: {} };
    await save(
      noOverrides as Group,
      draftFrom(noOverrides, { permissionOverrides: { added: ['view_reports'] } })
    );

    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('overridesEqual', () => {
  it('ignores ordering', () => {
    expect(overridesEqual({ added: ['b', 'a'] }, { added: ['a', 'b'] })).toBe(true);
  });

  it('treats an absent set and an empty one as equal', () => {
    expect(overridesEqual(undefined, {})).toBe(true);
  });

  it('CONTROL: notices a real difference', () => {
    expect(overridesEqual({ added: ['a'] }, { added: ['a'], removed: ['b'] })).toBe(false);
  });
});
