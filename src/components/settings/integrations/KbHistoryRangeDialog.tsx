import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { logger } from '@/lib/logger';
import { integrationsService } from '@/services/integrations.service';
import type { KbRangeApplied, KbRangeDryRun, KbRangePolicy } from '@/services/kbRangeTypes';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import type { AlertState } from './types';
import {
  KB_RANGE_ABOVE_PLAN_SUFFIX,
  KB_RANGE_CANCEL,
  KB_RANGE_CHECK,
  KB_RANGE_LOADING,
  currentSettingLabel,
  notComparedLine,
  unverifiableLine,
  KB_RANGE_COUNTING,
  KB_RANGE_SELECT_LABEL,
  KB_RANGE_STILL_COUNTING,
  KB_RANGE_TITLE,
  allowanceLine,
  applyAlert,
  confirmLabel,
  costLine,
  errorText,
  f4Caveat,
  historyLine,
  introLine,
  lastSweepLine,
  narrowingLine,
  planCaption,
  rangeLabel,
  recentLine,
  roomLines,
  sweepInProgressLine,
} from './kbRangeCopy';

type Props = {
  source: { id: number; name: string; type: 'gmail' | 'email' };
  onClose: () => void;
  onShowAlert: (alert: AlertState) => void;
  /** Called after a successful apply, before the dialog closes (the dialog itself opens the processing panel; this is only for refreshing the card). */
  onApplied?: (applied: KbRangeApplied) => void;
};

const STILL_COUNTING_MS = 30_000;
/** 0 days is "all time": the widest range. */
const reach = (days: number): number => (days === 0 ? Number.POSITIVE_INFINITY : days);

type Choice = { days: number; label: string; disabled: boolean };

const choicesOf = (policy: KbRangePolicy): Choice[] => {
  const choices: Choice[] = policy.options.map((option) => ({
    days: option.days,
    label:
      option.selectable || !option.isCurrent
        ? option.label
        : `${option.label}${KB_RANGE_ABOVE_PLAN_SUFFIX}`,
    disabled: !option.selectable,
  }));
  const current = choices.find((choice) => choice.days === policy.currentDays);
  if (current) {
    if (!current.disabled) current.label = currentSettingLabel(current.label);
  } else if (policy.type !== 'other') {
    // D12: the saved value is not a listed option (e.g. 1 day): show it as the current setting.
    const label = currentSettingLabel(rangeLabel(policy.currentDays));
    choices.unshift({ days: policy.currentDays, label, disabled: false });
  }
  return choices;
};

const defaultDays = (policy: KbRangePolicy, choices: Choice[]): number | null => {
  const selectable = choices.filter((choice) => !choice.disabled);
  if (selectable.some((choice) => choice.days === policy.currentDays)) return policy.currentDays;
  if (selectable.length === 0) return null;
  return selectable.reduce((best, choice) =>
    reach(choice.days) > reach(best.days) ? choice : best
  ).days;
};

