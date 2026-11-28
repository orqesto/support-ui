import { describe, it, expect, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }));
const { departmentService } = await import('../department.service');

const planFor = async (teamPlan: unknown) => {
  get.mockResolvedValueOnce({ data: { success: true, data: [], teamsEnabled: true, teamPlan } });
  let got: unknown = 'unset';
  await departmentService.getAll(false, (_on, plan) => {
    got = plan;
  });
  return got;
};

describe('getAll teamPlan', () => {
  it('passes a well-formed plan', async () => {
    expect(await planFor({ activeTeams: 2, teamLimit: 1, overLimit: true })).toEqual({
      activeTeams: 2,
      teamLimit: 1,
      overLimit: true,
    });
  });
  it('an explicit null stays null', async () => {
    expect(await planFor(null)).toBeNull();
  });
  it('a missing field is undefined', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: [], teamsEnabled: true } });
    let got: unknown = 'unset';
    await departmentService.getAll(false, (_on, plan) => {
      got = plan;
    });
    expect(got).toBeUndefined();
  });
  it.each([[undefined], ['x'], [{ overLimit: 'yes' }]])('%j becomes undefined', async (value) => {
    expect(await planFor(value)).toBeUndefined();
  });
});
