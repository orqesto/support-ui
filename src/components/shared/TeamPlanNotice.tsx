import { Link } from 'react-router-dom';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import type { TeamPlan } from '@/services/department.service';

const teams = (count: number) => `${count} ${count === 1 ? 'team' : 'teams'}`;

/**
 * More teams are on than the plan allows (a trial that ended): nothing is switched off, the
 * notice stays until it is resolved. Renders nothing when `teamPlan` is missing or within limit.
 */
export const TeamPlanNotice = ({
  teamPlan,
  showTeamsLink = false,
}: {
  teamPlan?: TeamPlan | null;
  showTeamsLink?: boolean;
}) => {
  const { hasPermission } = usePermissions();
  const { data: backendVersion } = useBackendVersion();
  // /pricing is behind the billing gate and VIEW_SUBSCRIPTION (as TrialBanner): else a dead end.
  const canUpgrade =
    backendVersion?.billingEnabled === true && hasPermission(Permission.VIEW_SUBSCRIPTION);
  if (teamPlan?.overLimit !== true || teamPlan.teamLimit === null) return null;
  return (
    <Alert variant="warning" role="status" label="Team plan limit">
      <AlertDescription>
        <span data-testid="team-plan-notice">
          Your plan allows {teams(teamPlan.teamLimit)}; {teamPlan.activeTeams} are on. Upgrade or
          switch some off.
        </span>
        {canUpgrade && (
          <>
            {' '}
            <Link to="/pricing" className="font-medium underline">
              Upgrade plan
            </Link>
          </>
        )}
        {showTeamsLink && (
          <>
            {canUpgrade ? ' · ' : ' '}
            <Link to="/settings?tab=teams" className="font-medium underline">
              Manage teams
            </Link>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
};
