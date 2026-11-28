import { useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  getOnboardingTeams,
  OnboardingCompleteError,
  saveOnboardingTeams,
  SetupInProgressError,
  type OfferedTeam,
  type TeamPickResult,
} from '@/services/onboarding.service';
import { logger } from '@/lib/logger';

/** "Still setting up" is retried on its own: every 3 s, at most 20 tries in all. */
const RETRY_MS = 3000;
const MAX_TRIES = 20;

type Props = {
  /** The save went through (some teams may still have failed: the results say which). */
  onSaved: (results: TeamPickResult[]) => void;
  /** "Skip — just the General team": nothing is saved. */
  onSkip?: () => void;
  /** There is nothing to pick here (not a preset workspace, or setup already finished). */
  onNotNeeded?: () => void;
};

type SaveError = 'slow' | 'busy' | 'other' | null;

const failureText = (result: TeamPickResult): string => {
  switch (result.reason) {
    case 'PLAN_TEAM_LIMIT':
      return "Your plan doesn't allow more teams.";
    case 'ITEMS_FAILED':
      return `Some rules couldn't be added (${result.failedItems ?? 0}). Save again to retry.`;
    case 'SEED_FAILED':
      return "Couldn't add this team's rules. Save again to retry.";
    case 'TEAM_PREFIX_TAKEN':
    case 'TEAM_NAME_TAKEN':
      return 'A team with this name already exists.';
    default:
      return "Couldn't set up this team.";
  }
};

const ResultLine = ({
  result,
  ticked,
}: {
  result: TeamPickResult | undefined;
  ticked: boolean;
}) => {
  if (!result) return null;
  if (result.outcome === 'failed') {
    return <p className="text-xs text-destructive">{failureText(result)}</p>;
  }
  if (result.outcome === 'deactivated') {
    return <p className="text-xs text-muted-foreground">Switched off</p>;
  }
  // "unchanged" for a team that was never ticked is nothing worth showing.
  if (!ticked) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-success">
      <CheckCircle className="h-3 w-3" />
      {result.outcome === 'repaired' ? 'Fixed: missing rules added' : 'Ready'}
    </p>
  );
};

/** Ticks on open: the teams already made and switched on, or the default set on a first visit. */
const initialTicks = (offered: OfferedTeam[], preTicked: string[]): string[] =>
  offered.some((team) => team.teamId !== null)
    ? offered.filter((team) => team.teamId !== null && team.active).map((team) => team.presetKey)
    : preTicked;

/**
 * The first part of the People step: which built-in teams answer the workspace's mail. General
 * is always on; "Save teams" creates (or switches on/off) the ticked ones, so the invite list
 * below can name them.
 */
export const TeamPresetPicker = ({ onSaved, onSkip, onNotNeeded }: Props) => {
  const [offered, setOffered] = useState<OfferedTeam[] | null>(null);
  const [editable, setEditable] = useState(true);
  const [ticked, setTicked] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [saveError, setSaveError] = useState<SaveError>(null);
  const [results, setResults] = useState<{ list: TeamPickResult[]; sent: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onSaved, onNotNeeded });
  callbacks.current = { onSaved, onNotNeeded };

  const load = () => {
    setLoadFailed(false);
    getOnboardingTeams()
      .then((teams) => {
        if (teams === null) {
          callbacks.current.onNotNeeded?.();
          return;
        }
        setOffered(teams.offered);
        setEditable(teams.editable);
        setTicked(initialTicks(teams.offered, teams.preTicked));
        if (!teams.editable) callbacks.current.onNotNeeded?.();
      })
      .catch((error: unknown) => {
        logger.error('Failed to load the onboarding teams:', error);
        setLoadFailed(true);
      });
  };

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const attempt = (keys: string[], tryNumber: number) => {
    saveOnboardingTeams(keys)
      .then((list) => {
        setWaiting(false);
        setSaving(false);
        setResults({ list, sent: keys });
        callbacks.current.onSaved(list);
      })
      .catch((error: unknown) => {
        if (error instanceof SetupInProgressError && tryNumber < MAX_TRIES) {
          setWaiting(true);
          timer.current = setTimeout(() => attempt(keys, tryNumber + 1), RETRY_MS);
          return;
        }
        setWaiting(false);
        setSaving(false);
        if (error instanceof OnboardingCompleteError) {
          setEditable(false);
          callbacks.current.onNotNeeded?.();
          return;
        }
        if (error instanceof SetupInProgressError) {
          setSaveError('slow');
          return;
        }
        if ((error as { code?: string }).code === 'PICK_LOCK_UNAVAILABLE') {
          setSaveError('busy');
          return;
        }
        logger.error('Failed to save the onboarding teams:', error);
        setSaveError('other');
      });
  };

  const save = () => {
    if (!offered) return;
    setSaving(true);
    setSaveError(null);
    const keys = offered.map((team) => team.presetKey).filter((key) => ticked.includes(key));
    attempt(keys, 1);
  };

  const toggle = (key: string) =>
    setTicked((prev) =>
      prev.includes(key) ? prev.filter((other) => other !== key) : [...prev, key]
    );

  if (loadFailed) {
    return (
      <Alert variant="danger">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Couldn&apos;t load your teams.
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
          {onSkip && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip — just the General team
            </Button>
          )}
        </div>
      </Alert>
    );
  }
  if (!offered) return null;

  const resultFor = (key: string) => results?.list.find((result) => result.presetKey === key);
  const errorText =
    saveError === 'slow'
      ? 'Setup is taking longer than usual. Try again.'
      : saveError === 'busy'
        ? "Couldn't save right now. Try again."
        : saveError === 'other'
          ? "Couldn't save your teams. Try again."
          : null;

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">Which teams answer your mail?</h3>
      <ul className="space-y-2">
        <li>
          <Checkbox label="General — always on" checked disabled readOnly />
        </li>
        {offered.map((team) => (
          <li key={team.presetKey} data-testid={`team-row-${team.presetKey}`}>
            <Checkbox
              label={team.description ? `${team.name} — ${team.description}` : team.name}
              checked={ticked.includes(team.presetKey)}
              disabled={!editable || saving}
              onChange={() => toggle(team.presetKey)}
            />
            <div className="pl-6">
              <ResultLine
                result={resultFor(team.presetKey)}
                ticked={results?.sent.includes(team.presetKey) ?? false}
              />
            </div>
          </li>
        ))}
      </ul>

      {!editable ? (
        <p className="text-sm text-muted-foreground">
          Setup is finished — change teams on the Teams page.
        </p>
      ) : (
        <>
          {waiting && (
            <p className="text-sm text-muted-foreground">Still setting up your workspace…</p>
          )}
          {errorText && (
            <Alert variant="danger">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {errorText}
                <Button variant="outline" size="sm" onClick={save}>
                  Retry
                </Button>
              </div>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} isLoading={saving} disabled={saving}>
              Save teams
            </Button>
            {onSkip && (
              <Button variant="ghost" onClick={onSkip} disabled={saving}>
                Skip — just the General team
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
