import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { useDepartments } from '@/hooks/useDepartments';
import { deriveTeamsEnabled, pickDefaultTeam } from '@/hooks/useTeamsEnabled';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import {
  departmentService,
  isTeamsSwitchStillRunning,
  type Department,
} from '@/services/department.service';
import { TeamsOffDialog } from './TeamsOffDialog';

/**
 * Settings › Teams (admins). Lists every team with an on/off switch, a rename field and a
 * colour, and holds the workspace's "Use teams" switch.
 *
 * Switching teams OFF merges every other team into the default team. It cannot be undone, and
 * the confirm dialog says so with the counts from the preview endpoint. Switching teams back ON
 * only brings the team screens back: teams switched on again start empty.
 *
 * The plan limit is the backend's: a refused activate answers 403 with a message that
 * names the plan, shown here as-is.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#6366f1';

/**
 * A workspace with more teams than its plan includes (a downgrade or a trial that ended — owner
 * decision 3, 2026-10-23): the existing teams keep working, no new one can be added.
 */
export const overTeamLimitText = (
  limit: number | undefined,
  activeTeams: number
): string | undefined => {
  if (limit === undefined || activeTeams <= limit) return undefined;
  return limit === 1
    ? 'Your workspace keeps its existing teams; Free includes 1 — upgrade to add more.'
    : `Your workspace keeps its existing teams; your plan includes ${limit.toLocaleString()} — upgrade to add more.`;
};

const describeError = (err: unknown, fallback: string): string =>
  getApiErrorMessage(err) ?? fallback;

