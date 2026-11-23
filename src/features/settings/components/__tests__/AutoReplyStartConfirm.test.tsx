/**
 * Switching automatic email replies on is confirmed first, in plain words: what starts sending
 * and from which mailboxes. The FIRST time (no stored choice of what replies) it is saved as
 * keyword rules only — an unset choice otherwise reads as "keyword rules and AI replies" — and
 * letting the AI reply is its own confirmed step. The real settings card and dialog; invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  enabled: false,
  /** The stored choice; undefined = never chosen (the read then answers `all`). */
  storedMode: undefined as undefined | 'all' | 'rules_only',
  departmentSettings: {} as Record<string, Record<string, unknown>>,
  updates: [] as unknown[],
  mailboxesFail: false,
  /** What GET auto-reply says the teams' overrides are NOW; undefined = it does not say. */
  freshTeams: undefined as undefined | Record<string, Record<string, unknown>>,
  readFails: false,
  loadFails: false,
  /** Set to hold the next save open until called. */
  holdSave: null as null | (() => void),
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutoReply: () =>
      state.readFails || state.loadFails
        ? Promise.reject(new Error('no'))
        : Promise.resolve({
            enabled: state.enabled,
            mode: state.storedMode ?? 'all',
            requestMissingInfo: true,
            suggestSolutions: true,
            highConfidenceThreshold: 0.9,
            departmentSettings: state.freshTeams,
          }),
    getCurrent: () =>
      Promise.resolve({
        settings: {
          departmentSettings: state.departmentSettings,
          ...(state.storedMode && { autoReplyMode: state.storedMode }),
        },
      }),
    updateAutoReply: (data: unknown) => {
      state.updates.push(data);
      if (!state.holdSave) return Promise.resolve({ success: true });
      return new Promise((resolve) => {
        state.holdSave = () => resolve({ success: true });
      });
    },
  },
}));
const source = (id: number, type: string, user: string, enabled = true) => ({
  id,
  type,
  enabled,
  name: `Source ${id}`,
  config: { user },
});
const link = (departmentId: number, autoReplyEnabled: boolean) => ({
  id: departmentId * 10,
  departmentId,
  autoReplyEnabled,
});
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () =>
      state.mailboxesFail
        ? Promise.reject(new Error('no'))
        : Promise.resolve({
            success: true,
            data: [
              source(1, 'gmail', 'help@shop.example'),
              source(2, 'email', 'sales@shop.example'),
              source(3, 'email', 'noreply@shop.example'),
              source(4, 'email', 'old@shop.example', false),
              source(5, 'telegram', 'shop_bot'),
              source(6, 'email', 'billing@shop.example'),
            ],
          }),
    getSourceDepartments: (id: number) =>
      Promise.resolve({
        success: true,
        // 1: on for one team. 2: no link (allowed, as the backend treats it). 3: switched off.
        // 6: on, but only for a team that switched automatic replies off.
        data: {
          1: [link(7, true), link(8, false)],
          2: [],
          3: [link(7, false)],
          6: [link(9, true)],
        }[id],
      }),
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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';

beforeEach(() => {
  state.enabled = false;
  state.storedMode = undefined;
  state.departmentSettings = { '9': { autoReplyEnabled: false } };
  state.updates = [];
  state.mailboxesFail = false;
  state.freshTeams = undefined;
  state.readFails = false;
  state.loadFails = false;
  state.holdSave = null;
});
afterEach(cleanup);

const show = async () => {
  render(<AutoReplyConfiguration onShowAlert={() => {}} />);
  await screen.findByText('Default');
};
const workspaceSwitch = () => screen.getAllByRole('switch')[0];
const dialog = () => within(screen.getByRole('dialog'));
/** The workspace's own "What replies on its own" (teams have one each). */
const choice = () => within(screen.getByRole('group', { name: 'What replies on its own' }));
const mailboxList = async () =>
  (await dialog().findByRole('list', { name: 'Mailboxes that send automatic replies' }))
    .textContent;

