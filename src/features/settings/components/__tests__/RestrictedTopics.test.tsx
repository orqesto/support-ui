/**
 * Restricted topics (send gate, 2026-11-20). The built-in topics come from the backend and cannot
 * be removed. A topic is added or removed by sending ONLY that change (`restrictedTopicsChange`);
 * no save of this card sends a list of topics, so a page opened a while ago cannot erase what
 * someone else added, and after every save the lists shown are the ones the server answered with.
 * The stand-in server below behaves as the backend's PATCH does. Invented data.
 */
import {
  BILLING,
  BUILT_IN,
  SALES,
  TEAM,
  WORKSPACE,
  add,
  refusal,
  sentTopicLists,
  show,
  state,
  topicsOf,
  type Team,
} from './restrictedTopics.testkit';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { restrictedTopicProblem } from '../restrictedTopics';

describe('restricted topics — the workspace list', () => {
  it('the built-in topics come first, with no remove control and an "always on" note', async () => {
    state.topics = ['refund disputes'];
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
    const own = screen.getByRole('list', { name: WORKSPACE });
    expect(builtIn.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText(
        /Subjects the AI never answers on its own\. A customer message about one of them is always handed to a person, even when a reply could be written\. Topics are understood by their meaning, in any language; they are not matched as exact words\. Keyword rules and Telegram template replies are not sent on these subjects either\./
      )
    ).toBeInTheDocument();
  });

  it('adding sends ONLY the added topic, trimmed; removing sends ONLY the removed one', async () => {
    state.topics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, '  press requests  ');
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['refund disputes', 'press requests']));
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic refund disputes' }));
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['press requests']));
    expect(state.updates).toEqual([
      { restrictedTopicsChange: { scope: 'workspace', add: ['press requests'] } },
      { restrictedTopicsChange: { scope: 'workspace', remove: ['refund disputes'] } },
    ]);
    expect(state.alerts[0]).toEqual({
      open: true,
      title: 'Saved',
      description: 'Restricted topics updated',
      variant: 'success',
    });
  });

  it('a page opened a while ago erases nothing: what another admin added meanwhile is kept and shown', async () => {
    state.topics = ['refund disputes'];
    state.teams = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    // Someone else saves while this page stays open.
    state.topics = ['refund disputes', 'added elsewhere'];
    state.teams = { '7': { restrictedTopics: ['contract changes', 'team topic elsewhere'] } };
    add(WORKSPACE, 'press requests');
    await waitFor(() =>
      expect(topicsOf(WORKSPACE)).toEqual(['refund disputes', 'added elsewhere', 'press requests'])
    );
    expect(topicsOf(TEAM)).toEqual(['contract changes', 'team topic elsewhere']);
    // A save of another setting of the card shows the stored lists too, and sends none.
    state.topics = [...state.topics, 'added later'];
    fireEvent.click(screen.getByRole('button', { name: 'Override: on' }));
    await waitFor(() => expect(topicsOf(WORKSPACE)).toContain('added later'));
    expect(state.topics).toEqual([
      'refund disputes',
      'added elsewhere',
      'press requests',
      'added later',
    ]);
    expect(sentTopicLists()).toEqual([]);
  });

  it.each([
    ['a repeat in another letter case', 'Refund Disputes', 'This topic is already on the list.'],
    ['a built-in topic by its name', 'dosing', 'This is one of the built-in topics.'],
    [
      'a topic over 200 characters',
      'x'.repeat(201),
      'A topic can be up to 200 characters (this one has 201).',
    ],
  ])('%s is refused before any save, and the text is kept', async (_name, topic, message) => {
    state.topics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, topic);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(state.updates).toEqual([]);
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue(topic);
  });

  it('CONTROL — exactly 200 characters is saved; a topic a team has may be added for everyone', async () => {
    state.teams = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'x'.repeat(200));
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['x'.repeat(200)]));
    add(WORKSPACE, 'Contract changes');
    await waitFor(() => expect(topicsOf(WORKSPACE)).toHaveLength(2));
    // Shown once: in the Default row, no longer among the team's extras.
    expect(topicsOf(TEAM)).toEqual(['No extra topics']);
  });

  it('the 51st topic is refused; blank text cannot be added', async () => {
    state.topics = Array.from({ length: 50 }, (_item, index) => `topic ${index + 1}`);
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

  it('a refused save shows the sentence the server wrote, keeps the list and keeps the typed topic', async () => {
    state.topics = ['refund disputes'];
    state.failWith = refusal('A restricted topic is listed twice.', ['restrictedTopicsChange']);
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    add(WORKSPACE, 'press requests');
    expect(await screen.findByText('A restricted topic is listed twice.')).toBeInTheDocument();
    expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']);
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toHaveValue(
      'press requests'
    );
    expect(state.alerts.map((alert) => alert.title)).toEqual(['Save failed']);
  });

  it("the built-in names are the backend's; a backend that sends none has none named", async () => {
    state.builtIn = [{ key: 'dosing', label: 'How much to take' }];
    const first = show();
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
    first.unmount();
    state.builtIn = [];
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    expect(screen.queryByRole('list', { name: 'Built-in restricted topics' })).toBeNull();
    expect(
      screen.getByText('Always on. The built-in topics cannot be removed.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Added to the built-in topics, which always apply to this team/)
    ).toBeInTheDocument();
  });

  it('an older backend (no list in the response): the section is not offered and no save sends a topics field', async () => {
    state.supported = false;
    state.teams = { '7': { autoReplyMode: 'rules_only' } };
    show();
    await screen.findByText('Request missing info');
    expect(screen.queryByText('Restricted topics')).toBeNull();
    expect(screen.queryByRole('list', { name: TEAM })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Override: on' }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    const workspace = within(screen.getByRole('group', { name: 'What replies on its own' }));
    fireEvent.click(workspace.getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() => expect(state.updates).toHaveLength(2));
    expect(JSON.stringify(state.updates)).not.toMatch(/restrictedTopics|RestrictedTopics/);
    expect(state.updates[0]).toEqual({
      departmentSettings: { '7': { autoReplyMode: 'rules_only', autoReplyEnabled: true } },
    });
  });
});

describe('restricted topics — a team adds its own', () => {
  it('says the built-in and workspace topics apply too, and offers no way to remove them', async () => {
    state.topics = ['refund disputes', 'press requests'];
    state.teams = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await screen.findByRole('list', { name: TEAM });
    expect(
      screen.getByText(
        "Added to the 4 built-in topics and the workspace's 2 topics, which always apply to this team and can only be changed in the Default row."
      )
    ).toBeInTheDocument();
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    expect(screen.getAllByRole('button', { name: 'Remove topic refund disputes' })).toHaveLength(1);
    // Extra topics alone override nothing of the default: no badge for it, nothing to reset.
    expect(screen.queryByText('Partial override')).toBeNull();
    expect(screen.getByText('Inherits default')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset all overrides for Billing' })).toBeNull();
  });

  it('adding and removing send ONLY the change for that team, never the team map', async () => {
    state.teams = {
      '3': { autoReplyEnabled: false, restrictedTopics: ['warranty claims'] },
      '7': { autoReplyMode: 'rules_only', escalationPhrases: ['lawyer'] },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'contract changes');
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['contract changes']));
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic contract changes' }));
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['No extra topics']));
    expect(state.updates).toEqual([
      { restrictedTopicsChange: { scope: 'team', departmentId: 7, add: ['contract changes'] } },
      { restrictedTopicsChange: { scope: 'team', departmentId: 7, remove: ['contract changes'] } },
    ]);
    // Nothing else of any team was touched.
    expect(state.teams).toEqual({
      '3': { autoReplyEnabled: false, restrictedTopics: ['warranty claims'] },
      '7': { autoReplyMode: 'rules_only', escalationPhrases: ['lawyer'], restrictedTopics: [] },
    });
  });

  it('a workspace topic or a built-in one is not added to a team', async () => {
    state.topics = ['refund disputes'];
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'REFUND disputes');
    expect(
      await screen.findByText('This is already a workspace topic, so it applies to this team.')
    ).toBeInTheDocument();
    add(TEAM, 'Diagnosis');
    expect(await screen.findByText('This is one of the built-in topics.')).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });

  it('a refused team save shows the server sentence and leaves the list as it was', async () => {
    state.teams = { '7': { autoReplyMode: 'rules_only' } };
    state.failWith = refusal('A list holds at most 50 restricted topics.', [
      'restrictedTopicsChange.add.0',
    ]);
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'contract changes');
    expect(
      await screen.findByText('A list holds at most 50 restricted topics.')
    ).toBeInTheDocument();
    expect(topicsOf(TEAM)).toEqual(['No extra topics']);
    expect(screen.getByRole('textbox', { name: `Add to ${TEAM}` })).toHaveValue('contract changes');
  });

  it('a team that is switched off or gone: a plain sentence, nothing changed', async () => {
    state.failWith = {
      response: { status: 404, data: { success: false, error: 'Team not found or inactive' } },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
    add(TEAM, 'contract changes');
    expect(
      await screen.findByText(
        'This team is switched off or no longer exists, so its restricted topics cannot be changed.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Team not found/)).toBeNull();
    expect(topicsOf(TEAM)).toEqual(['No extra topics']);
  });

  it('three clicks in a row (a topic for Billing, a Sales save, a Billing save) lose nothing', async () => {
    state.departments = [BILLING, SALES];
    state.held = [];
    show();
    await screen.findByRole('list', { name: TEAM });
    const overrideOn = () => screen.getAllByRole('button', { name: 'Override: on' });
    add(TEAM, 'chargebacks');
    await waitFor(() => expect(state.updates).toHaveLength(1));
    fireEvent.click(overrideOn()[1]); // Sales
    // Billing's own row is out of use while its save is in flight; Sales waits its turn.
    expect(overrideOn()[0]).toBeInactive();
    expect(state.updates).toHaveLength(1);
    const releaseAll = async (count: number) => {
      for (let done = 0; done < count; done += 1) {
        await waitFor(() => expect(state.held?.length).toBeGreaterThan(0));
        state.held?.shift()?.();
      }
    };
    await releaseAll(2);
    await waitFor(() => expect(overrideOn()[0]).not.toBeInactive());
    fireEvent.click(overrideOn()[0]); // Billing
    await releaseAll(1);
    await waitFor(() => expect(state.updates).toHaveLength(3));
    await waitFor(() => expect(screen.queryAllByText('Saving…')).toEqual([]));
    expect(state.updates).toEqual([
      { restrictedTopicsChange: { scope: 'team', departmentId: 7, add: ['chargebacks'] } },
      { departmentSettings: { '9': { autoReplyEnabled: true } } },
      { departmentSettings: { '7': { autoReplyEnabled: true }, '9': { autoReplyEnabled: true } } },
    ]);
    expect(state.teams).toEqual({
      '7': { autoReplyEnabled: true, restrictedTopics: ['chargebacks'] },
      '9': { autoReplyEnabled: true },
    });
    expect(topicsOf(TEAM)).toEqual(['chargebacks']);
  });
});

describe('the other saves of a team row keep its other settings and never send topics', () => {
  const OTHER = { autoReplyEnabled: false };
  const MINE = {
    autoReplyEnabled: true,
    autoReplyMode: 'rules_only',
    autoReplyHighConfidenceThreshold: 0.95,
    escalationPhrases: ['lawyer'],
  };
  const saved = async (team: Record<string, unknown> | null) => {
    await waitFor(() =>
      expect(state.updates).toEqual([
        { departmentSettings: { '3': OTHER, ...(team ? { '7': team } : {}) } },
      ])
    );
    // The topics are the server's to keep: still stored, still shown.
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['contract changes']));
    expect((state.teams as Record<string, Team>)['3'].restrictedTopics).toEqual([
      'warranty claims',
    ]);
    expect((state.teams as Record<string, Team>)['7'].restrictedTopics).toEqual([
      'contract changes',
    ]);
  };
  const open = async () => {
    state.teams = {
      '3': { ...OTHER, restrictedTopics: ['warranty claims'] },
      '7': { ...MINE, restrictedTopics: ['contract changes'] },
    };
    show();
    await screen.findByRole('list', { name: TEAM });
  };

  it('Override: off', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Override: off' }));
    await saved({ ...MINE, autoReplyEnabled: false });
  });

  it('Inherit default drops only that key', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Inherit default/ }));
    const { autoReplyEnabled: _dropped, ...rest } = MINE;
    await saved(rest);
  });

  it('the mode', async () => {
    await open();
    const choice = within(
      screen.getByRole('group', { name: 'What replies on its own for Billing' })
    );
    fireEvent.click(choice.getByRole('button', { name: 'Keyword rules and AI replies' }));
    await saved({ ...MINE, autoReplyMode: 'all' });
  });

  it('the confidence slider', async () => {
    await open();
    const slider = document.getElementById('dept-threshold-7') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '97' } });
    fireEvent.mouseUp(slider);
    await saved({ ...MINE, autoReplyHighConfidenceThreshold: 0.97 });
  });

  it('a phrase added', async () => {
    await open();
    const input = screen.getByPlaceholderText('e.g. "speak to a human", "urgent"');
    fireEvent.change(input, { target: { value: 'urgent' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await saved({ ...MINE, escalationPhrases: ['lawyer', 'urgent'] });
  });

  it('a phrase removed', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Remove phrase lawyer' }));
    await saved({ ...MINE, escalationPhrases: [] });
  });

  it('Reset drops the team row, says it keeps the extra topics, and they stay shown', async () => {
    await open();
    expect(
      screen.getByText("The reset keeps this team's extra restricted topics.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides for Billing' }));
    await saved(null);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reset all overrides for Billing' })).toBeNull()
    );
    // The server keeps a topics-only entry for the team: it is not an override.
    expect(state.teams).toMatchObject({ '7': { restrictedTopics: ['contract changes'] } });
    expect(screen.getByText('Inherits default')).toBeInTheDocument();
  });
});

describe('restricted topics — without the permission to change automatic reply settings', () => {
  it('the lists are read, and nothing can be added or removed', async () => {
    state.canManage = false;
    state.topics = ['refund disputes'];
    state.teams = { '7': { restrictedTopics: ['contract changes'] } };
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
    expect(restrictedTopicProblem('Dose', [], [], ['Dosing'])).toBeNull();
  });
});
