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
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutoReply: () =>
      Promise.resolve({
        enabled: state.enabled,
        mode: state.storedMode ?? 'all',
        requestMissingInfo: true,
        suggestSolutions: true,
        highConfidenceThreshold: 0.9,
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
      return Promise.resolve({ success: true });
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
    expect(list).toContain('help@shop.example');
    expect(list).toContain('sales@shop.example');
    // Switched off on its card, disabled, not a mailbox, or only for a team that is off.
    for (const absent of ['noreply@', 'old@', 'shop_bot', 'billing@'])
      expect(list).not.toContain(absent);
    expect(dialog().getByText(/2 other mailboxes have their own switch off/)).toBeInTheDocument();
    expect(dialog().getByText(/Your keyword rules will be emailed/)).toBeInTheDocument();
    expect(dialog().getByText(/AI-written replies stay off/)).toBeInTheDocument();
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

  it('a mailbox list that cannot be read is said so, and the switch can still be confirmed', async () => {
    state.mailboxesFail = true;
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await dialog().findByRole('alert')).toHaveTextContent(/could not be read/);
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true, mode: 'rules_only' }]));
  });
});

describe('switching on again with a stored choice', () => {
  it('"keyword rules and AI replies": says both will send, and keeps the choice', async () => {
    state.storedMode = 'all';
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await mailboxList()).toContain('help@shop.example');
    expect(dialog().getByText(/keyword rules AND AI-written answers/)).toBeInTheDocument();
    expect(dialog().queryByText(/AI-written replies stay off/)).toBeNull();
    expect(state.updates).toEqual([]);
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true }]));
  });

  it('"keyword rules only": keeps the choice', async () => {
    state.storedMode = 'rules_only';
    await show();
    fireEvent.click(workspaceSwitch());
    expect(await dialog().findByText(/AI-written replies stay off/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(state.updates).toEqual([{ enabled: true }]));
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
