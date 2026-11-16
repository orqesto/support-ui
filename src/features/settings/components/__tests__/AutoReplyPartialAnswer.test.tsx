/**
 * Partial answers (per-question retrieval, owner 2026-11-16): when the AI can answer only some of
 * a customer's questions, the workspace — or a team — chooses "Hand to an agent" (default) or
 * "Send and follow up". The workspace choice saves `{ partialAnswer }`; a team's choice saves the
 * full map with `autoReplyPartialAnswer` set or dropped ("Same as workspace"). Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  partialAnswer: undefined as 'hand_to_agent' | 'send_and_follow_up' | undefined,
  departmentSettings: {} as Record<string, Record<string, unknown>>,
  updates: [] as unknown[],
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
        partialAnswer: state.partialAnswer ?? 'hand_to_agent',
      }),
    getCurrent: () =>
      Promise.resolve({ settings: { departmentSettings: state.departmentSettings } }),
    updateAutoReply: (data: unknown) => {
      state.updates.push(data);
      return Promise.resolve({ success: true });
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
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));
vi.mock('../AutoReplyRulesSection', () => ({ AutoReplyRulesSection: () => null }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';

const WORKSPACE = 'When the AI can answer only some questions';
const TEAM = 'When the AI can answer only some questions for Billing';

beforeEach(() => {
  state.partialAnswer = undefined;
  state.departmentSettings = {};
  state.updates = [];
});
afterEach(cleanup);

describe('AutoReplyConfiguration — partial answers', () => {
  it('the workspace default is "Hand to an agent"; choosing the other saves { partialAnswer }', async () => {
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = within(await screen.findByRole('group', { name: WORKSPACE }));
    expect(choice.getByRole('button', { name: 'Hand to an agent' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(choice.getByRole('button', { name: 'Send and follow up' }));
    await waitFor(() => expect(state.updates).toEqual([{ partialAnswer: 'send_and_follow_up' }]));
  });

  it('CONTROL: choosing the current value saves nothing', async () => {
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = within(await screen.findByRole('group', { name: WORKSPACE }));
    fireEvent.click(choice.getByRole('button', { name: 'Hand to an agent' }));
    expect(state.updates).toEqual([]);
  });

  it("a team's choice saves the full map with the key set, and 'Same as workspace' drops it", async () => {
    state.departmentSettings = { 7: { autoReplyEnabled: true } };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const team = within(await screen.findByRole('group', { name: TEAM }));
    fireEvent.click(team.getByRole('button', { name: 'Send and follow up' }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        {
          departmentSettings: {
            7: { autoReplyEnabled: true, autoReplyPartialAnswer: 'send_and_follow_up' },
          },
        },
      ])
    );
    fireEvent.click(team.getByRole('button', { name: /Same as workspace/ }));
    await waitFor(() =>
      expect(state.updates[1]).toEqual({ departmentSettings: { 7: { autoReplyEnabled: true } } })
    );
  });

  it('a team row holding only this choice keeps it when another override is cleared', async () => {
    state.departmentSettings = {
      7: { autoReplyMode: 'rules_only', autoReplyPartialAnswer: 'send_and_follow_up' },
    };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const mode = within(
      await screen.findByRole('group', { name: 'What replies on its own for Billing' })
    );
    fireEvent.click(mode.getByRole('button', { name: /Same as workspace/ }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { departmentSettings: { 7: { autoReplyPartialAnswer: 'send_and_follow_up' } } },
      ])
    );
  });
});
