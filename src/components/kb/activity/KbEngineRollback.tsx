import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { apiErrorMessage } from '@/lib/apiError';
import { rollbackEngineWindow } from '@/services/kbEngine.service';
import {
  KB_ENGINE_WEEK_ACTIONS,
  type KbEngineWeekAction,
  type KbRollbackResult,
  type KbRollbackSkip,
} from '@/services/kbEngine.types';
import { ENGINE_ACTION_LABEL, rollbackSkipText } from './kbActivityCopy';

/** The server's own bound (ROLLBACK_MAX_DAYS). */
export const ROLLBACK_MAX_DAYS = 31;
const DAY_MS = 86_400_000;
const ALL_ACTIONS = 'all';
/** Entry links listed per skip reason. */
const LINKS_SHOWN = 8;

/** `YYYY-MM-DD` in local time. */
const dayInput = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The window from the start of `from` to the end of `to` (local days), or why not. */
export const rollbackWindow = (
  from: string,
  to: string
): { from: string; to: string } | { error: string } => {
  const start = new Date(`${from}T00:00:00`);
  const endDay = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime()))
    return { error: 'Pick both days.' };
  const end = new Date(endDay.getTime() + DAY_MS);
  if (end.getTime() <= start.getTime())
    return { error: 'The last day must not be before the first.' };
  if (end.getTime() - start.getTime() > ROLLBACK_MAX_DAYS * DAY_MS)
    return { error: `Pick at most ${ROLLBACK_MAX_DAYS} days.` };
  return { from: start.toISOString(), to: end.toISOString() };
};

/** Pages of one run (dry or real), added up. */
type Totals = {
  dryRun: boolean;
  matched: number;
  restored: number;
  entryIds: number[];
  alreadyAtTarget: number;
  skipped: KbRollbackSkip[];
  next: number | null;
};

const addPage = (prev: Totals | null, page: KbRollbackResult): Totals => ({
  dryRun: page.dryRun,
  matched: page.matched,
  restored: (prev?.restored ?? 0) + page.restored,
  entryIds: [...(prev?.entryIds ?? []), ...page.entryIds],
  alreadyAtTarget: (prev?.alreadyAtTarget ?? 0) + page.alreadyAtTarget.length,
  skipped: [...(prev?.skipped ?? []), ...page.skipped],
  next: page.truncated ? page.nextAfterEntryId : null,
});

const entryHref = (id: number) => `/knowledge-base?view=live&status=all&id=${id}`;

const SkippedList = ({ skipped }: { skipped: KbRollbackSkip[] }) => {
  const groups = new Map<string, KbRollbackSkip[]>();
  for (const skip of skipped) {
    const text = rollbackSkipText(skip);
    groups.set(text, [...(groups.get(text) ?? []), skip]);
  }
  return (
    <ul className="space-y-1 text-sm" aria-label="Left as they are">
      {[...groups.entries()].map(([text, items]) => (
        <li key={text} className="break-words">
          <span className="font-medium">{items.length}</span> · {text}:{' '}
          {items.slice(0, LINKS_SHOWN).map((skip, index) => (
            <span key={skip.entryId}>
              {index > 0 && ', '}
              <Link to={entryHref(skip.entryId)} className="underline">
                #{skip.entryId}
              </Link>
            </span>
          ))}
          {items.length > LINKS_SHOWN && ` and ${items.length - LINKS_SHOWN} more`}
        </li>
      ))}
    </ul>
  );
};

/**
 * Roll back what the engine did in a window (workspace owner / admin only; the server checks it
 * too). A dry run first says what would be put back and what is left as it is, and why; only
 * then does "Roll back" run it, after a confirm. Long windows come in pages: "Continue".
 */
