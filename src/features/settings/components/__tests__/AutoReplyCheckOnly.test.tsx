/**
 * Automatic replies on a backend with the 2026-11-23 settings contract:
 * - a third choice, "AI replies checked, not sent", for the workspace and for a team;
 * - what is stored is read from `modeStored` (null = never chosen), not guessed;
 * - a team is saved as ONE team's change (`teamSettingsChange`), never the whole map;
 * - every save carries the `updatedAt` the page read, and a refusal (409) shows the server's
 *   sentence and reads the settings again — the change is not sent a second time.
 * The real settings card and dialog; invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const STALE =
  'These settings were changed by someone else since this page was loaded. Reload the page and make the change again.';
const state = vi.hoisted(() => ({
  enabled: true,
  mode: 'rules_only' as 'all' | 'rules_only' | 'check_only',
  modeStored: 'rules_only' as null | 'all' | 'rules_only' | 'check_only',
  /** false = an older backend: no `modeStored`, no `updatedAt`. */
  newContract: true,
  updatedAt: '2026-11-23T10:00:00.000Z',
  departmentSettings: {} as Record<string, Record<string, unknown>>,
  /** What the workspace row says — must NOT be what decides on the new contract. */
  rowMode: undefined as undefined | string,
  updates: [] as Array<Record<string, unknown>>,
  reads: 0,
  refuse: false,
  alerts: [] as Array<{ title: string; description: string }>,
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutoReply: () => {
      state.reads += 1;
      return Promise.resolve({
        enabled: state.enabled,
        mode: state.mode,
        requestMissingInfo: true,
        suggestSolutions: true,
        highConfidenceThreshold: 0.9,
        departmentSettings: structuredClone(state.departmentSettings),
        ...(state.newContract && { modeStored: state.modeStored, updatedAt: state.updatedAt }),
      });
    },
    getCurrent: () =>
      Promise.resolve({
        settings: {
          departmentSettings: structuredClone(state.departmentSettings),
          ...(state.rowMode && { autoReplyMode: state.rowMode }),
        },
      }),
    updateAutoReply: (data: Record<string, unknown>) => {
      state.updates.push(data);
      if (state.refuse)
        return Promise.reject(
          Object.assign(new Error(STALE), {
            status: 409,
            response: { status: 409, data: { success: false, error: STALE } },
          })
        );
      state.updatedAt = '2026-11-23T10:05:00.000Z';
      return Promise.resolve({
        success: true,
        data: { departmentSettings: state.departmentSettings, updatedAt: state.updatedAt },
      });
    },
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () =>
      Promise.resolve({
        success: true,
        data: [
          {
            id: 1,
            type: 'email',
            enabled: true,
            name: 'Help',
            config: { user: 'help@shop.example' },
          },
        ],
      }),
    getSourceDepartments: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 7, name: 'Billing', slug: 'billing', active: true },
      { id: 9, name: 'Returns', slug: 'returns', active: true },
    ],
    teamsEnabled: true,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));
vi.mock('../AutoReplyRulesSection', () => ({ AutoReplyRulesSection: () => null }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { AutoReplyConfiguration, CHECK_ONLY_HELP } from '../AutoReplyConfiguration';

const CHECK_ONLY = 'Keyword rules; AI replies checked, not sent';
const FIRST_STAMP = '2026-11-23T10:00:00.000Z';

beforeEach(() => {
  Object.assign(state, {
    enabled: true,
    mode: 'rules_only',
    modeStored: 'rules_only',
    newContract: true,
    updatedAt: FIRST_STAMP,
    departmentSettings: {},
    rowMode: undefined,
    updates: [],
    reads: 0,
    refuse: false,
    alerts: [],
  });
});
afterEach(cleanup);

const show = async () => {
  render(<AutoReplyConfiguration onShowAlert={(alert) => state.alerts.push(alert as never)} />);
  await screen.findByText('Default');
};
const choice = () => within(screen.getByRole('group', { name: 'What replies on its own' }));
const team = () =>
  within(screen.getByRole('group', { name: 'What replies on its own for Billing' }));
const dialog = () => within(screen.getByRole('dialog'));
const workspaceSwitch = () => screen.getAllByRole('switch')[0];

describe('"AI replies checked, not sent"', () => {
  it('is a third choice, explained, and saved at once: nothing new starts sending', async () => {
    await show();
    expect(screen.getAllByText(CHECK_ONLY_HELP).length).toBeGreaterThan(0);
    expect(CHECK_ONLY_HELP).toMatch(/never emailed/);
    expect(CHECK_ONLY_HELP).toMatch(/would have been sent/);
    expect(CHECK_ONLY_HELP).toMatch(/Keyword rules with a fixed text still send/);
    fireEvent.click(choice().getByRole('button', { name: CHECK_ONLY }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ mode: 'check_only', expectedUpdatedAt: FIRST_STAMP }])
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('from it to "Keyword rules and AI replies" is confirmed, as letting the AI reply always is', async () => {
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    await show();
    expect(choice().getByRole('button', { name: CHECK_ONLY, pressed: true })).toBeInTheDocument();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(state.updates).toEqual([]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Let the AI reply' }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ mode: 'all', expectedUpdatedAt: FIRST_STAMP }])
    );
  });

  it('switching on with it stored: the confirmation says what is and is not emailed', async () => {
    state.enabled = false;
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    await show();
    fireEvent.click(workspaceSwitch());
    expect(
      dialog().getByText(/keyword rules with a fixed text will be emailed/)
    ).toBeInTheDocument();
    expect(dialog().getByText(/written and checked, but never emailed/)).toBeInTheDocument();
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { enabled: true, mode: 'check_only', expectedUpdatedAt: FIRST_STAMP },
      ])
    );
  });

  it('a team can choose it too, saved at once as that team’s change', async () => {
    await show();
    fireEvent.click(team().getByRole('button', { name: CHECK_ONLY }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          teamSettingsChange: { departmentId: 7, settings: { autoReplyMode: 'check_only' } },
          expectedUpdatedAt: FIRST_STAMP,
        },
      ])
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CONTROL: an older backend is not offered it', async () => {
    state.newContract = false;
    await show();
    expect(choice().queryByRole('button', { name: CHECK_ONLY })).toBeNull();
    expect(team().queryByRole('button', { name: CHECK_ONLY })).toBeNull();
    expect(screen.queryByText(CHECK_ONLY_HELP)).toBeNull();
  });
});

