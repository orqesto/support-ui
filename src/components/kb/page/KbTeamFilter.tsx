import { Select } from '@/components/ui/Select';
import { useDepartments } from '@/hooks/useDepartments';
import { useTeamsMode } from '@/hooks/useTeamsEnabled';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';

const ALL_TEAMS = 'all';
const SEVERAL = 'several';

/**
 * The teams this viewer may pick: a global admin every team, anyone else their own. The same
 * rule as the sidebar's team switcher.
 */
export const useKbTeams = () => {
  const user = useAuthStore((state) => state.user);
  const { data } = useDepartments();
  const all = (data ?? []).filter((dept) => dept.active !== false);
  const mine =
    user?.role === 'admin' ? all : all.filter((dept) => user?.departmentIds?.includes(dept.id));
  return mine.map((dept) => ({ id: dept.id, name: dept.name }));
};

/**
 * The page's Team filter. It is the app's team context (the sidebar's team switcher and the
 * `X-Department-Context` header the list is read with), not a second team choice of its own:
 * one team picked here is the team everywhere, so the list, the questions and the export agree.
 * Hidden while teams are off.
 */
export const KbTeamFilter = ({ selectedKey }: { selectedKey: string }) => {
  const teamsMode = useTeamsMode();
  const teams = useKbTeams();
  const setSelected = useDepartmentContextStore((state) => state.setSelected);
  const clear = useDepartmentContextStore((state) => state.clear);
  if (teamsMode === 'off') return null;
  const selected = selectedKey ? selectedKey.split(',').map(Number) : [];
  const value =
    selected.length === 0 ? ALL_TEAMS : selected.length === 1 ? String(selected[0]) : SEVERAL;
  return (
    <div data-kb-filter="team">
      <Select
        aria-label="Team"
        size="sm"
        className="w-40"
        value={value}
        onChange={(next) => {
          if (next === ALL_TEAMS) clear();
          else if (next !== SEVERAL) setSelected([Number(next)]);
        }}
        options={[
          { value: ALL_TEAMS, label: 'All teams' },
          ...(selected.length > 1
            ? [{ value: SEVERAL, label: `${selected.length} teams`, isDisabled: true }]
            : []),
          ...teams.map((team) => ({ value: String(team.id), label: team.name })),
        ]}
      />
    </div>
  );
};
