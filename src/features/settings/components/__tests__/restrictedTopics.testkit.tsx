/**
 * The stand-in backend and page helpers shared by the restricted-topics tests. The server below
 * behaves as the backend's PATCH /api/organizations/auto-reply does: only a workspace admin may
 * change topics (403 ROLE_REQUIRED), adding needs an active team (404), removing works for any
 * team that still has stored topics, and every answer lists `restrictedTopicTeams`. Imported
 * FIRST by each test file, so its mocks are in place before the page loads. Invented data.
 */
import { vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

export type Team = Record<string, unknown> & { restrictedTopics?: string[] };
type Change = { scope: string; departmentId?: number; add?: string[]; remove?: string[] };

const state = vi.hoisted(() => ({
  canManage: true,
  /** False with canManage: a moderator — may change the card, not the restricted topics. */
  orgAdmin: true,
  /** The workspace's teams mode (false = no team rows). */
  teamsMode: true,
  /** False: an older backend that knows no restricted topics. */
  supported: true,
  /** False: a backend that knows restricted topics but does not list the teams that have them. */
  listsTeams: true,
  /** The workspace's dose-rule switch; null = an older backend that does not send it. */
  doseRule: false as boolean | null,
  topics: [] as string[],
  teams: {} as Record<string, Record<string, unknown>>,
  departments: [] as { id: number; name: string; slug: string; active: boolean }[],
  updates: [] as Record<string, unknown>[],
  failWith: null as Record<string, unknown> | null,
  /** Held answers: each save waits until the test releases it. */
  held: null as (() => void)[] | null,
  alerts: [] as { title: string; description?: string; variant?: string }[],
  /** The settings' `updatedAt` a read answers with; undefined = a backend without the stamp. */
  updatedAt: undefined as string | undefined,
  /** The workspace's stored mode as a read says it (`null` = never chosen); undefined = not sent. */
  modeStored: undefined as string | null | undefined,
}));

// As the backend compares topics: letter case and runs of spaces aside.
const fold = (topic: string) => topic.replace(/\s+/g, ' ').trim().toLowerCase();
const sameTopic = (left: string, right: string) => fold(left) === fold(right);
const changed = (list: string[], change: Change): string[] => [
  ...list.filter((topic) => !(change.remove ?? []).some((gone) => sameTopic(gone, topic))),
  ...(change.add ?? []).filter((topic) => !list.some((kept) => sameTopic(kept, topic))),
];
/** What the backend's PATCH does with a body, and what it answers. */
/** `restrictedTopicTeams`: every team with stored topics, by id; a team with no row is deleted. */
const topicTeams = () =>
  Object.entries(state.teams as Record<string, Team>)
    .filter(([, team]) => (team.restrictedTopics ?? []).length > 0)
    .map(([key, team]) => {
      const known = state.departments.find((dept) => dept.id === Number(key));
      return {
        departmentId: Number(key),
        name: known?.name ?? null,
        active: known?.active === true,
        restrictedTopics: team.restrictedTopics,
      };
    })
    .sort((left, right) => left.departmentId - right.departmentId);
const refused = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error('Request failed'), { response: { status, data } });
const serverSave = (body: Record<string, unknown>) => {
  const teams = state.teams as Record<string, Team>;
  const asked = body.restrictedTopicsChange as Change | undefined;
  if (asked && !state.orgAdmin) {
    throw refused(403, {
      success: false,
      error: 'Only a workspace admin can change restricted topics.',
      code: 'ROLE_REQUIRED',
    });
  }
  if (asked?.scope === 'team') {
    const team = state.departments.find((dept) => dept.id === asked.departmentId);
    const stored = teams[String(asked.departmentId)]?.restrictedTopics ?? [];
    // Adding needs an active team; removing only needs the team, or topics still stored for it.
    if ((asked.add ?? []).length > 0 ? !team?.active : !team && stored.length === 0) {
      throw refused(404, { success: false, error: 'Team not found' });
    }
  }
  if (body.departmentSettings) {
    // The map replaces the stored one; each team's stored topics are carried over, also for a
    // team the body drops, and topics in the body are ignored.
    const next: Record<string, Team> = {};
    for (const [key, sent] of Object.entries(body.departmentSettings as Record<string, Team>)) {
      const { restrictedTopics: _ignored, ...rest } = sent;
      next[key] = rest;
    }
    for (const [key, stored] of Object.entries(teams)) {
      if (stored.restrictedTopics?.length) {
        next[key] = { ...next[key], restrictedTopics: stored.restrictedTopics };
      }
    }
    state.teams = next;
  }
  const change = body.restrictedTopicsChange as Change | undefined;
  if (change?.scope === 'workspace') state.topics = changed(state.topics, change);
  if (change?.scope === 'team') {
    const key = String(change.departmentId);
    const stored = (state.teams as Record<string, Team>)[key] ?? {};
    state.teams = {
      ...state.teams,
      [key]: { ...stored, restrictedTopics: changed(stored.restrictedTopics ?? [], change) },
    };
  }
  return {
    success: true,
    data: structuredClone({
      enabled: true,
      mode: 'all',
      partialAnswer: 'hand_to_agent',
      ...(state.supported && {
        restrictedTopics: state.topics,
        ...(state.listsTeams && { restrictedTopicTeams: topicTeams() }),
      }),
      departmentSettings: state.teams,
    }),
  };
};

