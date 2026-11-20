/**
 * Restricted topics (send gate, 2026-11-20): the four built-in topics are shown and cannot be
 * removed; the workspace's own list saves `{ restrictedTopics }`; a team's list is ADDED to it and
 * saves the full team map without dropping anything; the limits of the backend's schema are
 * checked before the save; a refused save says what the server said and changes nothing; someone
 * without the permission reads the lists and can change none. Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  canManage: true,
  restrictedTopics: [] as string[] | undefined,
  builtIn: [] as { key: string; label: string }[] | undefined,
  departmentSettings: {} as Record<string, Record<string, unknown>>,
  updates: [] as unknown[],
  failWith: null as Record<string, unknown> | null,
  alerts: [] as { title: string; description?: string; variant?: string }[],
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutoReply: () =>
      Promise.resolve({
        enabled: true,
        mode: 'all',
        requestMissingInfo: true,
        suggestSolutions: true,
        highConfidenceThreshold: 0.9,
        partialAnswer: 'hand_to_agent',
        restrictedTopics: state.restrictedTopics ?? null,
        builtInRestrictedTopics: state.builtIn ?? [],
      }),
    getCurrent: () =>
      Promise.resolve({ settings: { departmentSettings: state.departmentSettings } }),
    updateAutoReply: (data: unknown) => {
      state.updates.push(data);
      return state.failWith
        ? Promise.reject(Object.assign(new Error('Request failed'), state.failWith))
        : Promise.resolve({ success: true });
    },
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [{ id: 7, name: 'Billing', slug: 'billing', active: true }],
    teamsEnabled: true,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: state.canManage, hasPermission: () => state.canManage }),
}));
vi.mock('../AutoReplyRulesSection', () => ({ AutoReplyRulesSection: () => null }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';
import { restrictedTopicProblem } from '../restrictedTopics';

/** What the backend returns as `builtInRestrictedTopics`; the labels are the backend's, not this app's. */
const BUILT_IN_FROM_API = [
  { key: 'dosing', label: 'Dosing' },
  { key: 'medical_advice', label: 'Medical or health advice' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'legal_tax_advice', label: 'Legal or tax advice' },
];
const BUILT_IN = BUILT_IN_FROM_API.map((topic) => topic.label);
const WORKSPACE = 'Workspace restricted topics';
const TEAM = 'Billing restricted topics';

beforeEach(() => {
  state.canManage = true;
  state.restrictedTopics = [];
  state.builtIn = BUILT_IN_FROM_API;
  state.departmentSettings = {};
  state.updates = [];
  state.failWith = null;
  state.alerts = [];
});
afterEach(cleanup);

const show = () =>
  render(<AutoReplyConfiguration onShowAlert={(alert) => state.alerts.push(alert)} />);
