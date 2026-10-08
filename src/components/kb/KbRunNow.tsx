import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { useWorkspaceNameWhen } from '@/hooks/useWorkspaceNameWhen';
import { consolidationSwitchText } from '@/components/kb/kbSwitchText';
import {
  kbConsolidationService,
  type KbConsolidationLastRun,
  type KbConsolidationRunState,
  type KbConsolidationSwitches,
} from '@/services/kbConsolidation.service';

/** While a run holds the workspace the state is re-read this often. */
export const RUN_POLL_MS = 10_000;

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * What a 409 reason means for the person who clicked (BE `RunNowRefusal`). `disabled` is the text
 * for a backend before `switches`; a newer one names the switch through `consolidationSwitchText`.
 */
export const RUN_REFUSAL_TEXT: Record<string, string> = {
  disabled:
    'Consolidation is switched off for this workspace (feature flag kb.consolidation_enabled). Ask the platform admin to turn it on.',
  dry_run_unreadable:
    'The calibration setting for this workspace could not be read, so nothing runs until it can.',
  dry_run_no_series: 'This workspace is set to a calibration run that has no series yet.',
  workspace_blocked: 'This workspace is blocked until a plan is chosen, so no AI work runs.',
  no_provider: 'No AI provider is configured for this workspace.',
  already_running: 'A run is already going on for this workspace.',
  cooldown: 'The last run finished only a few minutes ago.',
  busy: "Another workspace's run is going on. Try again in a few minutes.",
  daily_limit: "Today's manual runs for this workspace are used up. The nightly run still happens.",
};

/** Refusals whose reason IS a switch: the switch line is not repeated under them. */
const SWITCH_REFUSALS: readonly string[] = ['disabled', 'dry_run_unreadable'];

/** Why a run did not start; a cooldown says when it can. Unknown reasons keep their code. */
export const refusalText = (reason: string, retryAfter: string | null): string => {
  const text = RUN_REFUSAL_TEXT[reason];
  if (!text) return `The run did not start (${reason}).`;
  return reason === 'cooldown' && retryAfter
    ? `${text} Try again after ${timeOf(retryAfter)}.`
    : text;
};

/**
 * A refusal's text. With `switches` (a newer backend) a `disabled` refusal names the switch that
 * is off and where it is; without them, today's text.
 */
export const refusalTextFor = (
  reason: string,
  retryAfter: string | null,
  switches: KbConsolidationSwitches | null | undefined,
  workspaceName?: string | null
): string => {
  if (reason === 'disabled') {
    const named = consolidationSwitchText(switches, workspaceName);
    if (named) return named;
  }
  return refusalText(reason, retryAfter);
};

/**
 * One line about the last run that is true in each state the backend records. `switchesKnown`:
 * the backend sends `switches`, so the line under it says which switch is off NOW — the last
 * run's skip only says that it was off then, never where to turn it on (that may have changed).
 */
export const lastRunText = (last: KbConsolidationLastRun, switchesKnown = false): string => {
  const who = last.trigger === 'manual' ? 'Last run (started by hand)' : 'Last nightly run';
  const at = timeOf(last.finishedAt);
  if (last.outcome === 'failed') return `${who} failed at ${at}.`;
  if (last.outcome === 'skipped') {
    if (switchesKnown && last.skipped === 'disabled')
      return `${who} did not run (${at}): consolidation was switched off.`;
    const known = last.skipped ? RUN_REFUSAL_TEXT[last.skipped] : undefined;
    return known
      ? `${who} did not run (${at}): ${known}`
      : `${who} was skipped at ${at} (${last.skipped ?? 'no reason given'}).`;
  }
  return `${who} finished at ${at}${last.partial ? ' — it stopped at its time or budget limit; the next run continues' : ''}.`;
};

type Props = {
  /** Called once when a run this page saw going on has ended, to reload the report. */
  onRunEnded: () => void;
};

/**
 * "Run now" for KB consolidation: the nightly run (grouping into cases + the quality review),
 * started on request. Hidden on a backend without the route and for anyone but a KB moderator; the
 * button only for a workspace admin.
 */