describe('what is stored is what the backend says (`modeStored`)', () => {
  it('never chosen (null): the first enable is keyword rules only — whatever the workspace row holds', async () => {
    state.enabled = false;
    state.mode = 'all';
    state.modeStored = null;
    state.rowMode = 'all';
    await show();
    fireEvent.click(workspaceSwitch());
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { enabled: true, mode: 'rules_only', expectedUpdatedAt: FIRST_STAMP },
      ])
    );
  });

  it('CONTROL: a stored choice is kept on enable', async () => {
    state.enabled = false;
    state.mode = 'all';
    state.modeStored = 'all';
    await show();
    fireEvent.click(workspaceSwitch());
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { enabled: true, mode: 'all', expectedUpdatedAt: FIRST_STAMP },
      ])
    );
  });
});

describe('a team is saved as that one team’s change', () => {
  it('only the changed key is sent; no other team, no whole map, and no read before it', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = {
      '7': { autoReplyHighConfidenceThreshold: 0.95 },
      '9': { autoReplyEnabled: false },
    };
    await show();
    const readsBefore = state.reads;
    fireEvent.click(team().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          teamSettingsChange: { departmentId: 7, settings: { autoReplyMode: 'rules_only' } },
          expectedUpdatedAt: FIRST_STAMP,
        },
      ])
    );
    expect(state.reads).toBe(readsBefore);
  });

  it('a dropped override is sent as null, and a reset as every key null', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = {
      '7': { autoReplyMode: 'all', autoReplyHighConfidenceThreshold: 0.95 },
    };
    await show();
    fireEvent.click(team().getByRole('button', { name: /Same as workspace/ }));
    await waitFor(() =>
      expect(state.updates[0]).toEqual({
        teamSettingsChange: { departmentId: 7, settings: { autoReplyMode: null } },
        expectedUpdatedAt: FIRST_STAMP,
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reset all overrides for Billing' }));
    await waitFor(() => expect(state.updates).toHaveLength(2));
    expect(state.updates[1]).toEqual({
      teamSettingsChange: {
        departmentId: 7,
        settings: { autoReplyMode: null, autoReplyHighConfidenceThreshold: null },
      },
      // The stamp the first save answered with.
      expectedUpdatedAt: '2026-11-23T10:05:00.000Z',
    });
  });

  it('CONTROL: an older backend still gets the whole map', async () => {
    state.newContract = false;
    state.mode = 'all';
    state.departmentSettings = { '9': { autoReplyEnabled: false } };
    await show();
    fireEvent.click(team().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          departmentSettings: {
            '9': { autoReplyEnabled: false },
            '7': { autoReplyMode: 'rules_only' },
          },
        },
      ])
    );
  });
});

describe('a save from a page that is behind (409)', () => {
  it.each([
    ['the workspace’s', () => fireEvent.click(choice().getByRole('button', { name: CHECK_ONLY }))],
    ['a team’s', () => fireEvent.click(team().getByRole('button', { name: CHECK_ONLY }))],
  ])(
    '%s: the server’s sentence, the settings read again, and no second save',
    async (_name, act) => {
      await show();
      state.refuse = true;
      const readsBefore = state.reads;
      act();
      await waitFor(() =>
        expect(state.alerts.at(-1)).toMatchObject({ title: 'Not saved', description: STALE })
      );
      await waitFor(() => expect(state.reads).toBeGreaterThan(readsBefore));
      await screen.findByText('Default');
      expect(screen.getByText(STALE)).toBeInTheDocument();
      expect(state.updates).toHaveLength(1);
      // What is shown is what is stored: the refused choice is not.
      expect(
        choice().getByRole('button', { name: 'Keyword rules only', pressed: true })
      ).toBeInTheDocument();
    }
  );
});
