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
  canManage: true,
  /** Restricted topics are offered (the backend lists them). */
  topics: false,
  /** Extra fields the next save's answer carries (what is stored NOW, changed by someone else). */
  answer: {} as Record<string, unknown>,
  /** When set, a save waits until it is called. */
  release: null as null | (() => void),
  hold: false,
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
        ...(state.topics && { restrictedTopics: [] }),
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
      if (state.hold)
        return new Promise((_resolve, reject) => {
          state.release = () =>
            reject(
              Object.assign(new Error(STALE), {
                status: 409,
                response: { status: 409, data: { success: false, error: STALE } },
              })
            );
        });
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
        data: {
          departmentSettings: state.departmentSettings,
          updatedAt: state.updatedAt,
          ...state.answer,
        },
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
      { id: 11, name: 'Legacy', slug: 'legacy', active: false },
    ],
    teamsEnabled: true,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => state.canManage }),
}));
vi.mock('../AutoReplyRulesSection', () => ({ AutoReplyRulesSection: () => null }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { AutoReplyConfiguration, CHECK_ONLY_HELP } from '../AutoReplyConfiguration';

const CHECK_ONLY = 'Check only: nothing is emailed';
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
    canManage: true,
    topics: false,
    answer: {},
    release: null,
    hold: false,
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
    // Nothing is emailed in it — keyword rules included; only the receipt confirmation goes out.
    expect(CHECK_ONLY_HELP).toMatch(
      /nothing automatic is emailed, except a mailbox's fixed receipt confirmation/
    );
    expect(CHECK_ONLY_HELP).toMatch(
      /Keyword rule replies and AI replies are written and go through every check/
    );
    expect(CHECK_ONLY_HELP).toMatch(/would have been sent/);
    expect(CHECK_ONLY_HELP).not.toMatch(/still send/);
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
      dialog().getByText(/^Nothing will be emailed\. Keyword rule replies and AI replies/)
    ).toBeInTheDocument();
    expect(dialog().getByText(/receipt confirmation still goes out/)).toBeInTheDocument();
    expect(dialog().queryByText(/will be emailed to customers/)).toBeNull();
    // Nothing is sent from them: they are the mailboxes whose mail is checked.
    expect(
      await dialog().findByText('Mail arriving at these mailboxes is checked:')
    ).toBeInTheDocument();
    // No rule sends in this choice, so nothing is said about how rule replies are checked.
    expect(dialog().queryByText(/Every keyword rule reply is checked first/)).toBeNull();
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
    // The reset lowers the confidence this team asked for: confirmed first.
    fireEvent.click(await dialog().findByRole('button', { name: 'Reset' }));
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

describe('out of "checked, not sent" into "Keyword rules only": knowledge base answers start sending', () => {
  const KB_TITLE = 'Let keyword rules send?';
  const lastTeam = () =>
    (state.updates.at(-1) as { teamSettingsChange?: { settings: unknown } }).teamSettingsChange
      ?.settings;

  it('the workspace: asked first, in words that name the knowledge base answers', async () => {
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules only' }));
    expect(dialog().getByText(KB_TITLE)).toBeInTheDocument();
    // Both kinds of rule start: a fixed text, and one that adds a knowledge base answer.
    expect(
      dialog().getByText(
        /those with a fixed text and those that add a knowledge base answer .* will be emailed to customers .* Until now they were checked and not sent\./
      )
    ).toBeInTheDocument();
    expect(dialog().getByText(/Every keyword rule reply is checked first/)).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Let them send' }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ mode: 'rules_only', expectedUpdatedAt: FIRST_STAMP }])
    );
  });

  it('cancelled: the choice stays "checked, not sent"', async () => {
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules only' }));
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(state.updates).toEqual([]);
    expect(choice().getByRole('button', { name: CHECK_ONLY, pressed: true })).toBeInTheDocument();
  });

  it.each([
    [
      'a team’s own choice',
      { '7': { autoReplyMode: 'check_only' } },
      () => fireEvent.click(team().getByRole('button', { name: 'Keyword rules only' })),
      { autoReplyMode: 'rules_only' },
    ],
    [
      '"Same as workspace" under a keyword-rules-only workspace',
      { '7': { autoReplyMode: 'check_only' } },
      () => fireEvent.click(team().getByRole('button', { name: /Same as workspace/ })),
      { autoReplyMode: null },
    ],
    [
      '"Reset all overrides" on a team whose own choice was it',
      { '7': { autoReplyMode: 'check_only', autoReplyHighConfidenceThreshold: 0.95 } },
      () =>
        fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' })),
      { autoReplyMode: null, autoReplyHighConfidenceThreshold: null },
    ],
  ])('%s: asked first, for that team', async (_name, teams, press, saved) => {
    state.departmentSettings = teams;
    await show();
    press();
    expect(dialog().getByText('Let keyword rules send for Billing?')).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Let them send' }));
    await waitFor(() => expect(lastTeam()).toEqual(saved));
  });

  it('CONTROL: from "Keyword rules and AI replies" to "Keyword rules only" stops things, and asks nothing', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ mode: 'rules_only', expectedUpdatedAt: FIRST_STAMP }])
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the help says a "Keyword rules only" rule does send its knowledge base answer, and that this is email only', async () => {
    await show();
    expect(
      screen.getAllByText(
        /a rule that adds a knowledge base answer \("Template \+ KB"\) sends that answer too/
      ).length
    ).toBeGreaterThan(0);
    expect(CHECK_ONLY_HELP).toMatch(
      /This covers email only: Telegram bots and website chat widgets answer for real unless their own switches are off\./
    );
  });
});