describe('the first time automatic replies are switched on', () => {
  it('asks first, names the mailboxes that may send, and says AI replies are a separate choice', async () => {
    await show();
    fireEvent.click(workspaceSwitch());
    const list = await mailboxList();
    // A switch on for at least one team, or linked to no team at all: it can send.
    for (const present of ['help@', 'sales@', 'billing@']) expect(list).toContain(present);
    // Every switch it has is off (it sends nothing, also for a thread of no team), disabled, or
    // not a mailbox.
    for (const absent of ['noreply@', 'old@', 'shop_bot']) expect(list).not.toContain(absent);
    expect(
      dialog().getByText(
        '1 other mailbox has the "Automatic replies" switch off for every team it is linked to and sends nothing.'
      )
    ).toBeInTheDocument();
    expect(dialog().queryByText(/still replies on threads/)).toBeNull();
    expect(dialog().getByText(/Your keyword rules will be emailed/)).toBeInTheDocument();
    expect(dialog().getByText(/The AI.s own replies stay off/)).toBeInTheDocument();
    // "Keyword rules only" is not "nothing from the knowledge base".
    expect(
      dialog().getByText(
        /A keyword rule that adds a knowledge base answer .* does send that answer/
      )
    ).toBeInTheDocument();
    expect(
      dialog().getByText(/This covers email only: Telegram bots and website chat widgets/)
    ).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });

  it('confirmed: saved as keyword rules only, together with the switch', async () => {
    await show();
    fireEvent.click(workspaceSwitch());
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'rules_only' }]));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      await within(
        await screen.findByRole('group', { name: 'What replies on its own' })
      ).findByRole('button', { name: 'Keyword rules only', pressed: true })
    ).toBeInTheDocument();
  });

  it('cancelled: nothing is saved and the switch stays off', async () => {
    await show();
    fireEvent.click(workspaceSwitch());
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.updates).toEqual([]);
    expect(workspaceSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('names a team whose own choice lets the AI reply', async () => {
    state.departmentSettings = { '7': { autoReplyMode: 'all' } };
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await dialog().findByText(/Except for Billing/)).toBeInTheDocument();
  });

  it('a mailbox list that cannot be read blocks the switch; "Try again" reads it and unblocks', async () => {
    state.mailboxesFail = true;
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await dialog().findByRole('alert')).toHaveTextContent(
      /could not be read, so nothing is/
    );
    expect(dialog().queryByRole('button', { name: 'Switch on' })).toBeNull();
    expect(state.updates).toEqual([]);
    state.mailboxesFail = false;
    fireEvent.click(dialog().getByRole('button', { name: 'Try again' }));
    expect(await mailboxList()).toContain('help@shop.example');
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'rules_only' }]));
  });

  it('nothing can be confirmed while the mailboxes are still being read', async () => {
    await show();
    fireEvent.click(workspaceSwitch());
    // Synchronously after the press: the read has not answered yet.
    expect(dialog().getByRole('status')).toHaveTextContent('Reading your mailboxes');
    expect(dialog().queryByRole('button', { name: 'Switch on' })).toBeNull();
    expect(await mailboxList()).toContain('help@shop.example');
  });
});

describe('switching on again with a stored choice', () => {
  it('"keyword rules and AI replies": says both will send, and keeps the choice', async () => {
    state.storedMode = 'all';
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await mailboxList()).toContain('help@shop.example');
    expect(dialog().getByText(/keyword rules AND AI-written answers/)).toBeInTheDocument();
    expect(dialog().queryByText(/The AI.s own replies stay off/)).toBeNull();
    expect(state.updates).toEqual([]);
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    // Saved WITH the choice the dialog named, not the switch alone.
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'all' }]));
  });

  it('"keyword rules only": keeps the choice', async () => {
    state.storedMode = 'rules_only';
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await dialog().findByText(/The AI.s own replies stay off/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'rules_only' }]));
  });
});

describe('letting the AI reply', () => {
  beforeEach(() => {
    state.enabled = true;
    state.storedMode = 'rules_only';
  });

  it('asks first, naming the mailboxes; confirmed saves { mode: all }', async () => {
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(await mailboxList()).toContain('sales@shop.example');
    expect(dialog().getByText(/AI-written answers from your knowledge base/)).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    fireEvent.click(dialog().getByRole('button', { name: 'Let the AI reply' }));
    await waitFor(() => expect(state.updates).toEqual([{ mode: 'all' }]));
  });

  it('cancelled: the choice stays keyword rules only', async () => {
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules and AI replies' }));
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(state.updates).toEqual([]);
    expect(
      choice().getByRole('button', { name: 'Keyword rules only', pressed: true })
    ).toBeInTheDocument();
  });
});