const add = (list: string, topic: string) => {
  const input = screen.getByRole('textbox', { name: `Add to ${list}` });
  fireEvent.change(input, { target: { value: topic } });
  fireEvent.keyDown(input, { key: 'Enter' });
};
const topicsOf = (list: string) =>
  within(screen.getByRole('list', { name: list }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent);

describe('restricted topics — the workspace list', () => {
  it('the four built-in topics come first, with no remove control and an "always on" note', async () => {
    state.restrictedTopics = ['refund disputes'];
    show();
    const builtIn = await screen.findByRole('list', { name: 'Built-in restricted topics' });
    expect(
      within(builtIn)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(BUILT_IN);
    expect(within(builtIn).queryAllByRole('button')).toEqual([]);
    for (const topic of BUILT_IN) {
      expect(screen.queryByRole('button', { name: `Remove topic ${topic}` })).toBeNull();
    }
    expect(
      screen.getByText('Always on. The built-in topics cannot be removed.')
    ).toBeInTheDocument();
    // CONTROL — the workspace's own topic does have one.
    expect(screen.getByRole('button', { name: 'Remove topic refund disputes' })).not.toBeInactive();
    // The built-in list sits above the workspace's own.
    const own = screen.getByRole('list', { name: WORKSPACE });
    expect(builtIn.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says in plain words what a topic does, and that rules and Telegram templates hold too', async () => {
    show();
    expect(
      await screen.findByText(
        /Subjects the AI never answers on its own\. A customer message about one of them is always handed to a person, even when a reply could be written\. Topics are understood by their meaning, in any language; they are not matched as exact words\. Keyword rules and Telegram template replies are not sent on these subjects either\./
      )
    ).toBeInTheDocument();
  });

  it('adding saves the whole list, trimmed, and never the built-in topics', async () => {
    state.restrictedTopics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, '  press requests  ');
    await waitFor(() =>
      expect(state.updates).toEqual([{ restrictedTopics: ['refund disputes', 'press requests'] }])
    );
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['refund disputes', 'press requests']));
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue('');
    expect(state.alerts).toEqual([
      { open: true, title: 'Saved', description: 'Restricted topics updated', variant: 'success' },
    ]);
  });

  it('the Add button saves too, and removing saves the list without the topic', async () => {
    state.restrictedTopics = ['refund disputes'];
    show();
    const input = await screen.findByRole('textbox', { name: `Add to ${WORKSPACE}` });
    fireEvent.change(input, { target: { value: 'press requests' } });
    const row = input.closest('div.flex') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(topicsOf(WORKSPACE)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic refund disputes' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { restrictedTopics: ['refund disputes', 'press requests'] },
        { restrictedTopics: ['press requests'] },
      ])
    );
  });

  it.each([
    ['a repeat in another letter case', 'Refund Disputes', 'This topic is already on the list.'],
    [
      'a topic over 200 characters',
      'x'.repeat(201),
      'A topic can be up to 200 characters (this one has 201).',
    ],
  ])('%s is refused before any save, and the text is kept', async (_name, topic, message) => {
    state.restrictedTopics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, topic);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue(topic);
  });

  it('CONTROL — exactly 200 characters is saved', async () => {
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'x'.repeat(200));
    await waitFor(() => expect(state.updates).toEqual([{ restrictedTopics: ['x'.repeat(200)] }]));
  });

  it('the 51st topic is refused; blank text cannot be added', async () => {
    state.restrictedTopics = Array.from({ length: 50 }, (_item, index) => `topic ${index + 1}`);
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'one more');
    expect(
      await screen.findByText('A list can hold up to 50 topics. Remove one first.')
    ).toBeInTheDocument();
    add(WORKSPACE, '   ');
    expect(await screen.findByText('Type a topic first.')).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });

  it('a refused save shows what the server said, keeps the list and keeps the typed topic', async () => {
    state.restrictedTopics = ['refund disputes'];
    state.failWith = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          error: 'A restricted topic is listed twice.',
          code: 'VALIDATION_FAILED',
          fields: ['restrictedTopics'],
        },
      },
    };
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'press requests');
    expect(await screen.findByText('A restricted topic is listed twice.')).toBeInTheDocument();
    expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']);
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue(
      'press requests'
    );
    expect(state.alerts.map((alert) => alert.title)).toEqual(['Save failed']);
    // The rollback is real: a later save of another setting does not bring the refused topic back.
    state.failWith = null;
    const workspace = within(screen.getByRole('group', { name: 'What replies on its own' }));
    fireEvent.click(workspace.getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() => expect(state.updates[1]).toEqual({ mode: 'rules_only' }));
    await screen.findAllByText(/do not apply in "Keyword rules only"/);
    expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']);
  });

  it("the built-in names are the backend's: other labels are shown as sent, and a save never sends them", async () => {
    state.builtIn = [{ key: 'dosing', label: 'How much to take' }];
    show();
    const builtIn = await screen.findByRole('list', { name: 'Built-in restricted topics' });
    expect(
      within(builtIn)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['How much to take']);
    expect(screen.queryByText('Diagnosis')).toBeNull();
    expect(
      screen.getByText(/^Added to the 1 built-in topics, which always apply to this team/)
    ).toBeInTheDocument();
    add(WORKSPACE, 'press requests');
    await waitFor(() => expect(state.updates).toEqual([{ restrictedTopics: ['press requests'] }]));
    add(TEAM, 'contract changes');
    await waitFor(() =>
      expect(state.updates[1]).toEqual({
        departmentSettings: { '7': { restrictedTopics: ['contract changes'] } },
      })
    );
  });

  it('a backend that sends no built-in topics: none is named, the note still says they are always on', async () => {
    state.builtIn = undefined;
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    expect(screen.queryByRole('list', { name: 'Built-in restricted topics' })).toBeNull();
    expect(screen.queryByText('Dosing')).toBeNull();
    expect(
      screen.getByText('Always on. The built-in topics cannot be removed.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Added to the built-in topics, which always apply to this team/)
    ).toBeInTheDocument();
  });

  it('a refusal that is not about the topics keeps the usual wording, fields named', async () => {
    state.failWith = {
      response: {
        status: 400,
        data: {
          success: false,
          error: 'Validation error',
          code: 'VALIDATION_FAILED',
          fields: ['mode'],
        },
      },
    };
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'press requests');
    expect(await screen.findByText('Validation error (check: mode)')).toBeInTheDocument();
  });

  it('an older backend (no list in the response): the section is not offered', async () => {
    state.restrictedTopics = undefined;
    show();
    await screen.findByText('Request missing info');
    expect(screen.queryByText('Restricted topics')).toBeNull();
    expect(screen.queryByRole('list', { name: TEAM })).toBeNull();
  });
});

