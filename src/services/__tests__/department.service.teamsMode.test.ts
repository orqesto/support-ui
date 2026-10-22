/**
 * The teams-mode calls against the backend's real shapes (BE report, 2026-10-22):
 * GET/PUT /api/departments/mode use `enabled`; the preview sends `teams`, `totals` and
 * `membersAddedToDefault`; the list sends `teamsEnabled` next to `data`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

const {
  departmentService,
  isTeamsSwitchStillRunning,
  labelAsPhrase,
  labelForTeamsOffCount,
  sortTeamsOffCounts,
  TEAMS_OFF_COUNT_LABELS,
} = await import('../department.service');

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
      switching: false,
      interrupted: false,
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

describe('teams mode — switch-off extras', () => {
  it('preview: lead qualification flag and what stays with each team (summed per key)', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          defaultDepartment: { id: 1, name: 'General team' },
          teams: [
            { id: 2, name: 'Support team', moves: {}, staysWithTeam: { routingRules: 3 } },
            { id: 3, name: 'Sales team', moves: {}, staysWithTeam: { routingRules: 2 } },
          ],
          totals: {},
          membersAddedToDefault: 0,
          leadQualificationMovesToDefault: true,
        },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.leadQualificationMovesToDefault).toBe(true);
    expect(preview.staysWithTeam).toEqual([{ key: 'routingRules', count: 5 }]);
  });

  it('preview: a top-level staysWithTeam list of names is shown as names', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: { teams: [], totals: {}, staysWithTeam: ['routingRules', 'prompts'] },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.staysWithTeam).toEqual([{ key: 'routingRules' }, { key: 'prompts' }]);
    expect(preview.leadQualificationMovesToDefault).toBe(false);
  });

  it('GET mode reports `switching`', async () => {
    api.get.mockResolvedValue({
      data: { success: true, data: { enabled: true, switching: true } },
    });
    expect((await departmentService.getTeamsMode()).switching).toBe(true);
  });

  it('waitForTeamsSwitch polls until switching is false, riding over a failed poll', async () => {
    api.get
      .mockResolvedValueOnce({ data: { success: true, data: { enabled: true, switching: true } } })
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({
        data: { success: true, data: { enabled: false, switching: false } },
      });
    const final = await departmentService.waitForTeamsSwitch({ intervalMs: 1, timeoutMs: 5000 });
    expect(final).toMatchObject({ teamsEnabled: false, switching: false });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('isTeamsSwitchStillRunning: timeout / no answer / in-progress yes; a real refusal no', () => {
    expect(isTeamsSwitchStillRunning(Object.assign(new Error('x'), { isAxiosError: true }))).toBe(
      true
    );
    expect(
      isTeamsSwitchStillRunning({ status: 409, data: { code: 'TEAMS_SWITCH_IN_PROGRESS' } })
    ).toBe(true);
    expect(isTeamsSwitchStillRunning({ status: 504 })).toBe(true);
    expect(isTeamsSwitchStillRunning({ status: 409, data: { code: 'TEAMS_SWITCHED_OFF' } })).toBe(
      false
    );
    expect(isTeamsSwitchStillRunning({ status: 403, data: { code: 'PLAN_TEAM_LIMIT' } })).toBe(
      false
    );
  });

  it('getPlanTeamLimit reads the plan limits; unreadable ⇒ undefined', async () => {
    api.get.mockResolvedValueOnce({
      data: { success: true, data: { plan: { name: 'free', limits: { maxDepartments: 1 } } } },
    });
    expect(await departmentService.getPlanTeamLimit()).toBe(1);
    api.get.mockRejectedValueOnce(new Error('403'));
    expect(await departmentService.getPlanTeamLimit()).toBeUndefined();
  });

  it('labels read well for the moved/staying keys, and an unknown key turns into words', () => {
    expect(labelForTeamsOffCount('replyTemplates')).toBe('Reply templates');
    expect(labelForTeamsOffCount('routingRules')).toBe('Routing rules');
    expect(labelForTeamsOffCount('customApiConnections')).toBe('Custom API connection links');
    expect(labelForTeamsOffCount('someNewThing')).toBe('Some new thing');
  });

  it('a label inside a sentence keeps its acronyms', () => {
    expect(labelAsPhrase('AI prompt templates')).toBe('AI prompt templates');
    expect(labelAsPhrase('Routing rules')).toBe('routing rules');
    expect(labelAsPhrase(labelForTeamsOffCount('promptTemplates'))).toBe('AI prompt templates');
  });

  it('threads, open threads and tickets sort first; the rest keep their order', () => {
    const sorted = sortTeamsOffCounts([
      ['categories', 1],
      ['tickets', 2],
      ['labels', 3],
      ['openConversations', 4],
      ['conversations', 5],
    ] as [string, number][]).map(([key]) => key);
    expect(sorted).toEqual([
      'conversations',
      'openConversations',
      'tickets',
      'categories',
      'labels',
    ]);
  });
});

/** The backend's final preview payload (be-report.md API section, 2026-10-22 12:21). */
const MOVES_KEYS = [
  'conversations',
  'openConversations',
  'tickets',
  'channels',
  'members',
  'messageSources',
  'channelLinks',
  'kbEntries',
  'kbSourceLinks',
  'documents',
  'replyTemplates',
  'customApiConnections',
  'chatWidgets',
  'chatWidgetLinks',
  'ticketingIntegrations',
  'spamRules',
  'detectionRules',
  'contradictionRules',
  'responseRules',
  'categories',
  'labels',
  'labelLinks',
  'spamLogEntries',
] as const;
const moves = (fill: number) =>
  Object.fromEntries(MOVES_KEYS.map((key) => [key, fill])) as Record<string, number>;
