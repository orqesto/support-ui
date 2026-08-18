import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { allianceGroupsService } from '@/services/alliance-groups.service';

describe('allianceGroupsService.listOrgDepartments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the alliance-scoped org departments endpoint', async () => {
    const departments = [{ id: 3, name: 'Sales' }];
    get.mockResolvedValue({ data: { data: departments } });

    await expect(allianceGroupsService.listOrgDepartments(7, 42)).resolves.toEqual(departments);
    expect(get).toHaveBeenCalledWith('/api/alliances/7/orgs/42/departments');
  });
});

describe('allianceGroupsService.setOrgs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends orgIds AND the per-org department mapping in one PUT', async () => {
    put.mockResolvedValue({ data: { success: true } });

    await allianceGroupsService.setOrgs(7, 55, [42, 43], { 42: [3, 4] });

    expect(put).toHaveBeenCalledTimes(1);
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/api/alliances/7/groups/55/orgs');
    expect(body).toEqual({ orgIds: [42, 43], departmentIdsByOrg: { 42: [3, 4] } });
  });

  it('defaults to an empty mapping when none is passed (never sends undefined)', async () => {
    put.mockResolvedValue({ data: { success: true } });

    await allianceGroupsService.setOrgs(7, 55, [42]);

    const [, body] = put.mock.calls[0];
    // The BE replaces the whole set on every PUT, so an omitted map must clear depts,
    // not be absent — assert the explicit empty object rather than a missing key.
    expect(body).toEqual({ orgIds: [42], departmentIdsByOrg: {} });
  });
});

describe('allianceGroupsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the department mapping through with the group', async () => {
    post.mockResolvedValue({ data: { data: { id: 99 } } });

    await allianceGroupsService.create(7, {
      name: 'Support Leads',
      orgRole: 'support',
      orgIds: [42],
      departmentIdsByOrg: { 42: [3] },
      memberIds: [],
    });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/alliances/7/groups');
    expect(body).toMatchObject({ orgIds: [42], departmentIdsByOrg: { 42: [3] } });
  });
});