export const KbEngineRollback = ({
  departmentId,
  onRolledBack,
}: {
  departmentId?: number;
  onRolledBack?: () => void;
}) => {
  const today = new Date();
  const [from, setFrom] = useState(dayInput(new Date(today.getTime() - 6 * DAY_MS)));
  const [to, setTo] = useState(dayInput(today));
  const [action, setAction] = useState<string>(ALL_ACTIONS);
  const [result, setResult] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const period = rollbackWindow(from, to);
  const windowError = 'error' in period ? period.error : null;

  const run = async (dryRun: boolean, afterEntryId?: number, prev: Totals | null = null) => {
    if ('error' in period) return;
    setBusy(true);
    setError(null);
    try {
      const page = await rollbackEngineWindow({
        from: period.from,
        to: period.to,
        dryRun,
        ...(action !== ALL_ACTIONS ? { actions: [action as KbEngineWeekAction] } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(afterEntryId ? { afterEntryId } : {}),
      });
      setResult(addPage(prev, page));
      if (!dryRun) onRolledBack?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not roll back. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  // A changed window or action makes the last result about something else.
  const change = (apply: () => void) => {
    apply();
    setResult(null);
    setError(null);
  };

  const wouldRestore = result ? result.entryIds.length : 0;

  return (
    <section
      className="space-y-3"
      aria-label="Roll back the engine"
      data-testid="kb-engine-rollback"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Roll back a period</h3>
        <p className="text-xs text-muted-foreground">
          Put entries back as they were before the engine changed them, up to {ROLLBACK_MAX_DAYS}{' '}
          days at a time. You see what would happen first; nothing changes until you confirm.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="kb-rollback-from">From</Label>
          <Input
            id="kb-rollback-from"
            type="date"
            value={from}
            onChange={(event) => change(() => setFrom(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kb-rollback-to">To</Label>
          <Input
            id="kb-rollback-to"
            type="date"
            value={to}
            onChange={(event) => change(() => setTo(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kb-rollback-action">Action</Label>
          <Select
            id="kb-rollback-action"
            aria-label="Action"
            value={action}
            onChange={(next) => change(() => setAction(String(next)))}
            options={[
              { value: ALL_ACTIONS, label: 'Every engine action' },
              ...KB_ENGINE_WEEK_ACTIONS.map((key) => ({
                value: key,
                label: ENGINE_ACTION_LABEL[key],
              })),
            ]}
          />
        </div>
      </div>
      {windowError && <p className="text-sm text-destructive">{windowError}</p>}
      {error && (
        <Alert variant="danger" className="py-2 text-sm">
          {error}
        </Alert>
      )}
      {!result && (
        <Button
          variant="outline"
          size="sm"
          disabled={windowError !== null}
          isLoading={busy}
          onClick={() => void run(true)}
        >
          Check what would change
        </Button>
      )}
      {result && (
        <div className="p-3 space-y-2 rounded-lg border" data-testid="kb-rollback-result">
          {result.dryRun ? (
            <p className="text-sm text-foreground">
              <span className="font-medium">{result.matched}</span> entries were changed by the
              engine in this period. Rolling back would put{' '}
              <span className="font-medium">{wouldRestore}</span> back
              {result.skipped.length > 0 && (
                <>
                  {' '}
                  and leave <span className="font-medium">{result.skipped.length}</span> as they are
                </>
              )}
              .
            </p>
          ) : (
            <p className="text-sm text-foreground">
              Rolled back: <span className="font-medium">{result.restored}</span> put back
              {result.alreadyAtTarget > 0 && `, ${result.alreadyAtTarget} were already as before`}
              {result.skipped.length > 0 && `, ${result.skipped.length} left as they are`}.
            </p>
          )}
          {result.skipped.length > 0 && <SkippedList skipped={result.skipped} />}
          {result.next !== null && (
            <p className="text-xs text-muted-foreground">
              {result.dryRun
                ? 'More entries to check in this period.'
                : 'More entries to roll back in this period.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {result.next !== null && (
              <Button
                variant="outline"
                size="sm"
                isLoading={busy}
                onClick={() => void run(result.dryRun, result.next ?? undefined, result)}
              >
                Continue
              </Button>
            )}
            {result.dryRun && result.next === null && wouldRestore > 0 && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Roll back
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => change(() => {})}>
              {result.dryRun ? 'Cancel' : 'Done'}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          setConfirming(false);
          setResult(null);
          void run(false);
        }}
        title="Roll back the engine?"
        description={`About ${wouldRestore} entries go back to how they were before the engine changed them. Entries a person changed later are left as they are. Each undo counts as a Disagree rating.`}
        confirmText="Roll back"
        variant="warning"
      />
    </section>
  );
};