const stays = (routingRules: number, spamTwins: number) => ({
  routingRules,
  promptTemplates: 1,
  sameAsDefault: {
    ticketingIntegrations: 0,
    spamRules: spamTwins,
    detectionRules: 0,
    contradictionRules: 0,
    responseRules: 0,
  },
});

describe('teams mode — the final backend payloads', () => {
  it('every `moves` key has its own readable label (no fallback words)', () => {
    for (const key of MOVES_KEYS) expect(TEAMS_OFF_COUNT_LABELS[key], key).toBeTruthy();
    expect(TEAMS_OFF_COUNT_LABELS.routingRules).toBe('Routing rules');
    expect(TEAMS_OFF_COUNT_LABELS.promptTemplates).toBe('AI prompt templates');
  });

  it('preview: active + inactive teams, totals, stays summed (twins kept apart), lead flag', async () => {
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
              moves: moves(1),
              staysWithTeam: stays(3, 1),
            },
          ],
          inactiveTeams: [
            { id: 5, name: 'Old team', slug: 'old', moves: moves(0), staysWithTeam: stays(2, 0) },
          ],
          totals: moves(1),
          membersAddedToDefault: 4,
          leadQualificationMovesToDefault: true,
          irreversible: true,
        },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.teamsToMerge).toBe(1);
    expect(preview.inactiveTeamsSwept).toBe(1);
    expect(Object.keys(preview.counts)).toHaveLength(MOVES_KEYS.length);
    expect(preview.membersAddedToDefault).toBe(4);
    expect(preview.leadQualificationMovesToDefault).toBe(true);
    expect(preview.staysWithTeam).toEqual([
      { key: 'routingRules', count: 5 },
      { key: 'promptTemplates', count: 2 },
      { key: 'sameAsDefault.spamRules', count: 1 },
    ]);
    expect(labelForTeamsOffCount('sameAsDefault.spamRules')).toBe(
      'Spam rules the default team already has'
    );
  });

  it('GET mode: interrupted is read; waitForTeamsSwitch stops on it (nobody is running it)', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          source: 'stored',
          defaultDepartmentId: 1,
          switching: true,
          interrupted: true,
        },
      },
    });
    expect(await departmentService.getTeamsMode()).toMatchObject({
      switching: true,
      interrupted: true,
    });
    const final = await departmentService.waitForTeamsSwitch({ intervalMs: 1, timeoutMs: 5000 });
    expect(final.interrupted).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('PUT off: the final response shape reads back as off', async () => {
    api.put.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: false,
          merged: [],
          absorbed: {},
          membersAddedToDefault: 0,
          leadQualificationAddedDefault: true,
        },
      },
    });
    expect(await departmentService.setTeamsMode(false)).toEqual({ teamsEnabled: false });
  });

  it('409 TEAMS_SWITCH_IN_PROGRESS (its real body) counts as still running', () => {
    expect(
      isTeamsSwitchStillRunning({
        status: 409,
        data: {
          success: false,
          error: 'Teams are being switched off for this workspace. Try again when it has finished.',
          code: 'TEAMS_SWITCH_IN_PROGRESS',
        },
      })
    ).toBe(true);
  });
});

describe('teams mode — blockers and same-name merges', () => {
  it('fallback: no mergedIntoSameName in totals ⇒ summed over the teams; blockers read', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          defaultDepartment: { id: 1, name: 'General team' },
          teams: [
            {
              id: 2,
              name: 'Support team',
              moves: { labels: 1, mergedIntoSameName: { labels: 2, categories: 0 } },
            },
            {
              id: 3,
              name: 'Sales team',
              moves: { mergedIntoSameName: { labels: 1, categories: 1 } },
            },
          ],
          totals: { labels: 1 },
          blockers: [
            {
              kind: 'ticketingIntegration',
              teamId: 3,
              teamName: 'Sales team',
              integrationId: 41,
              integrationName: 'Sales Jira',
            },
          ],
        },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.blockers).toEqual([
      {
        kind: 'ticketingIntegration',
        teamId: 3,
        teamName: 'Sales team',
        integrationId: 41,
        integrationName: 'Sales Jira',
      },
    ]);
    expect(preview.mergedIntoSameName).toEqual({ labels: 3, categories: 1 });
    // The nested object is not a count row.
    expect(preview.counts).toEqual({ labels: 1 });
  });

  it('main path (the BE always does this): mergedIntoSameName read from totals, not re-summed', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          teams: [
            {
              id: 2,
              name: 'Support team',
              moves: { mergedIntoSameName: { labels: 9, categories: 9 } },
            },
          ],
          // Totals are the authority; a different number proves which one was read.
          totals: { labels: 1, mergedIntoSameName: { labels: 2, categories: 1 } },
        },
      },
    });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.mergedIntoSameName).toEqual({ labels: 2, categories: 1 });
    expect(preview.counts).toEqual({ labels: 1 });
  });

  it('CONTROL: no blockers field ⇒ none', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { teams: [], totals: {} } } });
    const preview = await departmentService.previewTeamsOff();
    expect(preview.blockers).toEqual([]);
    expect(preview.mergedIntoSameName).toEqual({});
  });
});