describe('restricted topics — a team adds its own', () => {
  it('says the built-in and workspace topics apply too, and offers no way to remove them', async () => {
    state.restrictedTopics = ['refund disputes', 'press requests'];
    state.departmentSettings = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await screen.findByRole('list', { name: TEAM });
    expect(
      screen.getByText(
        "Added to the 4 built-in topics and the workspace's 2 topics, which always apply to this team and can only be changed in the Default row."
      )
    ).toBeInTheDocument();
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    // One remove control per workspace topic (the Default row's), none in the team row.
    expect(screen.getAllByRole('button', { name: 'Remove topic refund disputes' })).toHaveLength(1);
    expect(screen.getByText('Partial override')).toBeInTheDocument();
  });

  it("adding keeps the team's other settings and every other team's settings", async () => {
    state.departmentSettings = {
      '3': { autoReplyEnabled: false, restrictedTopics: ['warranty claims'] },
      '7': { autoReplyMode: 'rules_only', escalationPhrases: ['lawyer'] },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'contract changes');
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          departmentSettings: {
            '3': { autoReplyEnabled: false, restrictedTopics: ['warranty claims'] },
            '7': {
              autoReplyMode: 'rules_only',
              escalationPhrases: ['lawyer'],
              restrictedTopics: ['contract changes'],
            },
          },
        },
      ])
    );
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['contract changes']));
  });

  it('removing the last topic drops the key and keeps the rest of the team row', async () => {
    state.departmentSettings = {
      '3': { autoReplyEnabled: false },
      '7': { autoReplyMode: 'rules_only', restrictedTopics: ['contract changes'] },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic contract changes' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          departmentSettings: {
            '3': { autoReplyEnabled: false },
            '7': { autoReplyMode: 'rules_only' },
          },
        },
      ])
    );
  });

  it('removing the only override removes the team row, not the other teams', async () => {
    state.departmentSettings = {
      '3': { autoReplyEnabled: false },
      '7': { restrictedTopics: ['contract changes'] },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic contract changes' }));
    await waitFor(() =>
      expect(state.updates).toEqual([{ departmentSettings: { '3': { autoReplyEnabled: false } } }])
    );
  });

  it('a workspace topic is not added to a team twice', async () => {
    state.restrictedTopics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'REFUND disputes');
    expect(
      await screen.findByText('This is already a workspace topic, so it applies to this team.')
    ).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });

  it('a refused team save rolls back: the list is unchanged and the next save does not carry it', async () => {
    state.departmentSettings = { '7': { autoReplyMode: 'rules_only' } };
    state.failWith = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          error: 'A list holds at most 50 restricted topics.',
          code: 'VALIDATION_FAILED',
          fields: ['departmentSettings.7.restrictedTopics'],
        },
      },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'contract changes');
    expect(
      await screen.findByText('A list holds at most 50 restricted topics.')
    ).toBeInTheDocument();
    expect(topicsOf(TEAM)).toEqual(['No extra topics']);
    // The rollback is real: the team's next save of another setting does not carry the topic.
    state.failWith = null;
    const choice = within(
      screen.getByRole('group', { name: 'What replies on its own for Billing' })
    );
    fireEvent.click(choice.getByRole('button', { name: 'Keyword rules and AI replies' }));
    await waitFor(() =>
      expect(state.updates[1]).toEqual({ departmentSettings: { '7': { autoReplyMode: 'all' } } })
    );
  });
});

describe('restricted topics — without the permission to change automatic reply settings', () => {
  it('the lists are read, and nothing can be added or removed', async () => {
    state.canManage = false;
    state.restrictedTopics = ['refund disputes'];
    state.departmentSettings = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await waitFor(() =>
      expect(topicsOf('Restricted topics')).toEqual([...BUILT_IN, 'refund disputes'])
    );
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    expect(screen.getByText('Billing also:')).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(
      screen.getByText(/Only workspace admins and moderators can change automatic reply settings\./)
    ).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });
});

describe('restrictedTopicProblem — the limits of the backend schema', () => {
  const fifty = Array.from({ length: 50 }, (_item, index) => `topic ${index + 1}`);
  it.each([
    ['', [], [], 'Type a topic first.'],
    ['   ', [], [], 'Type a topic first.'],
    [' Refunds ', ['refunds'], [], 'This topic is already on the list.'],
    ['one more', fifty, [], 'A list can hold up to 50 topics. Remove one first.'],
  ])('"%s" is refused', (draft, own, also, message) => {
    expect(restrictedTopicProblem(draft, own, also)).toBe(message);
  });

  it('CONTROL — a new topic within every limit is accepted (200 characters after trimming)', () => {
    expect(restrictedTopicProblem(` ${'x'.repeat(200)} `, fifty.slice(0, 49))).toBeNull();
    // A team's list is counted on its own: 49 of its own beside a full workspace list.
    expect(restrictedTopicProblem('one more', fifty.slice(0, 49), fifty)).toBeNull();
  });
});
