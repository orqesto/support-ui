/**
 * Teams off ⇒ a saved / URL Team filter is reset to "all" (neither sent nor counted). "Needs
 * routing" is not a team and stays. Unknown (list loading or failed) resets nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  teamsEnabled: false as boolean | undefined | null,
  data: [{ id: 1, name: 'General', active: true }] as unknown[] | undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: state.data, teamsEnabled: state.teamsEnabled }),
}));

const { useDropTeamFilterWhenTeamsOff } = await import('../useDropTeamFilterWhenTeamsOff');
const { useMessagesStore } = await import('@/stores/messagesStore');

const setTeamFilter = (value: string) =>
  useMessagesStore.getState().updateFilter('departmentId', value);
const teamFilter = () => useMessagesStore.getState().filters.departmentId;

beforeEach(() => {
  state.teamsEnabled = false;
  state.data = [{ id: 1, name: 'General', active: true }];
});

describe('useDropTeamFilterWhenTeamsOff', () => {
  it('teams off: a stored team filter goes back to "all"', () => {
    setTeamFilter('7');
    renderHook(() => useDropTeamFilterWhenTeamsOff());
    expect(teamFilter()).toBe('all');
  });

  it('teams off: "Needs routing" is kept', () => {
    setTeamFilter('needs_routing');
    renderHook(() => useDropTeamFilterWhenTeamsOff());
    expect(teamFilter()).toBe('needs_routing');
  });

  it('CONTROL: teams on keeps the team filter', () => {
    state.teamsEnabled = true;
    setTeamFilter('7');
    renderHook(() => useDropTeamFilterWhenTeamsOff());
    expect(teamFilter()).toBe('7');
  });

  it('CONTROL: unknown (list loading or failed) resets nothing', () => {
    state.teamsEnabled = null;
    state.data = undefined;
    setTeamFilter('7');
    renderHook(() => useDropTeamFilterWhenTeamsOff());
    expect(teamFilter()).toBe('7');
  });
});
