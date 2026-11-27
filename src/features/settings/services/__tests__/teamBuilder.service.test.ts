import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiError } from '@/test/apiError';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const del = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

const { teamBuilderService, rolesOf, RolesHeldError } = await import('../teamBuilder.service');

const ok = (data: unknown) => ({ data: { success: true, data } });
const REF = { scope: 'platform', id: 3 } as const;
const HELD = [{ role: 'generalRules', teamId: 7, teamName: 'Front desk' }];

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('rolesOf', () => {
  it('returns only true flags', () => {
    const team = {
      id: 1,
      name: 'A',
      slug: 'a',
      description: null,
      color: null,
      active: true,
      isDefault: false,
      generalRules: true,
      billingExtraction: false,
      intentRouted: true,
    };
    expect(rolesOf(team)).toEqual(['generalRules', 'intentRouted']);
    expect(rolesOf({ ...team, generalRules: undefined, intentRouted: undefined })).toEqual([]);
  });
});

describe('createFromPreset', () => {
  it('posts the body and passes a 201 apply.error ROLES_HELD through as data', async () => {
    post.mockResolvedValue(
      ok({
        team: { id: 9, name: 'Billing' },
        apply: { error: 'ROLES_HELD', heldRoles: HELD },
        notice: 'rules_only_until_traffic',
      })
    );
    const out = await teamBuilderService.createFromPreset({
      preset: REF,
      name: 'Billing',
      moveRoles: false,
    });
    expect(post).toHaveBeenCalledWith('/api/departments/from-preset', {
      preset: REF,
      name: 'Billing',
      moveRoles: false,
    });
    expect(out.apply).toEqual({ error: 'ROLES_HELD', heldRoles: HELD });
    expect(out.team.id).toBe(9);
    expect(out.warnings).toEqual([]);
    expect(out.notice).toBe('rules_only_until_traffic');
  });

  it('turns a 409 ROLES_HELD (no team created) into RolesHeldError with heldRoles', async () => {
    post.mockRejectedValue(
      await apiError(409, { success: false, error: 'held', code: 'ROLES_HELD', heldRoles: HELD })
    );
    const err = await teamBuilderService
      .createFromPreset({ preset: REF, name: 'X' })
      .catch((caught: unknown) => caught);
    expect(err).toBeInstanceOf(RolesHeldError);
    expect((err as InstanceType<typeof RolesHeldError>).heldRoles).toEqual(HELD);
  });

  it('throws when the response carries no team id', async () => {
    post.mockResolvedValue(ok({ apply: { inserted: 1 } }));
    await expect(teamBuilderService.createFromPreset({ preset: REF, name: 'X' })).rejects.toThrow(
      'The team was not returned'
    );
  });

  it('rethrows a 403 PLAN_TEAM_LIMIT unchanged', async () => {
    const limit = await apiError(403, { success: false, error: 'limit', code: 'PLAN_TEAM_LIMIT' });
    post.mockRejectedValue(limit);
    await expect(teamBuilderService.createFromPreset({ preset: REF, name: 'X' })).rejects.toBe(
      limit
    );
  });

  it('normalises a successful apply and keeps warnings', async () => {
    post.mockResolvedValue(
      ok({
        team: { id: 9 },
        apply: { inserted: 4, failed: [{ name: 'r', flow: 'spam', code: 'MISSING_ITEM' }] },
        warnings: ['NO_ROUTING_RULES'],
      })
    );
    const out = await teamBuilderService.createFromPreset({ preset: REF, name: 'X' });
    expect(out.apply).toEqual({
      inserted: 4,
      alreadyPresent: 0,
      retired: 0,
      failed: [{ name: 'r', flow: 'spam', code: 'MISSING_ITEM' }],
      rolesSet: [],
      previousHolders: [],
    });
    expect(out.warnings).toEqual(['NO_ROUTING_RULES']);
    expect(out.notice).toBeNull();
  });
});

describe('applyPreset', () => {
  it('posts to the team and unwraps; a missing alreadyPresent reads as 0', async () => {
    post.mockResolvedValue(ok({ inserted: 2, rolesSet: ['intentRouted', 'bogus'] }));
    const out = await teamBuilderService.applyPreset(5, REF, true);
    expect(post).toHaveBeenCalledWith('/api/departments/5/apply-preset', {
      preset: REF,
      moveRoles: true,
    });
    expect(out.alreadyPresent).toBe(0);
    expect(out.rolesSet).toEqual(['intentRouted']);
    expect(out.failed).toEqual([]);
  });

  it('turns 409 ROLES_HELD into RolesHeldError with heldRoles', async () => {
    post.mockRejectedValue(
      await apiError(409, { success: false, error: 'held', code: 'ROLES_HELD', heldRoles: HELD })
    );
    const err = await teamBuilderService.applyPreset(5, REF).catch((caught: unknown) => caught);
    expect(err).toBeInstanceOf(RolesHeldError);
    expect((err as InstanceType<typeof RolesHeldError>).heldRoles).toEqual(HELD);
  });

  it('rethrows any other failure unchanged', async () => {
    const boom = await apiError(404, { success: false, error: 'nope', code: 'NOT_FOUND' });
    post.mockRejectedValue(boom);
    await expect(teamBuilderService.applyPreset(5, REF)).rejects.toBe(boom);
  });
});

