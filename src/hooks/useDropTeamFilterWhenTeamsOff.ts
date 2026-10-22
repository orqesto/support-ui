import { useEffect } from 'react';
import { useTeamsMode } from '@/hooks/useTeamsEnabled';
import { useMessagesStore } from '@/stores/messagesStore';

/**
 * A team picked in the inbox's Team filter must not outlive "teams off".
 *
 * The filter is persisted (store), restored from the URL (`?departmentId=`) and from saved
 * views. With teams off the Team filter has no options, so the schema drops it — the value
 * would keep narrowing the inbox to a now-inactive, empty team, with nothing on screen to
 * clear it. On a KNOWN off (never on 'unknown': a loading or failed list resets nothing) the
 * value goes back to "all". "Needs routing" is not a team and is kept.
 */
export const shouldDropTeamFilter = (value: string | undefined): boolean =>
  value !== undefined && value !== 'all' && value !== '' && value !== 'needs_routing';

export const useDropTeamFilterWhenTeamsOff = (): void => {
  const teamsMode = useTeamsMode();
  const departmentId = useMessagesStore((state) => state.filters.departmentId);
  const updateFilter = useMessagesStore((state) => state.updateFilter);
  useEffect(() => {
    if (teamsMode === 'off' && shouldDropTeamFilter(departmentId)) {
      updateFilter('departmentId', 'all');
    }
  }, [teamsMode, departmentId, updateFilter]);
};