describe('CONTROL: switching off, and back to keyword rules only, ask nothing', () => {
  it('off is saved at once', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    await show();
    fireEvent.click(workspaceSwitch());
    await waitFor(() => expect(state.updates).toEqual([{ enabled: false }]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keyword rules only is saved at once', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    await show();
    fireEvent.click(choice().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() => expect(state.updates).toEqual([{ mode: 'rules_only' }]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("a team's own setting", () => {
  const team = () =>
    within(screen.getByRole('group', { name: 'What replies on its own for Billing' }));
  const teamUpdate = () =>
    (state.updates.at(-1) as { departmentSettings?: Record<string, unknown> } | undefined)
      ?.departmentSettings;

  it('"Override: on" while the workspace is off: asks first, naming that team’s mailboxes only', async () => {
    state.storedMode = 'rules_only';
    state.departmentSettings = {};
    await show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Override: on' })[0]);
    expect(
      dialog().getByText('Switch on automatic email replies for Billing?')
    ).toBeInTheDocument();
    const list = await mailboxList();
    // Linked to Billing with the switch on; or not linked to Billing, with a switch on somewhere
    // or no link at all (a thread of Billing's from such a mailbox is answered).
    for (const present of ['help@', 'sales@', 'billing@']) expect(list).toContain(present);
    // Linked to Billing with the switch off.
    expect(list).not.toContain('noreply@');
    expect(
      dialog().getByText(
        '1 other mailbox has the "Automatic replies" switch off for Billing and sends nothing for this team.'
      )
    ).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(teamUpdate()).toEqual({ '7': { autoReplyEnabled: true } }));
  });

  it('switched on before the workspace ever chose what replies: saved as keyword rules only', async () => {
    state.departmentSettings = {};
    await show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Override: on' })[0]);
    expect(await dialog().findByText(/The AI.s own replies stay off/)).toBeInTheDocument();
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() =>
      expect(teamUpdate()).toEqual({ '7': { autoReplyEnabled: true, autoReplyMode: 'rules_only' } })
    );
  });

  it('cancelled: the team stays as it was', async () => {
    state.storedMode = 'rules_only';
    state.departmentSettings = {};
    await show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Override: on' })[0]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(state.updates).toEqual([]);
  });

  it('"Keyword rules and AI replies" for the team: asks first; confirmed saves the team’s choice', async () => {
    state.enabled = true;
    state.storedMode = 'rules_only';
    state.departmentSettings = {};
    await show();
    fireEvent.click(team().getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(dialog().getByText('Let the AI reply on its own for Billing?')).toBeInTheDocument();
    expect(await mailboxList()).toContain('help@shop.example');
    expect(state.updates).toEqual([]);
    fireEvent.click(dialog().getByRole('button', { name: 'Let the AI reply' }));
    await waitFor(() => expect(teamUpdate()).toEqual({ '7': { autoReplyMode: 'all' } }));
  });

  it('CONTROL: switching a team off, or to keyword rules only, asks nothing', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    state.departmentSettings = {};
    await show();
    fireEvent.click(team().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() => expect(teamUpdate()).toEqual({ '7': { autoReplyMode: 'rules_only' } }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Override: off' })[0]);
    await waitFor(() =>
      expect(teamUpdate()).toEqual({
        '7': { autoReplyMode: 'rules_only', autoReplyEnabled: false },
      })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CONTROL: "Override: on" for a team that already sends (workspace on) asks nothing', async () => {
    state.enabled = true;
    state.storedMode = 'rules_only';
    state.departmentSettings = {};
    await show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Override: on' })[0]);
    await waitFor(() => expect(teamUpdate()).toEqual({ '7': { autoReplyEnabled: true } }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('"Reset all overrides" for a team', () => {
  const reset = () => screen.getByRole('button', { name: 'Reset all overrides for Billing' });
  const lastTeams = () =>
    (state.updates.at(-1) as { departmentSettings?: Record<string, unknown> } | undefined)
      ?.departmentSettings;

  it('a team that was switched off under an enabled workspace: asks before it starts sending', async () => {
    state.enabled = true;
    state.storedMode = 'rules_only';
    state.departmentSettings = { '7': { autoReplyEnabled: false } };
    await show();
    fireEvent.click(reset());
    expect(
      dialog().getByText('Switch on automatic email replies for Billing?')
    ).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(lastTeams()).toEqual({}));
  });

  it('a team on keyword rules only under a workspace that lets the AI reply: asks first', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    state.departmentSettings = { '7': { autoReplyMode: 'rules_only' } };
    await show();
    fireEvent.click(reset());
    expect(dialog().getByText('Let the AI reply on its own for Billing?')).toBeInTheDocument();
    fireEvent.click(await dialog().findByRole('button', { name: 'Cancel' }));
    expect(state.updates).toEqual([]);
  });

  it('CONTROL: a reset that starts nothing is saved at once', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    state.departmentSettings = { '7': { autoReplyHighConfidenceThreshold: 0.95 } };
    await show();
    fireEvent.click(reset());
    await waitFor(() => expect(lastTeams()).toEqual({}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a team save is built on what is stored now, not on this page’s copy', () => {
  const lastTeams = () =>
    (state.updates.at(-1) as { departmentSettings?: Record<string, unknown> } | undefined)
      ?.departmentSettings;
  const billing = () =>
    within(screen.getByRole('group', { name: 'What replies on its own for Billing' }));

  it('a team another admin switched off meanwhile stays off', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    // The page was opened when Returns had no override…
    state.departmentSettings = {};
    await show();
    // …and another admin has switched Returns off since.
    state.freshTeams = { '9': { autoReplyEnabled: false } };
    fireEvent.click(billing().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() =>
      expect(lastTeams()).toEqual({
        '9': { autoReplyEnabled: false },
        '7': { autoReplyMode: 'rules_only' },
      })
    );
  });

  it('when what is stored cannot be read, nothing is saved', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    state.departmentSettings = {};
    await show();
    state.readFails = true;
    fireEvent.click(billing().getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() =>
      expect(billing().getByRole('button', { name: 'Keyword rules only' })).not.toBeInactive()
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.updates).toEqual([]);
  });
});

describe('settings that could not be read', () => {
  it('offer no switch at all, only a retry — which shows the card once the read succeeds', async () => {
    state.loadFails = true;
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing can be changed here/);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Override: on' })).toBeNull();
    state.loadFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Default');
    expect(workspaceSwitch().getAttribute('aria-checked')).toBe('false');
    // …and the first-enable rule holds after the retry.
    fireEvent.click(workspaceSwitch());
    fireEvent.click(await dialog().findByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'rules_only' }]));
  });
});

describe('while the workspace’s own save is out', () => {
  it('a team’s controls are off, so a team cannot start sending on an unsettled default', async () => {
    state.enabled = true;
    state.storedMode = 'all';
    state.departmentSettings = { '7': { autoReplyEnabled: false } };
    await show();
    state.holdSave = () => {};
    // The workspace is being switched off; the answer has not come back.
    fireEvent.click(workspaceSwitch());
    await waitFor(() => expect(state.updates).toEqual([{ enabled: false }]));
    const inherit = screen.getAllByRole('button', { name: /Inherit default/ })[0];
    expect(inherit).toBeInactive();
    fireEvent.click(inherit);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.updates).toHaveLength(1);
    // CONTROL: once it is saved, the team's controls work again.
    state.holdSave();
    state.holdSave = null;
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Inherit default/ })[0]).not.toBeInactive()
    );
  });
});

describe('opening the confirmation again', () => {
  it('starts from "reading", never from the previous opening’s list', async () => {
    await show();
    fireEvent.click(workspaceSwitch());
    await mailboxList();
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    fireEvent.click(workspaceSwitch());
    expect(dialog().getByRole('status')).toHaveTextContent('Reading your mailboxes');
    expect(dialog().queryByRole('button', { name: 'Switch on' })).toBeNull();
    expect(dialog().queryByRole('list')).toBeNull();
  });
});
