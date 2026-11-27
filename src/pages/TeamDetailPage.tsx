import { useParams } from 'react-router-dom';
import { StrictFeatureGate } from '@/components/common/StrictFeatureGate';
import { TeamNotFound, TeamPage } from '@/features/settings';

/** Settings › Teams › one team: behind the `ui.team_builder` flag, strict even for an admin. */
export const TeamDetailPage = () => {
  const teamId = Number(useParams().teamId);
  return (
    <StrictFeatureGate flag="ui.team_builder" title="Team">
      <div className="p-4 mx-auto max-w-4xl space-y-4">
        {Number.isInteger(teamId) && teamId > 0 ? (
          <TeamPage teamId={teamId} />
        ) : (
          <TeamNotFound />
        )}
      </div>
    </StrictFeatureGate>
  );
};
