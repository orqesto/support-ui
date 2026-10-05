import { describe, expect, it } from 'vitest';
import { defaultKeep, isOverPlan, keepProblem, toggleId } from '@/components/subscription/keepActive';
import { normalizePlanFit, type PlanFit } from '@/services/subscription.service';

/** Task #8 — the keep-active choice, mirroring the backend's default and rules. */
const fit = (over: Partial<PlanFit> = {}): PlanFit => ({
  enforced: true,
  limits: { maxUsers: 2, maxIntegrations: 1 },
  over: { members: 2, sources: 1 },
  members: [
    { userId: 1, name: 'A', email: 'a@x.io', role: 'support', state: 'active', joinedAt: '2026-01-01T00:00:00Z' },
    { userId: 2, name: 'B', email: 'b@x.io', role: 'org_admin', state: 'active', joinedAt: '2026-02-01T00:00:00Z' },
    { userId: 3, name: 'C', email: 'c@x.io', role: 'support', state: 'active', joinedAt: '2026-03-01T00:00:00Z' },
    { userId: 4, name: 'D', email: 'd@x.io', role: 'support', state: 'paused', joinedAt: '2025-01-01T00:00:00Z' },
  ],
  channels: [
    { id: 20, name: 'new', type: 'email', state: 'active', createdAt: '2026-05-01T00:00:00Z' },
    { id: 21, name: 'old', type: 'gmail', state: 'active', createdAt: '2026-01-01T00:00:00Z' },
  ],
  ...over,
});

describe('defaultKeep', () => {
  it('the person choosing, then admins, then by joining order — never a paused member; the oldest channel', () => {
    expect(defaultKeep(fit(), 3)).toEqual({ memberUserIds: [3, 2], sourceIds: [21] });
    expect(defaultKeep(fit(), null)).toEqual({ memberUserIds: [2, 1], sourceIds: [21] });
  });
});

describe('keepProblem', () => {
  it('within the limits and with an admin: nothing to fix', () => {
    expect(keepProblem(fit(), { memberUserIds: [2, 3], sourceIds: [20] })).toBeNull();
  });
  it('too many seats or channels', () => {
    expect(keepProblem(fit(), { memberUserIds: [1, 2, 3], sourceIds: [] })).toMatch(/2 seats/);
    expect(keepProblem(fit(), { memberUserIds: [2], sourceIds: [20, 21] })).toMatch(/1 channel/);
  });
  it('no admin while the workspace has one', () => {
    expect(keepProblem(fit(), { memberUserIds: [1, 3], sourceIds: [] })).toMatch(/at least one admin/);
    const noAdmins = fit({ members: fit().members.map((member) => ({ ...member, role: 'support' })) });
    expect(keepProblem(noAdmins, { memberUserIds: [1], sourceIds: [] })).toBeNull();
  });
});

describe('isOverPlan / toggleId', () => {
  it('over when either count is over', () => {
    expect(isOverPlan(fit())).toBe(true);
    expect(isOverPlan(fit({ over: { members: 0, sources: 1 } }))).toBe(true);
    expect(isOverPlan(fit({ over: { members: 0, sources: 0 } }))).toBe(false);
  });
  it('adds and removes', () => {
    expect(toggleId([1, 2], 2)).toEqual([1]);
    expect(toggleId([1], 2)).toEqual([1, 2]);
  });
});

describe('normalizePlanFit — version skew', () => {
  it('an older backend (no /plan-fit shape) reads as not enforced and nothing over', () => {
    expect(normalizePlanFit(undefined)).toEqual({
      enforced: false,
      limits: { maxUsers: 0, maxIntegrations: 0 },
      over: { members: 0, sources: 0 },
      members: [],
      channels: [],
    });
    expect(normalizePlanFit({ plan: { name: 'free' } }).enforced).toBe(false);
  });
  it('tolerates odd values without throwing', () => {
    const fitted = normalizePlanFit({ enforced: true, members: [{ userId: 5, email: 'e@x.io', state: 'weird' }, null], channels: 'no' });
    expect(fitted.members).toEqual([{ userId: 5, name: 'e@x.io', email: 'e@x.io', role: '', state: 'active', joinedAt: null }]);
    expect(fitted.channels).toEqual([]);
  });
});
