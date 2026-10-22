import { useDepartments } from '@/hooks/useDepartments';
import type { Department } from '@/types';

/**
 * Whether the workspace uses teams, as one of three states.
 *
 * - The backend's `teamsEnabled` wins.
 * - An older backend does not send it (`undefined`): derive it from the active team count. One
 *   active team means off, two or more mean on, so a frontend ahead of the backend behaves the
 *   same.
 * - Nothing known yet (`null`, or no list): the list is loading or failed to load. That is
 *   'unknown', never 'off': nothing is hidden on a guess, and nothing is reset on a guess.
 */
export type TeamsMode = 'on' | 'off' | 'unknown';

export const deriveTeamsMode = (
  teamsEnabled: boolean | undefined | null,
  departments: Department[] | undefined
): TeamsMode => {
  if (typeof teamsEnabled === 'boolean') return teamsEnabled ? 'on' : 'off';
  if (teamsEnabled === null || departments === undefined) return 'unknown';
  const active = departments.filter((dept) => dept.active !== false);
  return active.length >= 2 ? 'on' : 'off';
};

/** For rendering: 'unknown' renders as on, so team UI does not flash away while loading. */
export const deriveTeamsEnabled = (
  teamsEnabled: boolean | undefined | null,
  departments: Department[] | undefined
): boolean => deriveTeamsMode(teamsEnabled, departments) !== 'off';

/**
 * Teams on/off for the current workspace. While off, hide every team switcher, badge, picker
 * and filter; a form that must still send a team sends the default team (see
 * `useDefaultTeam`). Loading or failed counts as on (see `deriveTeamsMode`).
 */
export const useTeamsEnabled = (): boolean => {
  const { data, teamsEnabled } = useDepartments();
  return deriveTeamsEnabled(teamsEnabled, data);
};

/** The three-state value, for code that must act only on a KNOWN off (e.g. resetting a pick). */
export const useTeamsMode = (): TeamsMode => {
  const { data, teamsEnabled } = useDepartments();
  return deriveTeamsMode(teamsEnabled, data);
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
