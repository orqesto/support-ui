import type { KeepChoice, PlanFit } from '@/services/subscription.service';

/**
 * Task #8 — who and what stays active when the workspace must fit a smaller plan (Free). The
 * backend makes the same default choice when none is sent (planFit.chooseMembers/chooseSources);
 * mirroring it here means the screen opens on what would happen anyway.
 */
const joined = (value: string | null): number => (value ? Date.parse(value) || 0 : 0);

export const defaultKeep = (fit: PlanFit, currentUserId?: number | null): KeepChoice => {
  const active = fit.members.filter((member) => member.state === 'active');
  const byJoined = <T extends { joinedAt: string | null; userId: number }>(list: T[]) =>
    [...list].sort((left, right) => joined(left.joinedAt) - joined(right.joinedAt) || left.userId - right.userId);
  const me = active.filter((member) => member.userId === currentUserId);
  const admins = byJoined(active.filter((member) => member.userId !== currentUserId && member.role === 'org_admin'));
  const others = byJoined(active.filter((member) => member.userId !== currentUserId && member.role !== 'org_admin'));
  const memberUserIds = [...me, ...admins, ...others].slice(0, Math.max(0, fit.limits.maxUsers)).map((member) => member.userId);

  const sourceIds = fit.channels
    .filter((channel) => channel.state === 'active')
    .sort((left, right) => joined(left.createdAt) - joined(right.createdAt) || left.id - right.id)
    .slice(0, Math.max(0, fit.limits.maxIntegrations))
    .map((channel) => channel.id);
  return { memberUserIds, sourceIds };
};

/** Why this choice cannot be saved, or null when it can — the same rules the backend enforces. */
export const keepProblem = (fit: PlanFit, keep: KeepChoice): string | null => {
  const { maxUsers, maxIntegrations } = fit.limits;
  if (keep.memberUserIds.length > maxUsers) {
    return `This plan has ${maxUsers} seat${maxUsers === 1 ? '' : 's'} — choose at most ${maxUsers}.`;
  }
  if (keep.sourceIds.length > maxIntegrations) {
    return `This plan has ${maxIntegrations} channel${maxIntegrations === 1 ? '' : 's'} — choose at most ${maxIntegrations}.`;
  }
  const admins = fit.members.filter((member) => member.role === 'org_admin');
  if (admins.length > 0 && !admins.some((admin) => keep.memberUserIds.includes(admin.userId))) {
    return 'Keep at least one admin active — otherwise nobody can manage this workspace.';
  }
  return null;
};

/** Is the workspace over this plan right now (so there is a choice to make)? */
export const isOverPlan = (fit: PlanFit): boolean => fit.over.members > 0 || fit.over.sources > 0;

/** Add or remove one id. */
export const toggleId = (ids: number[], id: number): number[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