export const KbRunNow = ({ onRunEnded }: Props) => {
  const [state, setState] = useState<KbConsolidationRunState | null>(null);
  const [starting, setStarting] = useState(false);
  const [refusal, setRefusal] = useState<{
    reason: string;
    retryAfter: string | null;
    switches?: KbConsolidationSwitches;
  } | null>(null);
  // A start that failed outright (not a 409): its message is shown as it came.
  const [startError, setStartError] = useState<string | null>(null);
  // Keep reading even while idle while reads fail on the network or the server — otherwise one
  // failed read leaves the page silent for good. (After a start the backend already holds the
  // lock, so the next read sees the run going on and the `running` polling takes over.)
  const [watching, setWatching] = useState(false);
  const wasRunning = useRef(false);
  // Only the newest read may apply: a slow read must not land after a newer one.
  const latestRead = useRef(0);
  const lastSeen = useRef<string | null>(null);
  // A ref, so a report reload (new `onRunEnded`) does not restart the polling.
  const onRunEndedRef = useRef(onRunEnded);
  onRunEndedRef.current = onRunEnded;

  /** `afterRefusal`: the read that follows a refusal must not clear the refusal it explains. */
  const refresh = useCallback(async (afterRefusal = false) => {
    const readId = ++latestRead.current;
    try {
      const next = await kbConsolidationService.getRunState();
      if (readId !== latestRead.current) return;
      setState(next);
      const running = next !== null && next.runningSince !== null;
      const finishedAt = next?.last?.finishedAt ?? null;
      // A newer run outcome, seen later, makes an earlier refusal stale.
      if (!afterRefusal && finishedAt !== lastSeen.current) {
        setRefusal(null);
        setStartError(null);
      }
      lastSeen.current = finishedAt;
      if (wasRunning.current && !running) onRunEndedRef.current();
      wasRunning.current = running;
      setWatching(false);
    } catch (err) {
      if (readId !== latestRead.current) return;
      // Not allowed to read the run state (signed out, role revoked, no such route): nothing we
      // show would be true any more — hide the control, and with no state the polling stops.
      // Anything else (network, 5xx, 408 timeout, 429 rate limit) is passing: keep the last known
      // state and keep reading — one failed read must not end the watch.
      const status = getErrorStatus(err);
      if (status === 401 || status === 403 || status === 404) {
        setState(null);
        setWatching(false);
        return;
      }
      setWatching(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = state !== null && state.runningSince !== null;
  useEffect(() => {
    if (!running && !watching) return;
    const timer = setInterval(() => void refresh(), RUN_POLL_MS);
    return () => clearInterval(timer);
  }, [running, watching, refresh]);

  // Why no real cases are made, from what the backend says NOW (null: nothing to say, or an
  // older backend without `switches`).
  const switchesNow = state?.switches;
  const refusalSwitches = refusal?.switches ?? switchesNow;
  const needsName =
    consolidationSwitchText(switchesNow) !== null ||
    (refusal?.reason === 'disabled' && consolidationSwitchText(refusalSwitches) !== null);
  const workspaceName = useWorkspaceNameWhen(needsName);

  if (!state) return null;

  const switchLine = consolidationSwitchText(switchesNow, workspaceName);
  const refusalLine =
    startError ??
    (refusal
      ? refusalTextFor(refusal.reason, refusal.retryAfter, refusalSwitches, workspaceName)
      : null);

  // A refusal that is ABOUT the switches already says why; the line would say it twice.
  const refusalCoversSwitches = refusal !== null && SWITCH_REFUSALS.includes(refusal.reason);

  const start = async () => {
    setStarting(true);
    setRefusal(null);
    setStartError(null);
    try {
      const result = await kbConsolidationService.runNow();
      if (result.started) {
        // Even a run that ends before the next read must reload the report when it is seen idle.
        wasRunning.current = true;
        toast.success('Run started', { description: 'This page updates when it finishes.' });
        await refresh();
      } else {
        setRefusal({
          reason: result.reason,
          retryAfter: result.retryAfter,
          ...(result.switches ? { switches: result.switches } : {}),
        });
        await refresh(true);
      }
    } catch (err) {
      setStartError(getApiErrorMessage(err) ?? 'The run could not be started.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 items-end" data-testid="kb-run-now">
      {state.canRun && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void start()}
          isLoading={starting}
          disabled={running || starting}
        >
          <Play className="mr-1 w-4 h-4" />
          {running ? 'Running…' : 'Run now'}
        </Button>
      )}
      {/* A live region: a run ending is announced. Refusals have their own region below. */}
      <p
        className="text-xs text-right text-muted-foreground"
        role="status"
        data-testid="kb-run-status"
      >
        {running && state.runningSince
          ? `Running since ${timeOf(state.runningSince)}.`
          : state.last
            ? lastRunText(state.last, state.switches !== undefined)
            : 'No run recorded yet. Runs nightly at 05:00 (server time).'}
      </p>
      {/* Which switch keeps real cases from being made, and where it is. Not repeated when a
          refusal below already says the same. */}
      {switchLine && !refusalCoversSwitches && (
        <p className="text-xs text-right text-muted-foreground" data-testid="kb-run-switches">
          {switchLine}
        </p>
      )}
      {/* Mounted with the control: a live region inserted together with its text is not announced. */}
      <p className="text-xs text-right text-warning" role="status" data-testid="kb-run-refusal">
        {refusalLine ?? ''}
      </p>
    </div>
  );
};