describe('a confirmation does not outlive a re-read of the settings', () => {
  it('a save refused as stale while a confirmation is open closes it: nothing it described is saved', async () => {
    await show();
    state.hold = true;
    // A team save goes out and waits…
    fireEvent.click(team().getByRole('button', { name: CHECK_ONLY }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    // …meanwhile a confirmation is opened for the workspace.
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // The waiting save is refused: the settings are behind and are read again.
    state.hold = false;
    state.release?.();
    await waitFor(() => expect(state.alerts.at(-1)).toMatchObject({ title: 'Not saved' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('Default');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.updates).toHaveLength(1);
  });
});

describe('a team save that changes nothing', () => {
  it('sends nothing (the server refuses an empty change)', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = { '7': { autoReplyHighConfidenceThreshold: 0.95 } };
    await show();
    const slider = document.getElementById('dept-threshold-7') as HTMLInputElement;
    // Dragged away and put back where it was, then let go.
    fireEvent.change(slider, { target: { value: '97' } });
    fireEvent.change(slider, { target: { value: '95' } });
    fireEvent.pointerUp(slider);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.updates).toEqual([]);
    expect(state.alerts).toEqual([]);
    // CONTROL: a real change is sent.
    fireEvent.change(slider, { target: { value: '97' } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(state.updates).toHaveLength(1));
  });

  it('a reset nulls only the keys the server’s per-team change accepts', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = {
      '7': { autoReplyHighConfidenceThreshold: 0.95, someOlderKey: true },
    };
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' }));
    fireEvent.click(await dialog().findByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toEqual({
      teamSettingsChange: {
        departmentId: 7,
        settings: { autoReplyHighConfidenceThreshold: null },
      },
      expectedUpdatedAt: FIRST_STAMP,
    });
  });
});

describe('the read-only summary (no permission to change)', () => {
  it('says "checked, not sent" when that is the choice', async () => {
    state.canManage = false;
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(
      await screen.findByText(/check only: nothing is emailed \(email only\)/)
    ).toBeInTheDocument();
  });

  it('CONTROL: not said for another choice', async () => {
    state.canManage = false;
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await screen.findByText(/keyword rules only/)).toBeInTheDocument();
    expect(screen.queryByText(/check only/)).toBeNull();
  });
});

describe('every save’s answer is what is stored now — not only the part the save was about', () => {
  it('a topic save that finds the choice changed by someone else: the page shows it, and the next confirmation describes it', async () => {
    // 1. The page is read: keyword rules only; Billing has automatic replies switched off.
    state.topics = true;
    state.departmentSettings = { '7': { autoReplyEnabled: false } };
    await show();
    expect(
      choice().getByRole('button', { name: 'Keyword rules only', pressed: true })
    ).toBeInTheDocument();
    // 2. Someone else lets the AI reply. 3. This page saves a topic; the answer carries what is
    //    stored: the new choice with it.
    state.answer = {
      enabled: true,
      mode: 'all',
      modeStored: 'all',
      restrictedTopics: ['refund disputes'],
    };
    const input = screen.getByRole('textbox', { name: 'Add to Workspace restricted topics' });
    fireEvent.change(input, { target: { value: 'refund disputes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(state.updates).toHaveLength(1));
    // The topic save carries the stale-page stamp too.
    expect(state.updates[0].expectedUpdatedAt).toBe(FIRST_STAMP);
    // 4. The page now shows the stored choice.
    expect(
      await choice().findByRole('button', { name: 'Keyword rules and AI replies', pressed: true })
    ).toBeInTheDocument();
    // 5. Billing is switched back on: the confirmation says the AI will send — not that it stays off.
    fireEvent.click(screen.getAllByRole('button', { name: /Inherit default/ })[0]);
    expect(
      await dialog().findByText(
        /Your keyword rules AND AI-written answers from your knowledge base will be emailed/
      )
    ).toBeInTheDocument();
    expect(dialog().queryByText(/The AI.s own replies stay off/)).toBeNull();
  });
});

describe('teams that send more than the workspace confirmation says are named', () => {
  it('check only for the workspace: a team on "Keyword rules only" and one on "…and AI replies" are exceptions, each with what it sends — a switched-off team too', async () => {
    state.enabled = false;
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    state.departmentSettings = {
      '7': { autoReplyMode: 'rules_only' },
      '9': { autoReplyMode: 'all' },
      '11': { autoReplyMode: 'all' },
    };
    await show();
    fireEvent.click(workspaceSwitch());
    const list = within(await dialog().findByRole('list', { name: 'Teams that send more' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(list).toEqual([
      'Billing — keyword rules are emailed',
      'Returns — keyword rules and AI replies are emailed',
      'Legacy (switched off) — keyword rules and AI replies are emailed',
    ]);
  });

  it('CONTROL: a team that switched itself off, or that only checks, is no exception', async () => {
    state.enabled = false;
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    state.departmentSettings = {
      '7': { autoReplyMode: 'all', autoReplyEnabled: false },
      '9': { autoReplyMode: 'check_only' },
    };
    await show();
    fireEvent.click(workspaceSwitch());
    await dialog().findByText('Mail arriving at these mailboxes is checked:');
    expect(dialog().queryByRole('list', { name: 'Teams that send more' })).toBeNull();
  });
});

describe('"Reset all overrides" that widens what the team limited', () => {
  it('is confirmed, saying what changes; cancelled, nothing is saved', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = {
      '7': {
        escalationPhrases: ['lawyer', 'chargeback'],
        autoReplyHighConfidenceThreshold: 0.97,
        autoReplyRequestMissingInfo: false,
      },
    };
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' }));
    expect(dialog().getByText('Reset all overrides for Billing?')).toBeInTheDocument();
    const changes = within(dialog().getByRole('list', { name: 'What this reset changes' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(changes).toEqual([
      'Removes this team\'s 2 stop phrases ("lawyer", "chargeback"): a message containing one was never answered automatically.',
      'Lowers the confidence the AI needs before it replies from 97% to 90%.',
      'Lets the AI email customers to ask for missing details (off for this team until now).',
    ]);
    expect(state.updates).toEqual([]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(state.updates).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' }));
    fireEvent.click(await dialog().findByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
  });

  it('CONTROL: a reset that widens nothing is saved at once', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = { '7': { autoReplySuggestSolutions: false } };
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a team holding only a key no reset can clear has no Reset button, and is not called an override', async () => {
    state.departmentSettings = { '7': { someOlderKey: true } };
    await show();
    expect(screen.queryByRole('button', { name: 'Reset all overrides for Billing' })).toBeNull();
    expect(screen.queryByText('Partial override')).toBeNull();
  });
});

describe('check only covers keyword rules too', () => {
  it('entering it from "Keyword rules and AI replies" is less mail: saved at once', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    await show();
    fireEvent.click(choice().getByRole('button', { name: CHECK_ONLY }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ mode: 'check_only', expectedUpdatedAt: FIRST_STAMP }])
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaving it for "Keyword rules and AI replies" says the keyword rules start too', async () => {
    state.mode = 'check_only';
    state.modeStored = 'check_only';
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(
      dialog().getByText(
        /Your keyword rules AND AI-written answers .* Until now they were checked and not sent\./
      )
    ).toBeInTheDocument();
    expect(dialog().queryByText(/as your keyword rules already are/)).toBeNull();
  });

  it('CONTROL: from "Keyword rules only" the rules were already sending, and it says so', async () => {
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(dialog().getByText(/as your keyword rules already are/)).toBeInTheDocument();
  });

  it('the card says every rule reply is checked for meaning, and held without an AI provider', async () => {
    await show();
    expect(
      screen.getAllByText(
        /Every keyword rule reply is checked first: the AI reads whether the customer is really asking what the rule answers.* With no AI provider configured, rule replies are held\./
      ).length
    ).toBeGreaterThan(0);
  });
});
