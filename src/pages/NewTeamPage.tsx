import { StrictFeatureGate } from '@/components/common/StrictFeatureGate';
import { NewTeamBuilder } from '@/features/settings';

/** Settings › Teams › New team: behind the `ui.team_builder` flag, strict even for an admin. */
export const NewTeamPage = () => (
  <StrictFeatureGate flag="ui.team_builder" title="New team">
    <div className="p-4 mx-auto max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">New team</h2>
      <NewTeamBuilder />
    </div>
  </StrictFeatureGate>
);
