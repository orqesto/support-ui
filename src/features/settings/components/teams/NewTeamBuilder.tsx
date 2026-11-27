import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChoiceCard } from '@/components/ui/ChoiceCard';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { departmentService } from '@/services/department.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  RolesHeldError,
  TeamNotReturnedError,
  teamBuilderService,
  type ApplyResult,
  type HeldRole,
  type PresetRef,
  type PresetView,
} from '../../services/teamBuilder.service';
import { LibraryPicker } from './LibraryPicker';
import { ApplyResultSummary } from './ApplyResultSummary';
import { RemoveWorkspacePreset } from './RemoveWorkspacePreset';
import { RolesHeldDialog } from './RolesHeldDialog';
import { TEAM_ROLE_LABELS } from './teamLabels';
import { teamPagePath } from './teamPaths';

const NAME_MAX = 100;
const DEFAULT_COLOR = '#6366f1';
const SCRATCH = 'scratch';
/** The backend's new-team notice key (ApplyResultSummary shows its text). */
const NEW_TEAM_NOTICE = 'rules_only_until_traffic';
const NO_RULES_YET_TEXT =
  'This team has no rules yet. Add rules from the library on its page; it learns from real mail once threads reach it.';
const PRESET_NOT_APPLIED_TEXT =
  'The preset was not applied because its roles are held. Apply it from this page.';

/** Team slug from its name: lowercase, runs of other characters become "-", at most 50. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '') || 'team';

const TEAM_NOT_RETURNED_TEXT =
  'The team was probably created, but the reply did not include it. Check the teams list before trying again.';
const PRESETS_FAILED_TEXT = 'The presets could not be loaded.';

const rulesCount = (count: number): string => `${count} ${count === 1 ? 'rule' : 'rules'}`;

/** The backend reason, ended with a full stop when it has none, so the next sentence reads right. */
const sentence = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const rulesNotAddedText = (reason?: string): string =>
  `The team was created, but its rules could not be added.${reason ? ` ${sentence(reason)}` : ''} Open the team to add them.`;

type Created = {
  teamId: number;
  result: ApplyResult | null;
  notice: string | null;
  warnings: string[];
};
type Held = { heldRoles: HeldRole[]; teamId: number | null };

const refOf = (preset: PresetView): PresetRef => ({ scope: preset.scope, id: preset.id });
const presetKey = (preset: PresetView): string => `${preset.scope}:${preset.id}`;

