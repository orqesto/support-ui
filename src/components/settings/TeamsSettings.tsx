import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
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
  labelForTeamsOffCount,
  type Department,
  type TeamsOffPreview,
} from '@/services/department.service';

/**
 * Settings › Teams (admins). Lists every team with an on/off switch, a rename field and a
 * colour; adds teams; and holds the workspace's "Use teams" switch.
 *
 * Switching teams OFF merges every other team into the default team. It cannot be undone, and
 * the confirm dialog says so with the counts from the preview endpoint. Switching teams back ON
 * only brings the team screens back: teams switched on again start empty.
 *
 * The plan limit is the backend's: a refused create/activate answers 403 with a message that
 * names the plan, shown here as-is.
 */

/** `Support team` → `support-team`; never empty, at most 50 characters (the API's limit). */
export const slugFromName = (name: string, taken: string[]): string => {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'team';
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#6366f1';

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
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [offDialogOpen, setOffDialogOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<Department | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['departments'] });

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

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const ok = await run(
      null,
      () =>
        departmentService.create({
          name,
          slug: slugFromName(
            name,
            teams.map((team) => team.slug)
          ),
        }),
      'Could not add the team.'
    );
    setAdding(false);
    if (ok) {
      setNewName('');
      toast.success(`Added ${name}.`);
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
            <div className="flex flex-wrap gap-3 justify-between items-start p-4 rounded-lg border border-border">
              <div className="min-w-0">
                <p className="text-sm font-medium">Use teams</p>
                <p className="text-xs text-muted-foreground">
                  {teamsEnabled
                    ? 'Threads are routed to teams, and agents see the teams they are in.'
                    : `Teams are off. Everything is in ${defaultTeam?.name ?? 'one team'}, and every agent sees all of it.`}
                </p>
              </div>
              <Toggle
                checked={teamsEnabled}
                disabled={modeSaving}
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

            {teamsEnabled && (
              <form
                className="flex flex-wrap gap-2 items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAdd();
                }}
              >
                <div className="flex-1 min-w-[12rem]">
                  <Input
                    label="New team"
                    placeholder="For example: Billing team"
                    value={newName}
                    maxLength={100}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <Button type="submit" isLoading={adding} disabled={!newName.trim() || adding}>
                  <Plus className="mr-2 w-4 h-4" />
                  Add team
                </Button>
              </form>
            )}
          </>
        )}
      </CardContent>

      <TeamsOffDialog
        open={offDialogOpen}
        onClose={() => setOffDialogOpen(false)}
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
 * "Use teams" → off. Reads the preview first, so the admin sees what moves before confirming.
 */
const TeamsOffDialog = ({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) => {
  const [preview, setPreview] = useState<TeamsOffPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setSaveError(null);
    departmentService
      .previewTeamsOff()
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load the teams-off preview:', err);
        if (!cancelled) setLoadError(describeError(err, 'Could not load what would move.'));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const confirm = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await departmentService.setTeamsMode(false);
      await onDone();
    } catch (err) {
      logger.error('Failed to switch teams off:', err);
      setSaveError(describeError(err, 'Could not switch teams off. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const defaultName = preview?.defaultDepartment?.name ?? '';
  const target = defaultName === '' ? 'the default team' : defaultName;
  const counts = Object.entries(preview?.counts ?? {});

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Switch teams off?</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {loadError ? (
            <Alert variant="danger">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div className="flex gap-2 items-center text-muted-foreground">
              <Spinner /> Checking what would move…
            </div>
          ) : (
            <>
              <p>
                {preview.teamsToMerge === 0
                  ? `There are no other teams. Everything is already in ${target}.`
                  : `${preview.teamsToMerge} ${preview.teamsToMerge === 1 ? 'team' : 'teams'} will be merged into ${target}. This moves:`}
              </p>
              {counts.length > 0 && (
                <ul className="space-y-1" aria-label="What moves">
                  {counts.map(([key, value]) => (
                    <li key={key} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{labelForTeamsOffCount(key)}</span>
                      <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {preview.membersAddedToDefault > 0 && (
                <p>
                  {preview.membersAddedToDefault.toLocaleString()}{' '}
                  {preview.membersAddedToDefault === 1 ? 'person is' : 'people are'} added to{' '}
                  {target}, so they see its threads.
                </p>
              )}
            </>
          )}

          <Alert variant="warning">
            <AlertTitle>This can’t be undone</AlertTitle>
            <AlertDescription>
              <ul className="pl-4 mt-1 space-y-1 list-disc">
                <li>Everything stays in {target}, even if you switch teams on again.</li>
                <li>Agents who could see only their own team will see everything.</li>
                <li>Teams you switch on again later start empty.</li>
              </ul>
            </AlertDescription>
          </Alert>

          {saveError && (
            <Alert variant="danger">
              <AlertDescription>{saveError}</AlertDescription>
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
            disabled={saving || !preview}
          >
            Switch teams off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DialogClose onClose={onClose} />
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
