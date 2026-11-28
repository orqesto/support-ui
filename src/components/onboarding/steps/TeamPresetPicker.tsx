import { useContext, useEffect, useRef, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
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
  /**
   * Hands the wizard a function for its Next button: it saves unsaved ticks first and answers
   * whether the wizard may go on (false = the save failed, the error is shown here). Called with
   * null when the picker goes away.
   */
  registerBeforeNext?: (beforeNext: (() => Promise<boolean>) | null) => void;
};

type SaveError = 'slow' | 'busy' | 'other' | null;

const failureText = (result: TeamPickResult): string => {
  switch (result.reason) {
    case 'PLAN_TEAM_LIMIT':
      return "Your plan doesn't allow more teams. General is included; upgrade to add more.";
    case 'ITEMS_FAILED':
      return result.failedItems === undefined
        ? "Some rules couldn't be added. Save again to retry."
        : `Some rules couldn't be added (${result.failedItems}). Save again to retry.`;
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
export const TeamPresetPicker = ({ onSaved, onSkip, onNotNeeded, registerBeforeNext }: Props) => {
  const queryClient = useContext(QueryClientContext);
  const [offered, setOffered] = useState<OfferedTeam[] | null>(null);
  const [editable, setEditable] = useState(true);
  const [ticked, setTicked] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [saveError, setSaveError] = useState<SaveError>(null);
  const [results, setResults] = useState<{ list: TeamPickResult[]; sent: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // False once the picker is gone: an answer that lands later must not set state, start a retry
  // timer or call the parent.
  const alive = useRef(true);
  // Set synchronously, so a second click before the re-render cannot start a second save.
  const inFlight = useRef(false);
  const callbacks = useRef({ onSaved, onNotNeeded });
  callbacks.current = { onSaved, onNotNeeded };
  // What the server holds (or the admin chose to skip) as of now; null = nothing saved yet.
  const savedKeys = useRef<string[] | null>(null);
  // Next presses waiting for a save that is running or about to run.
  const waiters = useRef<Array<(ok: boolean) => void>>([]);
  const settleWaiters = (ok: boolean) => {
    const pending = waiters.current;
    waiters.current = [];
    pending.forEach((resolve) => resolve(ok));
  };
  const latest = useRef({ offered, editable, ticked });
  latest.current = { offered, editable, ticked };
  // The load still running, and what it found (set before the state lands): a Next pressed
  // before the first render waits for it instead of skipping the pre-ticked teams.
  const loading = useRef<Promise<void> | null>(null);
  const loaded = useRef<{ offered: OfferedTeam[]; editable: boolean; ticked: string[] } | null>(
    null
  );

  const load = () => {
    setLoadFailed(false);
    loaded.current = null;
    loading.current = getOnboardingTeams()
      .then((teams) => {
        if (!alive.current) return;
        if (teams === null) {
          callbacks.current.onNotNeeded?.();
          return;
        }
        setOffered(teams.offered);
        setEditable(teams.editable);
        const initial = initialTicks(teams.offered, teams.preTicked);
        setTicked(initial);
        loaded.current = { offered: teams.offered, editable: teams.editable, ticked: initial };
        // Teams already made: what is ticked IS what is saved, so the invite list is open.
        if (teams.offered.some((team) => team.teamId !== null)) {
          savedKeys.current = initial;
          callbacks.current.onSaved([]);
        }
        if (!teams.editable) callbacks.current.onNotNeeded?.();
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        logger.error('Failed to load the onboarding teams:', error);
        setLoadFailed(true);
      });
  };

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const attempt = (keys: string[], tryNumber: number) => {
    saveOnboardingTeams(keys)
      .then((list) => {
        if (!alive.current) return;
        inFlight.current = false;
        setWaiting(false);
        setSaving(false);
        setResults({ list, sent: keys });
        savedKeys.current = keys;
        // The new teams must show in the switcher and the lists at once.
        void queryClient?.invalidateQueries({ queryKey: ['departments'] });
        callbacks.current.onSaved(list);
        // A Next that started this save stays on the step when a team failed: its result line
        // must be seen. Pressing Next again goes on (nothing is left to save).
        settleWaiters(!list.some((result) => result.outcome === 'failed'));
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        if (error instanceof SetupInProgressError && tryNumber < MAX_TRIES) {
          setWaiting(true);
          timer.current = setTimeout(() => attempt(keys, tryNumber + 1), RETRY_MS);
          return;
        }
        inFlight.current = false;
        setWaiting(false);
        setSaving(false);
        if (error instanceof OnboardingCompleteError) {
          setEditable(false);
          callbacks.current.onNotNeeded?.();
          settleWaiters(true);
          return;
        }
        settleWaiters(false);
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
    if (!offered || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    const keys = offered.map((team) => team.presetKey).filter((key) => ticked.includes(key));
    attempt(keys, 1);
  };

  const sameKeys = (first: string[], second: string[]) =>
    first.length === second.length && first.every((key) => second.includes(key));

  // The wizard's Next on this step: unsaved ticks are saved first, so the admin never leaves
  // with General only after seeing Support ticked.
  const decide = (
    list: OfferedTeam[] | null,
    canEdit: boolean,
    current: string[]
  ): Promise<boolean> => {
    if (!list || !canEdit) return Promise.resolve(true);
    if (inFlight.current) return new Promise((resolve) => waiters.current.push(resolve));
    const keys = list.map((team) => team.presetKey).filter((key) => current.includes(key));
    if (savedKeys.current !== null && sameKeys(savedKeys.current, keys))
      return Promise.resolve(true);
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      inFlight.current = true;
      setSaving(true);
      setSaveError(null);
      attempt(keys, 1);
    });
  };
  const beforeNext = (): Promise<boolean> => {
    const { offered: list, editable: canEdit, ticked: current } = latest.current;
    if (list || !loading.current) return decide(list, canEdit, current);
    // Still loading: wait for the answer, then apply the same rule.
    return loading.current.then(() => {
      const found = loaded.current;
      return found ? decide(found.offered, found.editable, found.ticked) : true;
    });
  };
  const beforeNextRef = useRef(beforeNext);
  beforeNextRef.current = beforeNext;
  useEffect(() => {
    registerBeforeNext?.(() => beforeNextRef.current());
    return () => {
      registerBeforeNext?.(null);
      // The picker is gone (Back): a Next still waiting on its save must not wait forever.
      settleWaiters(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skip: nothing is saved, and Next must not save the ticks the admin chose to ignore.
  const skip = () => {
    savedKeys.current = latest.current.ticked;
    onSkip?.();
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
            <Button variant="ghost" size="sm" onClick={skip}>
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
            <div className="pl-6" role="status">
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
            <p className="text-sm text-muted-foreground" role="status">
              Still setting up your workspace…
            </p>
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
              <Button variant="ghost" onClick={skip} disabled={saving}>
                Skip — just the General team
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
