import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Toggle } from '@/components/ui/Toggle';
import { getApiErrorMessage, getErrorBody } from '@/lib/errorMessages';
import type { Department } from '@/types';
import {
  TEAM_ROLES,
  teamBuilderService,
  type HeldRole,
  type TeamRole,
} from '../../services/teamBuilder.service';
import { RolesHeldDialog } from './RolesHeldDialog';
import { TEAM_ROLE_LABELS } from './teamLabels';

const LAST_GENERAL_TEXT = 'A workspace keeps one team with General rules.';
const FALLBACK_TEXT = 'Could not change the role. Try again.';

const describeError = (err: unknown): string => {
  const code = getErrorBody(err)?.code;
  if (code === 'GENERAL_TEAM_REQUIRED' || code === 'ROLE_REQUIRED') return LAST_GENERAL_TEXT;
  return getApiErrorMessage(err) ?? FALLBACK_TEXT;
};

type Props = { team: Department; teams: Department[]; onChanged: () => void };

/** One switch per role. A single-holder role another active team holds moves only after a confirm. */
export const TeamRolesEditor = ({ team, teams, onChanged }: Props) => {
  const [pending, setPending] = useState<HeldRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (role: TeamRole, on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await teamBuilderService.setRole(team.id, role, on);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const toggle = (role: TeamRole, on: boolean) => {
    // `intentRouted` is held by several teams at once, so nothing moves.
    const holder =
      on && role !== 'intentRouted'
        ? teams.find((other) => other.id !== team.id && other.active && other[role] === true)
        : undefined;
    if (holder) setPending({ role, teamId: holder.id, teamName: holder.name });
    else void change(role, on);
  };

  return (
    <div className="space-y-2" data-testid="team-roles-editor">
      {TEAM_ROLES.map((role) => (
        <div key={role}>
          <Toggle
            checked={team[role] === true}
            onChange={(next) => toggle(role, next)}
            disabled={busy}
            label={TEAM_ROLE_LABELS[role]}
            ariaLabel={TEAM_ROLE_LABELS[role]}
          />
        </div>
      ))}
      {error && <Alert variant="danger">{error}</Alert>}
      <RolesHeldDialog
        open={pending !== null}
        heldRoles={pending ? [pending] : []}
        busy={busy}
        onMove={() => pending && void change(pending.role, true)}
        onKeep={() => setPending(null)}
      />
    </div>
  );
};
