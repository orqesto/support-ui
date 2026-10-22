/**
 * The teams-mode calls against the backend's real shapes (BE report, 2026-10-22):
 * GET/PUT /api/departments/mode use `enabled`; the preview sends `teams`, `totals` and
 * `membersAddedToDefault`; the list sends `teamsEnabled` next to `data`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

const { departmentService } = await import('../department.service');

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
});

describe('teams mode — real backend shapes', () => {
  it('GET mode reads `enabled`, `source` and `defaultDepartmentId`', async () => {
    api.get.mockResolvedValue({
      data: { success: true, data: { enabled: false, source: 'stored', defaultDepartmentId: 4 } },
    });
    expect(await departmentService.getTeamsMode()).toEqual({
      teamsEnabled: false,
      source: 'stored',
      defaultDepartmentId: 4,
    });
    expect(api.get).toHaveBeenCalledWith('/api/departments/mode');
  });

  it('PUT mode sends `{ enabled }` and reads the stored value back', async () => {
    api.put.mockResolvedValue({
      data: { success: true, data: { enabled: false, merged: [], membersAddedToDefault: 2 } },
    });
    expect(await departmentService.setTeamsMode(false)).toEqual({ teamsEnabled: false });
    expect(api.put).toHaveBeenCalledWith('/api/departments/mode', { enabled: false });
  });

  it('preview: totals become the counts, one entry per team to merge, members added kept', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          defaultDepartment: { id: 1, name: 'General team' },
          teams: [
            {
              id: 2,
              name: 'Support team',
              slug: 'support',
              moves: { conversations: 7 },
              staysWithTeam: { routingRules: 3 },
            },
            {
              id: 3,
              name: 'Sales team',
              slug: 'sales',
              moves: { conversations: 2 },
              staysWithTeam: { routingRules: 0 },
            },
          ],
          totals: {
            conversations: 9,
            openConversations: 4,
            tickets: 1,
            channels: 2,
            members: 3,
            kbEntries: 5,
            ticketingIntegrations: 0,
          },
          membersAddedToDefault: 3,
          irreversible: true,
        },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.defaultDepartment).toEqual({ id: 1, name: 'General team' });
    expect(preview.teamsToMerge).toBe(2);
    expect(preview.teams.map((team) => team.name)).toEqual(['Support team', 'Sales team']);
    expect(preview.counts).toEqual({
      conversations: 9,
      openConversations: 4,
      tickets: 1,
      channels: 2,
      members: 3,
      kbEntries: 5,
      ticketingIntegrations: 0,
    });
    expect(preview.membersAddedToDefault).toBe(3);
  });

  it('the list response hands `teamsEnabled` (a sibling of data) to the receiver', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [], teamsEnabled: false } });
    const seen: Array<boolean | undefined> = [];
    await departmentService.getAll(false, (value) => seen.push(value));
    expect(seen).toEqual([false]);
  });

  it('CONTROL — an older backend: no field ⇒ undefined (the caller derives it)', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } });
    const seen: Array<boolean | undefined> = [];
    await departmentService.getAll(false, (value) => seen.push(value));
    expect(seen).toEqual([undefined]);
  });
});
