/**
 * "Rules only" (audit M4): the workspace choice saves `{ mode }`, the AI-only settings say they do
 * not apply (kept, not hidden), and a team's choice saves the full map with `autoReplyMode` set or
 * dropped ("Same as workspace"). Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  mode: 'all' as 'all' | 'rules_only',
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
        mode: state.mode,
        requestMissingInfo: true,
        suggestSolutions: true,
        highConfidenceThreshold: 0.9,
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

const NOTE = /do not apply in "Keyword rules only"/;

beforeEach(() => {
  state.mode = 'all';
  state.departmentSettings = {};
  state.updates = [];
});
afterEach(cleanup);

const workspaceChoice = async () =>
  within(await screen.findByRole('group', { name: 'What replies on its own' }));
const teamChoice = async () =>
  within(await screen.findByRole('group', { name: 'What replies on its own for Billing' }));

describe('AutoReplyConfiguration — rules only', () => {
  it('the workspace choice saves { mode } and notes that the AI settings do not apply', async () => {
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = await workspaceChoice();
    expect(screen.queryByText(NOTE)).toBeNull();
    fireEvent.click(choice.getByRole('button', { name: 'Keyword rules only' }));
    await waitFor(() => expect(state.updates).toEqual([{ mode: 'rules_only' }]));
    expect((await screen.findAllByText(NOTE)).length).toBeGreaterThan(0);
    // Kept, not hidden.
    expect(screen.getByText('Request missing info')).toBeInTheDocument();
    expect(screen.getByText('Suggest solutions')).toBeInTheDocument();
  });

  it('CONTROL — "Keyword rules and AI replies" loaded: no note, and choosing it again saves nothing', async () => {
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = await workspaceChoice();
    expect(choice.getByRole('button', { name: 'Keyword rules and AI replies' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(choice.getByRole('button', { name: 'Keyword rules and AI replies' }));
    expect(state.updates).toEqual([]);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("a team's own choice saves the full map with autoReplyMode", async () => {
    state.departmentSettings = { '3': { autoReplyEnabled: false } };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = await teamChoice();
    fireEvent.click(choice.getByRole('button', { name: 'Keyword rules only' }));
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

  it('"Same as workspace" drops the key and keeps the rest of the team\'s overrides', async () => {
    state.departmentSettings = {
      '7': { autoReplyMode: 'rules_only', escalationPhrases: ['lawyer'] },
    };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = await teamChoice();
    fireEvent.click(choice.getByRole('button', { name: /Same as workspace/ }));
    await waitFor(() =>
      expect(state.updates).toEqual([
        { departmentSettings: { '7': { escalationPhrases: ['lawyer'] } } },
      ])
    );
  });

  it('"Same as workspace" with nothing else overridden removes the team row', async () => {
    state.departmentSettings = { '7': { autoReplyMode: 'all' } };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    const choice = await teamChoice();
    fireEvent.click(choice.getByRole('button', { name: /Same as workspace/ }));
    await waitFor(() => expect(state.updates).toEqual([{ departmentSettings: {} }]));
  });
});