// (A hoisted value cannot be exported where it is declared.)
export { state };
// The confirmation before something starts sending reads the mailboxes (none here).
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: [] }),
    getSourceDepartments: () => Promise.resolve({ success: true, data: [] }),
  },
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
        restrictedTopics: state.supported ? [...state.topics] : null,
        ...(state.doseRule !== null && { doseRule: state.doseRule }),
        restrictedTopicTeams:
          state.supported && state.listsTeams ? structuredClone(topicTeams()) : null,
        ...(state.updatedAt !== undefined && { updatedAt: state.updatedAt }),
        ...(state.modeStored !== undefined && { modeStored: state.modeStored }),
      }),
    getCurrent: () =>
      Promise.resolve({ settings: { departmentSettings: structuredClone(state.teams) } }),
    updateAutoReply: async (data: Record<string, unknown>) => {
      if (typeof data.doseRule === 'boolean') state.doseRule = data.doseRule;
      state.updates.push(structuredClone(data));
      if (state.held) await new Promise<void>((release) => state.held?.push(release));
      if (state.failWith) throw Object.assign(new Error('Request failed'), state.failWith);
      return serverSave(data);
    },
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: state.departments, teamsEnabled: state.teamsMode }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOrgAdmin: state.canManage && state.orgAdmin,
    hasPermission: () => state.canManage,
  }),
}));
vi.mock('../AutoReplyRulesSection', () => ({ AutoReplyRulesSection: () => null }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';

export const WORKSPACE = 'Workspace restricted topics';
export const TEAM = 'Billing restricted topics';
export const BILLING = { id: 7, name: 'Billing', slug: 'billing', active: true };
export const SALES = { id: 9, name: 'Sales', slug: 'sales', active: true };

beforeEach(() => {
  state.canManage = true;
  state.orgAdmin = true;
  state.teamsMode = true;
  state.supported = true;
  state.listsTeams = true;
  state.doseRule = false;
  state.topics = [];
  state.teams = {};
  state.departments = [BILLING];
  state.updates = [];
  state.failWith = null;
  state.held = null;
  state.alerts = [];
  state.updatedAt = undefined;
  state.modeStored = undefined;
});
afterEach(cleanup);

export const show = () =>
  render(<AutoReplyConfiguration onShowAlert={(alert) => state.alerts.push(alert)} />);
export const add = (list: string, topic: string) => {
  const input = screen.getByRole('textbox', { name: `Add to ${list}` });
  fireEvent.change(input, { target: { value: topic } });
  fireEvent.keyDown(input, { key: 'Enter' });
};
export const topicsOf = (list: string) =>
  within(screen.getByRole('list', { name: list }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent);
export const refusal = (error: string, fields: string[]) => ({
  response: { status: 400, data: { success: false, error, code: 'VALIDATION_FAILED', fields } },
});
/** No save of this card ever carries a list of topics. */
export const sentTopicLists = () =>
  state.updates.filter(
    (update) =>
      'restrictedTopics' in update ||
      Object.values((update.departmentSettings ?? {}) as Record<string, Team>).some(
        (team) => 'restrictedTopics' in team
      )
  );
