/**
 * Restricted topics of teams the page has no row for (a switched-off or deleted team, or any team
 * while teams are off): the send gate keeps applying them, so they are always listed and can be
 * removed. And who may change topics at all: a workspace admin; anyone else reads them.
 */
import {
  BILLING,
  TEAM,
  WORKSPACE,
  sentTopicLists,
  show,
  state,
  topicsOf,
} from './restrictedTopics.testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

const OTHER = 'Topics kept for other teams';
const ADMIN_ONLY = 'Only a workspace admin can change restricted topics.';
const OLD_TEAM = { id: 3, name: 'Returns', slug: 'returns', active: false };

describe('restricted topics — teams that have no row on the page', () => {
  it('a switched-off and a deleted team are listed with their topics, and a topic can be removed', async () => {
    state.departments = [BILLING, OLD_TEAM];
    state.teams = {
      '3': { restrictedTopics: ['chargebacks', 'warranty claims'] },
      '5': { restrictedTopics: ['press requests'] },
      '6': { restrictedTopics: ['press requests'] },
      '7': { restrictedTopics: ['contract changes'] },
    };
    show();
    const other = await screen.findByRole('list', { name: OTHER });
    // Billing has its own row, so it is not repeated here.
    expect(within(other).queryByText('Billing')).toBeNull();
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    expect(topicsOf('Returns restricted topics')).toEqual(['chargebacks', 'warranty claims']);
    // Two deleted teams are told apart by their id.
    expect(topicsOf('Deleted team #5 restricted topics')).toEqual(['press requests']);
    expect(topicsOf('Deleted team #6 restricted topics')).toEqual(['press requests']);
    // "inactive" marks the switched-off team only; nothing can be added to either.
    expect(within(other).getAllByText('Inactive')).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: /Add to (Returns|Deleted team)/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove topic chargebacks from Returns' }));
    await waitFor(() => expect(topicsOf('Returns restricted topics')).toEqual(['warranty claims']));
    expect(state.updates).toEqual([
      { restrictedTopicsChange: { scope: 'team', departmentId: 3, remove: ['chargebacks'] } },
    ]);

    // The last topic removed: the team leaves the list.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove topic press requests from Deleted team #5' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Deleted team #5 restricted topics' })).toBeNull()
    );
    expect(topicsOf('Returns restricted topics')).toEqual(['warranty claims']);
    expect(topicsOf('Deleted team #6 restricted topics')).toEqual(['press requests']);
    expect(sentTopicLists()).toEqual([]);
  });

  it('a topic someone else removed meanwhile (404): the lists are read again, no stale chip stays', async () => {
    state.teams = { '5': { restrictedTopics: ['press requests'] } };
    show();
    await screen.findByRole('list', { name: OTHER });
    // Meanwhile, elsewhere: the deleted team's last topic was removed.
    state.teams = {};
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove topic press requests from Deleted team #5' })
    );
    await waitFor(() => expect(screen.queryByRole('list', { name: OTHER })).toBeNull());
    expect(state.alerts.at(-1)?.title).toBe('Save failed');
  });

  it('a backend that does not list the teams yet: no such list, the rest of the card as before', async () => {
    state.listsTeams = false;
    state.departments = [BILLING, OLD_TEAM];
    state.teams = {
      '3': { restrictedTopics: ['chargebacks'] },
      '7': { restrictedTopics: ['contract changes'] },
    };
    show();
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['contract changes']));
    expect(screen.queryByText(OTHER)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic contract changes' }));
    await waitFor(() => expect(topicsOf(TEAM)).toEqual(['No extra topics']));
    expect(screen.queryByText(OTHER)).toBeNull();
  });

  it('teams off: an active team that only has topics stays listed, and they can be removed', async () => {
    state.teamsMode = false;
    state.teams = { '7': { restrictedTopics: ['contract changes'] } };
    show();
    await screen.findByRole('list', { name: OTHER });
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    expect(screen.queryByText('Inactive')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove topic contract changes from Billing' })
    );
    await waitFor(() => expect(screen.queryByRole('list', { name: OTHER })).toBeNull());
    expect(state.teams).toEqual({ '7': { restrictedTopics: [] } });
  });

  it('CONTROL — no team has stored topics: the list is not shown', async () => {
    show();
    await screen.findByRole('list', { name: WORKSPACE });
    expect(screen.queryByText(OTHER)).toBeNull();
  });
});

describe('restricted topics — someone who is not a workspace admin', () => {
  beforeEach(() => {
    state.orgAdmin = false;
    state.departments = [BILLING, OLD_TEAM];
    state.topics = ['refund disputes'];
    state.teams = {
      '3': { restrictedTopics: ['chargebacks'] },
      '7': { restrictedTopics: ['contract changes'] },
    };
  });

  it('a moderator reads every list, has no add or remove control, and is told why once', async () => {
    show();
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']));
    expect(topicsOf(TEAM)).toEqual(['contract changes']);
    expect(topicsOf('Returns restricted topics')).toEqual(['chargebacks']);
    expect(screen.getAllByText(ADMIN_ONLY)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Remove topic/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /restricted topics/ })).toBeNull();
    // The rest of the card is still theirs to change.
    expect(screen.getByRole('button', { name: 'Override: on' })).not.toBeInactive();
  });

  it('CONTROL — a workspace admin has the controls and no such line', async () => {
    state.orgAdmin = true;
    show();
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']));
    expect(screen.queryByText(ADMIN_ONLY)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Remove topic/ })).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: `Add to ${WORKSPACE}` })).toBeInTheDocument();
  });

  it('a 403 ROLE_REQUIRED answer (the role changed meanwhile) shows that sentence, not a generic failure', async () => {
    state.orgAdmin = true;
    show();
    await waitFor(() => expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']));
    state.orgAdmin = false;
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic refund disputes' }));
    await waitFor(() => expect(state.alerts.at(-1)?.description).toBe(ADMIN_ONLY));
    expect(state.alerts.at(-1)?.title).toBe('Save failed');
    expect(topicsOf(WORKSPACE)).toEqual(['refund disputes']);
  });

  it('without the permission to change the card: the other teams are listed read-only too', async () => {
    state.canManage = false;
    show();
    await waitFor(() => expect(topicsOf('Returns restricted topics')).toEqual(['chargebacks']));
    expect(
      within(screen.getByRole('list', { name: OTHER })).getByText('Inactive')
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
