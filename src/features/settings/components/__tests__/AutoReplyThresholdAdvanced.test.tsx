/**
 * The AI reply confidence sits under a closed "Advanced" (settings quick wins): no number outside
 * it, and the closed header names each team that differs. Harness copied from
 * AutoReplyCheckOnly.test.tsx (the settings contract it describes):
 * - a third choice, "AI replies checked, not sent", for the workspace and for a team;
 * - what is stored is read from `modeStored` (null = never chosen), not guessed;
 * - a team is saved as ONE team's change (`teamSettingsChange`), never the whole map;
 * - every save carries the `updatedAt` the page read, and a refusal (409) shows the server's
 *   sentence and reads the settings again — the change is not sent a second time.
 * The real settings card and dialog; invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';

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

describe('the confidence numbers sit under "Advanced" (settings quick wins, Task 3)', () => {
  const advanced = (summary: RegExp) =>
    screen
      .getAllByRole('button', { name: /^Advanced/ })
      .find((button) => summary.test(button.textContent ?? '')) as HTMLElement;

  it('the workspace and team sliders are hidden until "Advanced" is opened', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = { '7': { autoReplyEnabled: true } };
    await show();
    const orgSlider = document.getElementById('org-threshold') as HTMLInputElement;
    const teamSlider = document.getElementById('dept-threshold-7') as HTMLInputElement;
    expect(orgSlider).not.toBeVisible();
    expect(teamSlider).not.toBeVisible();
    fireEvent.click(advanced(/Same for every team/));
    expect(orgSlider).toBeVisible();
    fireEvent.click(advanced(/AI reply confidence: same as the workspace/));
    expect(teamSlider).toBeVisible();
  });

  it('the closed header names the team that differs, with no number', async () => {
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = { '7': { autoReplyHighConfidenceThreshold: 0.95 } };
    await show();
    const header = advanced(/Billing: stricter than the workspace/);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header.textContent).not.toMatch(/%/);
    // No percentage anywhere outside a closed "Advanced" panel.
    const outside = Array.from(document.body.querySelectorAll('*')).filter(
      (element) =>
        element.children.length === 0 &&
        /\d+%/.test(element.textContent ?? '') &&
        element.closest('[hidden]') === null &&
        element.closest('[role="dialog"]') === null
    );
    expect(outside.map((element) => element.textContent)).toEqual([]);
  });

  it('the read-only view shows no number either', async () => {
    state.canManage = false;
    state.mode = 'all';
    state.modeStored = 'all';
    state.departmentSettings = { '7': { autoReplyHighConfidenceThreshold: 0.95 } };
    await show().catch(() => undefined);
    await screen.findByText(/Only workspace admins and moderators/);
    expect(screen.getByText(/Only workspace admins and moderators/).textContent).not.toMatch(/%/);
  });
});
