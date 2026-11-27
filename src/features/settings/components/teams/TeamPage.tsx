import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { useDepartments } from '@/hooks/useDepartments';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  RolesHeldError,
  teamBuilderService,
  type ApplyResult,
  type HeldRole,
  type PresetView,
  type SkippedRule,
} from '../../services/teamBuilder.service';
import { AddFromLibraryDialog } from './AddFromLibraryDialog';
import { ApplyPresetDialog } from './ApplyPresetDialog';
import { ApplyResultSummary } from './ApplyResultSummary';
import { RolesHeldDialog } from './RolesHeldDialog';
import { SaveAsPresetDialog } from './SaveAsPresetDialog';
import { TeamRolesEditor } from './TeamRolesEditor';
import { TeamRulesTab } from './TeamRulesTab';
import { TEAM_FLOW_LABELS } from './teamLabels';

const NOT_FOUND_TEXT = 'This team does not exist or is switched off.';
const SUMMARY_ERROR_TEXT = "Could not load this team's rules.";
const FALLBACK_COLOR = '#6366f1';

type Dialogs = 'library' | 'preset' | 'save' | null;
type Outcome =
  | { kind: 'applied'; result: ApplyResult }
  | { kind: 'saved'; name: string; skipped: SkippedRule[] };

/** Shown for an unknown, switched-off or malformed team id. */
export const TeamNotFound = () => (
  <div className="space-y-2">
    <Alert variant="warning">{NOT_FOUND_TEXT}</Alert>
    <Link to="/settings#teams" className="text-sm text-primary underline">
      Back to Teams
    </Link>
  </div>
);

/** One team: its roles, its rules per flow, and the ways to add rules to it. */
export const TeamPage = ({ teamId }: { teamId: number }) => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const { data: teams, isLoading, refetch: refetchTeams } = useDepartments({ includeInactive: true });
  const [tab, setTab] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [held, setHeld] = useState<{ heldRoles: HeldRole[]; preset: PresetView } | null>(null);
  const inFlight = useRef(false);

  const team = teams?.find((one) => one.id === teamId && one.active);
  const {
    data: summary = [],
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['team-rule-summary', teamId],
    queryFn: () => teamBuilderService.ruleSummary(teamId),
    enabled: team !== undefined,
  });
  if (isLoading || !teams) return <Spinner />;
  if (!team) return <TeamNotFound />;

  const refreshRules = () => {
    void queryClient.invalidateQueries({ queryKey: ['team-rule-summary', teamId] });
    void queryClient.invalidateQueries({ queryKey: ['team-rules', teamId] });
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
    void refetchTeams();
  };

  /** One request at a time: a second click while one is out does nothing. */
  const run = async (work: () => Promise<Outcome | null>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      if (next) {
        setOutcome(next);
        setDialog(null);
        setHeld(null);
        refreshRules();
      }
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'That did not work. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const closeDialog = () => {
    setError(null);
    setDialog(null);
  };

  const openDialog = (next: Dialogs) => {
    setError(null);
    setDialog(next);
  };

  const applied = (result: ApplyResult): Outcome => ({ kind: 'applied', result });
  const addItems = (ids: number[]) =>
    run(async () => applied(await teamBuilderService.applyItems(teamId, ids)));
  const applyPreset = (preset: PresetView, moveRoles: boolean) =>
    run(async () => {
      try {
        const ref = { scope: preset.scope, id: preset.id };
        return applied(await teamBuilderService.applyPreset(teamId, ref, moveRoles || undefined));
      } catch (err) {
        if (err instanceof RolesHeldError) {
          setDialog(null);
          setHeld({ heldRoles: err.heldRoles, preset });
          return null;
        }
        throw err;
      }
    });
  const savePreset = (input: { name: string; description: string }) =>
    run(async () => {
      const res = await teamBuilderService.saveAsPreset(teamId, input);
      void queryClient.invalidateQueries({ queryKey: ['team-presets'] });
      return { kind: 'saved', name: res.preset.name, skipped: res.skipped };
    });

  const tabs = summary.map((entry) => ({
    id: entry.flow,
    label: `${TEAM_FLOW_LABELS[entry.flow] ?? entry.flow} (${entry.total})`,
  }));
  const active = summary.find((entry) => entry.flow === tab) ?? summary[0];

  return (
    <div className="space-y-5" data-testid="team-page">
      {notice && <Alert variant="info">{notice}</Alert>}
      <header className="space-y-3">
        <div className="flex gap-2 items-center">
          <span
            className="inline-block w-4 h-4 rounded-full"
            style={{ backgroundColor: team.color ?? FALLBACK_COLOR }}
          />
          <h2 className="text-lg font-semibold">{team.name}</h2>
          {team.isDefault && <Badge variant="secondary">Default</Badge>}
        </div>
        <TeamRolesEditor team={team} teams={teams} onChanged={() => {
            void refetchTeams();
            void queryClient.invalidateQueries({ queryKey: ['departments'] });
          }} />
      </header>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => openDialog('library')}>
          Add rules from the library
        </Button>
        <Button variant="outline" onClick={() => openDialog('preset')}>
          Apply a preset
        </Button>
        <Button variant="outline" onClick={() => openDialog('save')}>
          Save as preset
        </Button>
      </div>
      {error && dialog === null && held === null && <Alert variant="danger">{error}</Alert>}
      {outcome?.kind === 'applied' && <ApplyResultSummary result={outcome.result} />}
      {outcome?.kind === 'saved' && (
        <Alert variant={outcome.skipped.length > 0 ? 'warning' : 'success'} role="status">
          <p>Saved the preset {outcome.name}.</p>
          {outcome.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {outcome.skipped.map((item) => (
                <li key={`${item.flow}-${item.name}`}>
                  {item.name} ({TEAM_FLOW_LABELS[item.flow] ?? item.flow}): {item.reason}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {summaryLoading && <Spinner />}
      {summaryError && (
        <Alert variant="danger">
          <p>{SUMMARY_ERROR_TEXT}</p>
          <Button size="sm" variant="outline" onClick={() => void refetchSummary()}>
            Retry
          </Button>
        </Alert>
      )}
      {active && (
        <Tabs tabs={tabs} activeTab={active.flow} onTabChange={setTab} variant="simple">
          <TeamRulesTab
            key={active.flow}
            teamId={teamId}
            flow={active.flow}
            counted={active.neverFired !== null}
          />
        </Tabs>
      )}
      {dialog === 'library' && (
        <AddFromLibraryDialog open busy={busy} error={error} onClose={closeDialog} onAdd={addItems} />
      )}
      {dialog === 'preset' && (
        <ApplyPresetDialog
          open
          busy={busy}
          error={error}
          onClose={closeDialog}
          onApply={(preset) => void applyPreset(preset, false)}
        />
      )}
      {dialog === 'save' && (
        <SaveAsPresetDialog open busy={busy} error={error} onClose={closeDialog} onSave={savePreset} />
      )}
      <RolesHeldDialog
        open={held !== null}
        heldRoles={held?.heldRoles ?? []}
        busy={busy}
        error={error}
        onMove={() => held && void applyPreset(held.preset, true)}
        onKeep={() => {
          setError(null);
          setHeld(null);
        }}
      />
    </div>
  );
};