/** Builds a team from a preset or from scratch: start from, name, rules, confirm, create. */
export const NewTeamBuilder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: presets = [],
    isLoading,
    isError: presetsFailed,
    error: presetsError,
  } = useQuery({
    queryKey: ['team-presets'],
    queryFn: () => teamBuilderService.listPresets(),
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  // A create answered without its team: it probably exists, so a second click must not make another.
  const [maybeCreated, setMaybeCreated] = useState(false);
  const inFlight = useRef(false);

  const preset = presets.find((one) => presetKey(one) === choice) ?? null;
  const fromScratch = choice === SCRATCH;
  const trimmed = name.trim();
  const ready = (preset !== null || fromScratch) && trimmed.length > 0;

  /** One request at a time: a second click while one is out does nothing. */
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      // A 2xx without the team: it most likely exists, so never say it could not be created.
      if (err instanceof TeamNotReturnedError) {
        void queryClient.invalidateQueries({ queryKey: ['departments'] });
        setMaybeCreated(true);
        setError(TEAM_NOT_RETURNED_TEXT);
        return;
      }
      setError(getApiErrorMessage(err) ?? 'The team could not be created.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const createFromPreset = (chosen: PresetView, moveRoles: boolean) =>
    run(async () => {
      try {
        const res = await teamBuilderService.createFromPreset({
          preset: refOf(chosen),
          name: trimmed,
          color,
          ...(moveRoles ? { moveRoles: true } : {}),
        });
        void queryClient.invalidateQueries({ queryKey: ['departments'] });
        setHeld(null);
        if ('error' in res.apply) {
          if (res.apply.error === 'ROLES_HELD') {
            // A race: the team exists, the roles were taken meanwhile.
            setCreated({ teamId: res.team.id, result: null, notice: null, warnings: [] });
            setHeld({ heldRoles: res.apply.heldRoles ?? [], teamId: res.team.id });
            return;
          }
          setCreated({ teamId: res.team.id, result: null, notice: null, warnings: [] });
          setError(rulesNotAddedText());
          return;
        }
        setCreated({
          teamId: res.team.id,
          result: res.apply,
          notice: res.notice,
          warnings: res.warnings,
        });
      } catch (err) {
        if (err instanceof RolesHeldError) {
          setHeld({ heldRoles: err.heldRoles, teamId: null });
          return;
        }
        throw err;
      }
    });

  const createFromScratch = () =>
    run(async () => {
      const team = await departmentService.create({
        name: trimmed,
        slug: slugOf(trimmed),
        color,
      });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      const ids = [...picked];
      if (ids.length === 0) {
        setCreated({ teamId: team.id, result: null, notice: null, warnings: [] });
        return;
      }
      // The team exists from here on; the done screen waits for the answer (the button is busy).
      try {
        const result = await teamBuilderService.applyItems(team.id, ids);
        setCreated({ teamId: team.id, result, notice: null, warnings: [] });
      } catch (err) {
        setCreated({ teamId: team.id, result: null, notice: null, warnings: [] });
        setError(rulesNotAddedText(getApiErrorMessage(err)));
      }
    });

  const onCreate = () => {
    if (!ready || maybeCreated) return;
    if (preset) void createFromPreset(preset, false);
    else void createFromScratch();
  };

  const onMove = () => {
    if (!held || !preset) return;
    if (held.teamId === null) {
      void createFromPreset(preset, true);
      return;
    }
    const teamId = held.teamId;
    void run(async () => {
      try {
        const result = await teamBuilderService.applyPreset(teamId, refOf(preset), true);
        setHeld(null);
        setCreated({ teamId, result, notice: null, warnings: [] });
      } catch (err) {
        // The team exists: close the dialog and say so inline (a second ROLES_HELD has no reason).
        setHeld(null);
        setError(
          rulesNotAddedText(err instanceof RolesHeldError ? undefined : getApiErrorMessage(err))
        );
      }
    });
  };

  const onKeep = () => {
    if (held && held.teamId !== null) {
      navigate(teamPagePath(held.teamId), { state: { notice: PRESET_NOT_APPLIED_TEXT } });
      return;
    }
    setError(null);
    setHeld(null);
  };

  const heldDialog = (
    <RolesHeldDialog
      open={held !== null}
      heldRoles={held?.heldRoles ?? []}
      busy={busy}
      error={held ? error : null}
      onMove={onMove}
      onKeep={onKeep}
    />
  );

  if (created) {
    return (
      <div className="space-y-4" data-testid="new-team-done">
        {error && <Alert variant="danger">{error}</Alert>}
        {created.result && (
          <ApplyResultSummary
            result={created.result}
            // Every team made here is new: a reply without the notice (from scratch, a race) still
            // gets it, so the admin is never left reading an idle team as "the AI doesn't work".
            notice={created.notice ?? NEW_TEAM_NOTICE}
            warnings={created.warnings}
          />
        )}
        {!created.result && !error && !held && (
          <Alert variant="success" role="status">
            The team was created.
          </Alert>
        )}
        {/* No result = the team got no rules (none picked, or a race). The error above, when
            there is one, already says what to do; otherwise say the team is empty. */}
        {!created.result && !error && !held && (
          <Alert variant="info" role="status">
            {NO_RULES_YET_TEXT}
          </Alert>
        )}
        <Button onClick={() => navigate(teamPagePath(created.teamId))}>Open the team</Button>
        {heldDialog}
      </div>
    );
  }

  const summary = preset
    ? `${rulesCount(preset.itemCount)} from ${preset.name}`
    : `${rulesCount(picked.size)} picked`;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Start from</h3>
        {isLoading && <Spinner />}
        {presetsFailed && (
          <Alert variant="danger">{getApiErrorMessage(presetsError) ?? PRESETS_FAILED_TEXT}</Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.map((one) => (
            <div key={presetKey(one)} className="space-y-1">
              <ChoiceCard
                selected={choice === presetKey(one)}
                onSelect={() => setChoice(presetKey(one))}
              >
                <p className="text-sm font-medium">{one.name}</p>
                <p className="text-xs text-muted-foreground">{one.description}</p>
                <p className="text-xs text-muted-foreground">{rulesCount(one.itemCount)}</p>
                <div className="flex flex-wrap gap-1">
                  {one.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {TEAM_ROLE_LABELS[role]}
                    </Badge>
                  ))}
                </div>
              </ChoiceCard>
              {/* Outside the card: a button inside a ChoiceCard would nest one control in another. */}
              <RemoveWorkspacePreset preset={one} disabled={busy} />
            </div>
          ))}
          <ChoiceCard selected={fromScratch} onSelect={() => setChoice(SCRATCH)}>
            <p className="text-sm font-medium">From scratch</p>
            <p className="text-xs text-muted-foreground">Pick the rules yourself.</p>
          </ChoiceCard>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Name</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-team-name">Team name</Label>
            <Input
              id="new-team-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Input
            type="color"
            aria-label="Team colour"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="p-1 w-10 h-9"
          />
        </div>
      </section>

      {fromScratch && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Rules</h3>
          <LibraryPicker selected={picked} onChange={setPicked} />
        </section>
      )}

      {(preset !== null || fromScratch) && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Confirm</h3>
          <p className="text-sm">{summary}</p>
          {/* While the roles dialog is open it shows the error itself. */}
          {error && !held && <Alert variant="danger">{error}</Alert>}
          <Button onClick={onCreate} isLoading={busy} disabled={!ready || maybeCreated}>
            Create team
          </Button>
        </section>
      )}
      {heldDialog}
    </div>
  );
};