export const TeamsSettings = () => {
  const queryClient = useQueryClient();
  const {
    data: teams = [],
    isLoading,
    isError,
    teamsEnabled: teamsMode,
  } = useDepartments({ includeInactive: true });
  const activeTeams = teams.filter((team) => team.active);
  const teamsEnabled = deriveTeamsEnabled(teamsMode, activeTeams);
  const defaultTeam = pickDefaultTeam(teams);

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  // The plan's team limit. 1 (Free): teams cannot be switched on, so the switch says so
  // instead of storing "on" and letting a switch-on answer 403.
  const [planTeamLimit, setPlanTeamLimit] = useState<number | undefined>();
  useEffect(() => {
    let cancelled = false;
    void departmentService.getPlanTeamLimit().then((limit) => {
      if (!cancelled) setPlanTeamLimit(limit);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const planAllowsTeams = planTeamLimit === undefined || planTeamLimit > 1;
  const [offDialogOpen, setOffDialogOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<Department | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['departments'] });

  // A switch-off still running (another tab, another admin) or one that did not finish.
  const [switchState, setSwitchState] = useState<'none' | 'running' | 'interrupted'>('none');
  const [finishing, setFinishing] = useState<'off' | 'on' | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const mode = await departmentService.getTeamsMode();
        if (cancelled) return;
        if (mode.interrupted) {
          setSwitchState('interrupted');
          return;
        }
        if (!mode.switching) return;
        setSwitchState('running');
        const final = await departmentService.waitForTeamsSwitch();
        if (cancelled) return;
        setSwitchState(final.interrupted ? 'interrupted' : final.switching ? 'running' : 'none');
        if (!final.switching) void queryClient.invalidateQueries({ queryKey: ['departments'] });
      } catch {
        // An older backend without the route, or a blip: nothing to show.
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  /**
   * An interrupted switch-off: PUT { enabled: false } finishes it; PUT { enabled: true } keeps
   * teams on (and clears the marker). What already moved stays where it is either way.
   */
  const resolveInterrupted = async (keepOn: boolean) => {
    setFinishing(keepOn ? 'on' : 'off');
    setError(null);
    try {
      await departmentService.setTeamsMode(keepOn);
      setSwitchState('none');
    } catch (err) {
      if (isTeamsSwitchStillRunning(err)) {
        setSwitchState('running');
        const final = await departmentService.waitForTeamsSwitch();
        setSwitchState(final.interrupted ? 'interrupted' : final.switching ? 'running' : 'none');
      } else {
        logger.error('Failed to resolve an interrupted switch-off:', err);
        const now = await departmentService.getTeamsMode().catch(() => null);
        if (now?.interrupted) setSwitchState('interrupted');
        setError(
          describeError(
            err,
            keepOn
              ? 'Could not switch teams back on. Try again.'
              : 'Could not finish switching teams off. Try again.'
          )
        );
      }
    } finally {
      setFinishing(null);
      await refresh();
    }
  };

  const run = async (id: number | null, action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    setBusyId(id);
    try {
      await action();
      await refresh();
      return true;
    } catch (err) {
      logger.error(fallback, err);
      setError(describeError(err, fallback));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleTurnOn = (team: Department) =>
    run(team.id, () => departmentService.reactivate(team.id), `Could not switch ${team.name} on.`);

  const handleRename = (team: Department, name: string) =>
    run(team.id, () => departmentService.update(team.id, { name }), 'Could not rename the team.');

  const handleColor = (team: Department, color: string) =>
    run(
      team.id,
      () => departmentService.update(team.id, { color }),
      'Could not change the colour.'
    );

  const handleTeamsOn = async () => {
    setModeSaving(true);
    const ok = await run(
      null,
      () => departmentService.setTeamsMode(true),
      'Could not switch teams on.'
    );
    setModeSaving(false);
    if (ok) toast.success('Teams are on. Switch on the teams you want below.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Users className="w-5 h-5" />
          Teams
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          A team is a group of people who handle one kind of work, such as support or sales.
          Threads, channels, rules and knowledge base entries belong to a team.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <Spinner /> Loading teams…
          </div>
        ) : isError ? (
          <Alert variant="danger">
            <AlertDescription>
              Could not load the teams. Reload the page to try again.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {switchState === 'interrupted' && (
              <Alert variant="warning">
                <AlertTitle>Switching teams off didn’t finish</AlertTitle>
                <AlertDescription>
                  <p>
                    Part of the work may already be in {defaultTeam?.name ?? 'the default team'}.
                    Until you finish it or keep teams on, you cannot switch a team on. What already
                    moved stays in {defaultTeam?.name ?? 'the default team'} either way.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => void resolveInterrupted(false)}
                      isLoading={finishing === 'off'}
                      disabled={finishing !== null}
                    >
                      Finish switching off
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void resolveInterrupted(true)}
                      isLoading={finishing === 'on'}
                      disabled={finishing !== null}
                    >
                      Keep teams on
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {switchState === 'running' && (
              <div className="flex gap-2 items-center text-sm text-muted-foreground" role="status">
                <Spinner /> Teams are being switched off. This can take a few minutes.
              </div>
            )}
            <div className="flex flex-wrap gap-3 justify-between items-start p-4 rounded-lg border border-border">
              <div className="min-w-0">
                <p className="text-sm font-medium">Use teams</p>
                <p className="text-xs text-muted-foreground">
                  {teamsEnabled
                    ? 'Threads are routed to teams, and agents see the teams they are in.'
                    : `Teams are off. Everything is in ${defaultTeam?.name ?? 'one team'}, and every agent sees all of it.`}
                </p>
                {!teamsEnabled && !planAllowsTeams && (
                  <p className="mt-1 text-xs text-warning" data-testid="teams-plan-limit">
                    Your plan includes one team. Upgrade to use teams.
                  </p>
                )}
                {overTeamLimitText(planTeamLimit, activeTeams.length) && (
                  <p className="mt-1 text-xs text-warning" data-testid="teams-over-limit">
                    {overTeamLimitText(planTeamLimit, activeTeams.length)}
                  </p>
                )}
              </div>
              <Toggle
                checked={teamsEnabled}
                disabled={
                  modeSaving || switchState !== 'none' || (!teamsEnabled && !planAllowsTeams)
                }
                ariaLabel="Use teams"
                label={teamsEnabled ? 'On' : 'Off'}
                onChange={(next) => {
                  if (next) void handleTeamsOn();
                  else setOffDialogOpen(true);
                }}
              />
            </div>

            {error && (
              <Alert variant="danger">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <ul className="space-y-2" aria-label="Teams">
              {(teamsEnabled ? teams : teams.filter((team) => team.isDefault || team.active)).map(
                (team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    busy={busyId === team.id}
                    showSwitch={teamsEnabled}
                    onRename={(name) => void handleRename(team, name)}
                    onColor={(color) => void handleColor(team, color)}
                    onTurnOn={() => void handleTurnOn(team)}
                    onTurnOff={() => setDeactivating(team)}
                  />
                )
              )}
            </ul>
          </>
        )}
      </CardContent>

      <TeamsOffDialog
        open={offDialogOpen}
        onClose={() => setOffDialogOpen(false)}
        onInterrupted={() => {
          setOffDialogOpen(false);
          setSwitchState('interrupted');
          void refresh();
        }}
        onDone={async () => {
          setOffDialogOpen(false);
          await refresh();
          toast.success('Teams are off. Everything is now in one team.');
        }}
      />

      <TurnTeamOffDialog
        team={deactivating}
        targets={activeTeams.filter((team) => team.id !== deactivating?.id)}
        defaultTeamId={defaultTeam?.id}
        onClose={() => setDeactivating(null)}
        onDone={async () => {
          const name = deactivating?.name;
          setDeactivating(null);
          await refresh();
          if (name) toast.success(`${name} is off.`);
        }}
      />
    </Card>
  );
};

const TeamRow = ({
  team,
  busy,
  showSwitch,
  onRename,
  onColor,
  onTurnOn,
  onTurnOff,
}: {
  team: Department;
  busy: boolean;
  showSwitch: boolean;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) => {
  const [name, setName] = useState(team.name);
  useEffect(() => setName(team.name), [team.name]);
  const color = team.color && HEX_COLOR.test(team.color) ? team.color : FALLBACK_COLOR;
  const trimmed = name.trim();
  const changed = trimmed !== '' && trimmed !== team.name;

  return (
    <li
      className={`flex flex-wrap gap-3 items-center p-3 rounded-lg border border-border ${team.active ? '' : 'opacity-70'}`}
    >
      <Input
        type="color"
        aria-label={`Colour of ${team.name}`}
        value={color}
        disabled={busy}
        onChange={(event) => {
          if (HEX_COLOR.test(event.target.value) && event.target.value !== team.color) {
            onColor(event.target.value);
          }
        }}
        className="p-1 w-10 h-9"
      />
      <form
        className="flex flex-1 gap-2 items-center min-w-[12rem]"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) onRename(trimmed);
        }}
      >
        <Input
          aria-label={`Name of ${team.name}`}
          value={name}
          maxLength={100}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        {changed && (
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            Rename
          </Button>
        )}
      </form>
      <div className="flex gap-2 items-center">
        {team.isDefault && (
          <Badge variant="secondary" title="New threads land here when nothing else matches">
            Default
          </Badge>
        )}
        {showSwitch && !team.isDefault && (
          <Toggle
            checked={team.active}
            disabled={busy}
            ariaLabel={`${team.name} on or off`}
            label={team.active ? 'On' : 'Off'}
            onChange={(next) => (next ? onTurnOn() : onTurnOff())}
          />
        )}
      </div>
    </li>
  );
};

/**
 * One team → off. Its threads, channels, members and knowledge base entries move to the team
 * picked here (the default team unless the admin picks another).
 */
const TurnTeamOffDialog = ({
  team,
  targets,
  defaultTeamId,
  onClose,
  onDone,
}: {
  team: Department | null;
  targets: Department[];
  defaultTeamId: number | undefined;
  onClose: () => void;
  onDone: () => Promise<void>;
}) => {
  const [targetId, setTargetId] = useState<number | undefined>(defaultTeamId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!team) return;
    setTargetId(
      targets.some((target) => target.id === defaultTeamId) ? defaultTeamId : targets[0]?.id
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id]);

  const confirm = async () => {
    if (!team || targetId === undefined) return;
    setSaving(true);
    setError(null);
    try {
      await departmentService.deactivate(team.id, targetId);
      await onDone();
    } catch (err) {
      logger.error('Failed to switch a team off:', err);
      setError(describeError(err, `Could not switch ${team.name} off.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={team !== null} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Switch {team?.name ?? 'this team'} off?</DialogTitle>
          <DialogClose onClose={() => !saving && onClose()} />
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>
            Its threads, channels, members and knowledge base entries move to the team you choose.
            If you switch it on again later, it starts empty.
          </p>
          <Select
            label="Move its work to"
            aria-label="Move its work to"
            value={targetId === undefined ? '' : String(targetId)}
            options={targets.map((target) => ({ value: String(target.id), label: target.name }))}
            onChange={(value) => setTargetId(Number(value) || undefined)}
            disabled={saving || targets.length === 0}
          />
          {error && (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            isLoading={saving}
            disabled={saving || targetId === undefined}
          >
            Switch off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