describe('the other calls', () => {
  it('applyItems posts itemIds', async () => {
    post.mockResolvedValue(ok({ inserted: 1, alreadyPresent: 1 }));
    const out = await teamBuilderService.applyItems(5, [1, 2]);
    expect(post).toHaveBeenCalledWith('/api/departments/5/apply-items', { itemIds: [1, 2] });
    expect(out.alreadyPresent).toBe(1);
  });

  it('listPresets normalises the view', async () => {
    get.mockResolvedValue(
      ok([
        {
          scope: 'workspace',
          id: 2,
          key: 'k',
          name: 'N',
          description: 'D',
          roles: ['generalRules', 'x'],
          source: 'workspace',
          itemCount: 5,
          flowCounts: { spam: 3, routing: 2, bad: 'x' },
        },
        { id: 'oops' },
      ])
    );
    const out = await teamBuilderService.listPresets();
    expect(get).toHaveBeenCalledWith('/api/departments/presets');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      scope: 'workspace',
      id: 2,
      roles: ['generalRules'],
      itemCount: 5,
      flowCounts: { spam: 3, routing: 2 },
    });
  });

  it('saveAsPreset returns the preset and the skipped list', async () => {
    post.mockResolvedValue(
      ok({
        preset: { scope: 'workspace', id: 8, key: 'k', name: 'N' },
        skipped: [{ flow: 'sla', name: 's', reason: 'UNSUPPORTED_TYPE' }, 'junk'],
      })
    );
    const out = await teamBuilderService.saveAsPreset(5, { name: 'N', description: '' });
    expect(post).toHaveBeenCalledWith('/api/departments/5/save-as-preset', {
      name: 'N',
      description: '',
    });
    expect(out.preset.id).toBe(8);
    expect(out.preset.flowCounts).toEqual({});
    expect(out.skipped).toEqual([{ flow: 'sla', name: 's', reason: 'UNSUPPORTED_TYPE' }]);
  });

  it('archivePreset and setRole use the right paths', async () => {
    del.mockResolvedValue(ok({ id: 4, active: false }));
    patch.mockResolvedValue(ok({ role: 'intentRouted', on: true, previousHolderId: null }));
    await teamBuilderService.archivePreset(4);
    await teamBuilderService.setRole(5, 'intentRouted', true);
    expect(del).toHaveBeenCalledWith('/api/departments/presets/workspace/4');
    expect(patch).toHaveBeenCalledWith('/api/departments/5/roles', {
      role: 'intentRouted',
      on: true,
    });
  });

  it('listLibrary sends only the params given and normalises', async () => {
    get.mockResolvedValue(
      ok({
        items: [
          { id: 1, flow: 'spam', name: 'n', description: 'd', purposeGroup: null, preview: null },
        ],
        total: 291,
        countsByFlow: { spam: 10, x: 'bad' },
      })
    );
    const out = await teamBuilderService.listLibrary({ flow: 'spam', q: 'a b', page: 2 });
    expect(get).toHaveBeenCalledWith('/api/departments/library', {
      params: { flow: 'spam', q: 'a b', page: 2 },
    });
    expect(out).toMatchObject({ total: 291, page: 1, pageSize: 0, countsByFlow: { spam: 10 } });
    expect(out.items[0].name).toBe('n');
  });

  it('ruleSummary keeps null for uncounted fields', async () => {
    get.mockResolvedValue(
      ok([
        { flow: 'spam', total: 4, active: 3, neverFired: 1 },
        { flow: 'categories', total: 2, active: null, neverFired: null },
      ])
    );
    const out = await teamBuilderService.ruleSummary(5);
    expect(get).toHaveBeenCalledWith('/api/departments/5/rules/summary');
    expect(out[1]).toEqual({ flow: 'categories', total: 2, active: null, neverFired: null });
  });

  it('teamRules sends neverFired as a string and normalises rows', async () => {
    get.mockResolvedValue(
      ok({
        items: [{ id: 1, label: 'L', active: null, matchCount: 0, lastMatchedAt: null }],
        total: 1,
        page: 1,
        pageSize: 25,
      })
    );
    const out = await teamBuilderService.teamRules(5, { flow: 'spam', neverFired: true });
    expect(get).toHaveBeenCalledWith('/api/departments/5/rules', {
      params: { flow: 'spam', neverFired: 'true' },
    });
    expect(out.items[0]).toEqual({
      id: 1,
      label: 'L',
      active: null,
      matchCount: 0,
      lastMatchedAt: null,
      createdAt: null,
    });
  });
});
