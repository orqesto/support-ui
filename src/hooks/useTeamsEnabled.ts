import { useDepartments } from '@/hooks/useDepartments';
import type { Department } from '@/types';

/**
 * Whether the workspace uses teams. When the backend does not send `teamsEnabled` (an older
 * backend), derive it from the active team count: one active team means teams are off, two or
 * more mean on. A frontend that ships ahead of the backend therefore behaves the same.
 */
export const deriveTeamsEnabled = (
  teamsEnabled: boolean | undefined,
  departments: Department[] | undefined
): boolean => {
  if (typeof teamsEnabled === 'boolean') return teamsEnabled;
  const active = (departments ?? []).filter((dept) => dept.active !== false);
  return active.length >= 2;
};

/**
 * Teams on/off for the current workspace. While off, hide every team switcher, badge, picker
 * and filter; a form that must still send a team sends the default team (see
 * `useDefaultTeam`).
 */
export const useTeamsEnabled = (): boolean => {
  const { data, teamsEnabled } = useDepartments();
  return deriveTeamsEnabled(teamsEnabled, data);
};

/** The workspace's default team: where everything lives while teams are off. */
export const pickDefaultTeam = (departments: Department[] | undefined): Department | undefined => {
  const active = (departments ?? []).filter((dept) => dept.active !== false);
  return active.find((dept) => dept.isDefault) ?? (active.length === 1 ? active[0] : undefined);
};

export const useDefaultTeam = (): Department | undefined => {
  const { data } = useDepartments();
  return pickDefaultTeam(data);
};