export const KbHistoryRangeDialog = ({ source, onClose, onShowAlert, onApplied }: Props) => {
  const [policy, setPolicy] = useState<KbRangePolicy | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [result, setResult] = useState<KbRangeDryRun | null>(null);
  const [counting, setCounting] = useState(false);
  const [stillCounting, setStillCounting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setFailure] = useState<string | null>(null);
  /** Bumped by every selection change and on unmount: an older response compares and is dropped. */
  const generation = useRef(0);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      stopTimer();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    integrationsService
      .kbHistoryRange(source.id, {})
      .then((answer) => {
        if (cancelled) return;
        const loaded = answer as KbRangePolicy;
        setPolicy(loaded);
        setDays(defaultDays(loaded, choicesOf(loaded)));
      })
      .catch((failure: unknown) => {
        if (!cancelled) setFailure(errorText(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [source.id]);

  const choose = (value: string) => {
    generation.current += 1;
    setDays(Number(value));
    setResult(null);
    setFailure(null);
  };

  const check = useCallback(async () => {
    if (days === null || inFlight.current) return;
    inFlight.current = true;
    const mine = generation.current;
    setCounting(true);
    setStillCounting(false);
    setFailure(null);
    timer.current = setTimeout(() => setStillCounting(true), STILL_COUNTING_MS);
    try {
      const answer = (await integrationsService.kbHistoryRange(source.id, {
        days,
      })) as KbRangeDryRun;
      if (mounted.current && generation.current === mine) setResult(answer);
    } catch (failure) {
      if (mounted.current && generation.current === mine) setFailure(errorText(failure));
    } finally {
      inFlight.current = false;
      stopTimer();
      if (mounted.current) {
        setCounting(false);
        setStillCounting(false);
      }
    }
  }, [days, source.id]);

  const apply = async (narrower: boolean) => {
    if (days === null || applying) return;
    setApplying(true);
    setFailure(null);
    try {
      const body =
        !narrower && result
          ? {
              days,
              apply: true as const,
              estimate: {
                ...(result.history ? { historyToFetch: result.history.toFetch } : {}),
                recentToFetch: result.recent?.toFetch ?? null,
                estimatedTokens: result.estimate?.estimatedTokens ?? null,
              },
            }
          : { days, apply: true as const };
      const done = (await integrationsService.kbHistoryRange(source.id, body)) as KbRangeApplied;
      const alert = applyAlert(done, source.type);
      if (source.type === 'gmail' && done.sweepRequested) {
        useProcessingPanelStore.getState().open(source.id, 'manual');
      }
      onShowAlert({ open: true, title: alert.title, description: alert.body, variant: 'success' });
      onApplied?.(done);
      onClose();
    } catch (failure) {
      logger.error('Failed to change the KB history range:', failure);
      if (mounted.current) setFailure(errorText(failure));
    } finally {
      if (mounted.current) setApplying(false);
    }
  };

  const choices = policy ? choicesOf(policy) : [];
  const blocked = policy?.blocked ?? null;
  const narrower = policy !== null && days !== null && reach(days) < reach(policy.currentDays);
  const showIntro = policy !== null && !blocked && policy.type !== 'other';
  const sweepLine = policy ? lastSweepLine(policy.lastSweep) : null;

  const renderResult = (dryRun: KbRangeDryRun) => {
    const lines = [
      dryRun.history ? historyLine(dryRun.history) : null,
      dryRun.history && dryRun.history.unverifiable > 0
        ? unverifiableLine(dryRun.history.unverifiable)
        : null,
      dryRun.history && dryRun.history.notCompared > 0
        ? notComparedLine(dryRun.history.notCompared)
        : null,
      recentLine(dryRun.recent, dryRun.days, dryRun.kbCutoff),
      costLine(dryRun.estimate, dryRun.aiMode, dryRun.recent?.toFetch ?? 0, dryRun.history),
      allowanceLine(dryRun.aiAllowance, dryRun.kbLimitReachedToday, dryRun.aiMode),
      ...roomLines(dryRun.room, dryRun.history?.toFetch ?? 0, dryRun.history),
      f4Caveat(dryRun.type, dryRun.days, dryRun.openWindowDays),
    ].filter((line): line is string => Boolean(line));
    return (
      <div className="space-y-2 text-sm" data-testid="kb-range-result">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    );
  };

  const confirmText = result
    ? confirmLabel({
        narrower: result.direction === 'narrower',
        capped: Boolean(result.history?.capped || result.recent?.capped),
        toFetch: (result.history?.toFetch ?? 0) + (result.recent?.toFetch ?? 0),
        approximate: Boolean(result.history?.approximate || result.recent?.approximate),
        timedOut: Boolean(result.history?.timedOut || result.recent?.timedOut),
      })
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="lg">
      <DialogHeader>
        <DialogTitle>{KB_RANGE_TITLE}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-3">
        {!policy && !error && <p className="text-sm text-muted-foreground">{KB_RANGE_LOADING}</p>}
        {policy && showIntro && (
          <p className="text-sm text-muted-foreground">
            {introLine(policy.name, policy.kbCutoff, policy.currentDays)}
          </p>
        )}
        {policy && !blocked && policy.planMaxHistoryDays !== null && (
          <p className="text-xs text-muted-foreground">{planCaption(policy.planMaxHistoryDays)}</p>
        )}
        {blocked && <p className="text-sm">{blocked.message}</p>}
        {policy && !blocked && policy.aiUnavailable && (
          <p className="text-sm text-amber-600">{policy.aiUnavailable.message}</p>
        )}
        {policy && !blocked && policy.sweepInProgress && (
          <p className="text-sm">{sweepInProgressLine(policy.type)}</p>
        )}
        {policy && !blocked && sweepLine && policy.lastSweep.state !== 'complete' && (
          <p className="text-sm text-muted-foreground">{sweepLine}</p>
        )}
        {policy && !blocked && days !== null && (
          <Select
            label={KB_RANGE_SELECT_LABEL}
            value={String(days)}
            onChange={choose}
            options={choices.map((choice) => ({
              value: String(choice.days),
              label: choice.label,
              isDisabled: choice.disabled,
            }))}
          />
        )}
        {counting && (
          <p className="flex gap-2 items-center text-sm" role="status">
            <Spinner />
            <span>{KB_RANGE_COUNTING}</span>
          </p>
        )}
        {counting && stillCounting && <p className="text-sm">{KB_RANGE_STILL_COUNTING}</p>}
        {!blocked && narrower && <p className="text-sm">{narrowingLine()}</p>}
        {result && !narrower && renderResult(result)}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {KB_RANGE_CANCEL}
        </Button>
        {policy && !blocked && narrower && (
          <Button onClick={() => void apply(true)} isLoading={applying}>
            {confirmLabel({
              narrower: true,
              capped: false,
              toFetch: 0,
              approximate: false,
              timedOut: false,
            })}
          </Button>
        )}
        {policy && !narrower && (
          <Button
            variant={result ? 'outline' : 'primary'}
            onClick={() => void check()}
            disabled={Boolean(blocked) || counting || days === null || applying}
          >
            {KB_RANGE_CHECK}
          </Button>
        )}
        {result && !narrower && confirmText && (
          <Button
            onClick={() => void apply(false)}
            disabled={counting || applying}
            isLoading={applying}
          >
            {confirmText}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
};
