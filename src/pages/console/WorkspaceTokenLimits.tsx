import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { fallbackLayer } from '@/lib/limitFallback';
import { describeNextReset } from '@/lib/utcClock';
import {
  managedAiUsageService,
  type ManagedAiUsage,
  type OrgTokenBudget,
  type TokenForecast,
  type TokenLimit,
} from '@/services/managedAiUsage.service';
import {
  changedLimitEdit,
  describeDays,
  describeLimit,
  formatLimit,
  KB_MIN_TOKENS_PER_DAY,
  LEVEL_CLASS,
  parseKbLimitInput,
  parseLimitInput,
  toastLimitSaved,
  usageLevel,
} from './tokenLimits.helpers';

type Budgets = NonNullable<ManagedAiUsage['totals']['tokenBudgets']>;

const LEVEL_WORDS = { near: '≥ 80%', reached: 'limit reached' } as const;

/** One line of the cell: "KB 1,200,000 / 5,000,000", coloured at ≥80% and at the limit. */
const UsageLine = ({ label, spent, limit }: { label: string; spent: number; limit: number }) => {
  const level = usageLevel(spent, limit);
  return (
    <span className={`text-xs tabular-nums ${LEVEL_CLASS[level]}`}>
      {label} {spent.toLocaleString()} / {formatLimit(limit)}
      {(level === 'near' || level === 'reached') && ` · ${LEVEL_WORDS[level]}`}
    </span>
  );
};

/**
 * Whose limits the row shows: an override may set only ONE limit, the other following the
 * platform — "custom limits" overstated it (FE audit pass 9, NIT).
 */
export const describeLimitSource = (override: OrgTokenBudget['override']): string => {
  const kb = typeof override?.kbTokensPerDay === 'number';
  const regular = typeof override?.regularTokensPerDay === 'number';
  if (kb && regular) return 'custom limits';
  if (kb) return 'custom KB limit · platform regular limit';
  if (regular) return 'custom regular limit · platform KB limit';
  return 'platform limits';
};

/**
 * Today's spend against each daily limit, in the workspace row. Opens the workspace's limits
 * and its forecast.
 */
export const WorkspaceLimitCell = ({
  budget,
  settingsUnreadable = false,
  onOpen,
}: {
  budget: OrgTokenBudget;
  /** BE R16 `settingsLookupFailed`: the limits and override shown are the fallback. */
  settingsUnreadable?: boolean;
  onOpen: () => void;
}) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onOpen}
    className="flex flex-col items-start p-1 h-auto text-left"
    // No aria-label: it would REPLACE the figures below as the accessible name, and the figures
    // are the point of the cell. The title adds what the click does.
    title="Today since 00:00 UTC against this workspace's daily limits — click to change them or see the forecast"
  >
    <UsageLine label="KB" spent={budget.kb.spentToday} limit={budget.kb.limit} />
    <UsageLine label="Regular" spent={budget.regular.spentToday} limit={budget.regular.limit} />
    <span className="text-[10px] text-muted-foreground">
      {settingsUnreadable ? (
        // The override and the enforcement answer are fallbacks too: neither is said as fact.
        'stored limits unreadable · fallback shown'
      ) : (
        <>
          {describeLimitSource(budget.override)}
          {/* R17 `enforcementLookupFailed` is also a strict read that SUCCEEDED but disagreed
              with the cached answer — "unreadable" was untrue of it (pass 19, LOW). */}
          {budget.enforcementLookupFailed
            ? ' · enforcement unknown'
            : !budget.enforced && ' · own key, measured only'}
        </>
      )}
    </span>
  </Button>
);

/**
 * Said instead of "enforced"/"measured" when the backend could not settle it: the workspace's AI
 * settings, or (BE R15) the platform-wide limit settings, could not be read (pass 16, LOW) — or
 * (BE R17) a fresh read of them succeeded but disagreed with the cached answer the gate used,
 * where "could not read" was untrue (pass 19, LOW).
 */
const ENFORCEMENT_UNKNOWN =
  'this workspace’s AI settings or the platform limit settings could not be read or disagree with the answer in use — whether the limit stops work is unknown';

/**
 * "— about 3 days at the KB limit, pausing each day": a pause is promised only for a workspace
 * that is STOPPED at its limits. An own-key workspace that is only measured never pauses.
 */
const describeKbDays = (
  daysAtLimit: number | null,
  enforced: boolean,
  lookupFailed: boolean,
  fallback: string | null = null
): string => {
  const days = describeDays(daysAtLimit);
  if (!days) return '';
  // BE R17 `settingsLookupFailed`: the days are counted against the layer the limit fell back to —
  // said right after the days it qualifies, not after the pause sentence (pass 19, NIT), and
  // always with why: beside an unsettled enforcement the short form dropped it (pass 20, LOW).
  const counted = fallback
    ? ` (counted against ${fallback} — the saved KB limit could not be read)`
    : '';
  if (daysAtLimit !== null && daysAtLimit > 1) {
    // `enforced` is then the gate's fallback, not a reading — never stated as fact. With the
    // fallback clause the settings read is already said; only the consequence is left to say.
    if (lookupFailed) {
      return fallback
        ? ` — ${days} of the KB limit${counted}; whether the limit stops work is unknown`
        : ` — ${days} of the KB limit; ${ENFORCEMENT_UNKNOWN}`;
    }
    return enforced
      ? ` — ${days} at the KB limit${counted}, pausing each day at the limit until the reset at ${describeNextReset()}`
      : ` — ${days} of the KB limit${counted}; limits are only measured for this workspace, so nothing pauses`;
  }
  // Never "today’s KB limit" for a fallback figure: it is not this workspace's saved limit — and
  // why is always said, beside an unsettled enforcement too (pass 20, LOW; as SourceKbStrip).
  return fallback
    ? ` — it fits in one day at ${fallback}; the saved KB limit could not be read`
    : ' — it fits in what is left of today’s KB limit';
};

/**
 * KB image checks were not told apart before the token-limit split, so a window reaching back
 * past the first recorded one under-counts them — said, since the figure then reads LOW. Named by
 * this workspace's first recorded check, never "this release": the backend gives no release date,
 * and a workspace with no images never records one (FE audit pass 11, LOW; as SourceKbStrip).
 * The date is a UTC day, labelled — this page counts UTC days (FE audit pass 12, NIT).
 */
export const describeImageCheckGap = (firstRecordedAt: string | null): string => {
  const since = firstRecordedAt ? new Date(firstRecordedAt) : null;
  if (since && !Number.isNaN(since.getTime())) {
    return `Image checks during mining are counted from when they were first recorded for this workspace (${since.toISOString().slice(0, 10)} UTC); any made before then are not in this figure, so the real cost per conversation may be higher than shown.`;
  }
  return 'Image checks during mining are counted from when they were first recorded, and none has been recorded for this workspace yet; if mining reads images, the real cost per conversation may be higher than shown.';
};

/** "the last 12 days", "the last day". */
const lastDays = (days: number): string => (days === 1 ? 'the last day' : `the last ${days} days`);

const ForecastView = ({ forecast }: { forecast: TokenForecast }) => {
  const { kb, regular } = forecast;
  const perThread = kb.tokensPerThread;
  // What the averages are taken over: fewer days than the window for a young workspace (R8).
  const observedDays = regular.observedDays;
  const nothingToMine = kb.threadsToMine === 0;
  const regularFallback = regular.settingsLookupFailed ? fallbackLayer(regular.limit.source) : null;
  // The forecast's own verdict (the route always sends it).
  const kbFallback = kb.settingsLookupFailed ? fallbackLayer(kb.limit.source) : null;
  // A fallback of 0 is "no limit", so the backend sends no days — and nothing said the saved KB
  // limit could not be read: "no limit" would then read as this workspace's (pass 21, NIT).
  const days =
    kbFallback && kb.limit.limit === 0
      ? ` — no KB limit under ${kbFallback}; the saved KB limit could not be read`
      : describeKbDays(kb.daysAtLimit, kb.enforced, kb.enforcementLookupFailed, kbFallback);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">KB processing</p>
        {kb.sources.length === 0 ? (
          <p className="text-muted-foreground">No knowledge-base mailbox.</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {nothingToMine
                ? 'Nothing to mine'
                : `${kb.threadsToMine.toLocaleString()} conversation${
                    kb.threadsToMine === 1 ? '' : 's'
                  } still to mine`}
              {kb.sources.some((source) => source.noCutoff) &&
                ' (a mailbox with no KB cutoff mines nothing until one is set)'}
              .
            </p>
            {/* Nothing to mine: the backend sends no days (null) — not "not measured". */}
            {nothingToMine ? null : perThread && kb.estimatedTokens !== null ? (
              <p className="text-muted-foreground">
                ≈ {kb.estimatedTokens.toLocaleString()} tokens at {perThread.value.toLocaleString()}{' '}
                per conversation (measured on {perThread.threadsMeasured.toLocaleString()} mined in
                the last {perThread.windowDays} days){days}.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Tokens per conversation are not measured yet — too few conversations of this
                workspace were mined recently to say.
              </p>
            )}
            {!nothingToMine && perThread && kb.imageChecks?.coversWindow === false && (
              <p className="text-xs text-muted-foreground">
                {describeImageCheckGap(kb.imageChecks.firstRecordedAt)}
              </p>
            )}
          </>
        )}
      </div>
      <div>
        <p className="font-medium">Regular work</p>
        <p className="text-muted-foreground">
          {regular.messagesPerDay.in} incoming + {regular.messagesPerDay.out} outgoing messages a
          day on average over {lastDays(observedDays)}.
        </p>
        {regular.expectedTokensPerDay && regular.tokensPerMessage ? (
          <p className="text-muted-foreground">
            Usually ≈ {regular.expectedTokensPerDay.typical.toLocaleString()} tokens a day (
            {regular.expectedTokensPerDay.low.toLocaleString()}–
            {regular.expectedTokensPerDay.high.toLocaleString()}, from{' '}
            {regular.tokensPerMessage.weeksMeasured} week
            {regular.tokensPerMessage.weeksMeasured === 1 ? '' : 's'} measured)
            {regular.limit.limit !== 0
              ? // BE R17 `settingsLookupFailed` says the figure IS the fallback.
                ` against a limit of ${formatLimit(regular.limit.limit)}${
                  regularFallback ? ` (${regularFallback} — the saved limit could not be read)` : ''
                }.`
              : regular.settingsLookupFailed
                ? ' — the saved regular limit could not be read.'
                : regular.limit.source === 'workspace'
                  ? ' — the regular limit is switched off for this workspace.'
                  : ' — no regular limit is set.'}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Not enough mail in any recent week to measure tokens per message.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Actually spent: {regular.actual.last7DaysAverage.toLocaleString()} a day on average over{' '}
          {lastDays(Math.min(7, observedDays))} (up to now, today included).
          {regular.actual.peakDay &&
            ` Busiest UTC day in the last ${regular.windowDays} days: ${regular.actual.peakDay.date}, ${regular.actual.peakDay.tokens.toLocaleString()} tokens.`}
        </p>
      </div>
    </div>
  );
};

/** One workspace's own limits (blank = follow the platform) and its forecast. */
export const WorkspaceTokenLimitsDialog = ({
  organizationId,
  name,
  budget,
  budgets,
  onClose,
}: {
  organizationId: number;
  name: string;
  budget: OrgTokenBudget;
  budgets: Budgets;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const seedKb = budget.override?.kbTokensPerDay;
  const seedRegular = budget.override?.regularTokensPerDay;
  const [kbText, setKbText] = useState(seedKb !== undefined ? String(seedKb) : '');
  const [regularText, setRegularText] = useState(
    seedRegular !== undefined ? String(seedRegular) : ''
  );
  // BE R16: the stored limits could not be read — nothing here can be edited then. Fields filled
  // while unreadable held the FALLBACK override (none) after a refetch made the settings readable,
  // and Save sent the blank KB field as a change: the real KB override cleared (FE audit pass 17,
  // queued + LOW-1). So they lock while unreadable and are filled afresh once readable again (the
  // operator could type nothing meanwhile).
  const unreadable = budgets.settingsLookupFailed === true;
  // " — fallback" only on a figure that IS one, as the platform card says it: the soft re-read
  // can return the stored platform setting beside the flag (pass 17 NIT-1; pass 18, NIT).
  const platformShown = (limit: TokenLimit) =>
    unreadable && limit.source !== 'platform'
      ? `${describeLimit(limit)} — fallback`
      : describeLimit(limit);
  // The fields hold the FALLBACK override: the dialog opened unreadable and has not been refilled.
  const [filledUnreadable, setFilledUnreadable] = useState(unreadable);
  useEffect(() => {
    // Only a dialog OPENED unreadable is refilled: one that turned unreadable while open kept
    // its fields (they hold the real seeds, or what the operator typed before the lock), and
    // refilling wiped that typing with no notice — Save then sent nothing (pass 18, LOW).
    if (unreadable) return;
    if (!filledUnreadable) return;
    setFilledUnreadable(false);
    setKbText(seedKb !== undefined ? String(seedKb) : '');
    setRegularText(seedRegular !== undefined ? String(seedRegular) : '');
  }, [unreadable, filledUnreadable, seedKb, seedRegular]);
  // Held to the KB floor (D-R21-1) unless it is this workspace's own KB limit already saved (not
  // re-sent: changedLimitEdit omits an unchanged field). The override is the RAW stored value, so
  // one written outside the console below the floor shows here as saved; the limit in force is
  // the backend's clamp of it (the floor).
  const savedKb = budget.override?.kbTokensPerDay;
  const kb = parseKbLimitInput(kbText, savedKb ?? null);
  const savedBelowFloor =
    typeof savedKb === 'number' && savedKb > 0 && savedKb < KB_MIN_TOKENS_PER_DAY;
  const regular = parseLimitInput(regularText);

  const forecast = useQuery({
    queryKey: ['platform-token-forecast', organizationId],
    queryFn: () => managedAiUsageService.getForecast(organizationId),
  });

  const save = useMutation({
    // Blank means "no override" (null) — but only a field the operator CHANGED is sent, so a
    // regular-only edit never reaches the KB limit (a null KB would count as lifting it).
    mutationFn: () =>
      managedAiUsageService.updateWorkspaceLimits(
        organizationId,
        changedLimitEdit(budget.override, {
          kbTokensPerDay: kb.ok ? kb.value : null,
          regularTokensPerDay: regular.ok ? regular.value : null,
        })
      ),
    onSuccess: async (outcome) => {
      // The KB limit in force after the save: the workspace's own, or the platform's when blank.
      toastLimitSaved(
        `Limits saved for ${name}`,
        outcome,
        kb.ok && kb.value !== null ? kb.value : budgets.kb.limit,
        regular.ok && regular.value !== null ? regular.value : budgets.regular.limit
      );
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      // Not awaited: the dialog cannot be left until its Save answers, and a slow forecast must not
      // hold it open — the next opening reads the forecast afresh.
      void queryClient.invalidateQueries({
        queryKey: ['platform-token-forecast', organizationId],
      });
      onClose();
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the limits'),
  });

  // ONE rule for every limits editor (as TokenLimitsCard): the dialog cannot be left while its Save
  // is on its way — the answer closes it. Closing early let the operator reopen the SAME workspace
  // with the pre-save override, the late answer closed that new dialog, and a Save from its stale
  // form could clear the override just saved (FE audit pass 10, MED P10-F2).
  // The fields lock too: an edit typed while Save is pending was never sent, and the answer closed
  // the dialog over it as if saved (FE audit pass 11, LOW).
  const leave = () => {
    if (!save.isPending) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && leave()}>
      <DialogHeader>
        <DialogTitle>Daily token limits · {name}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              label="KB processing (tokens per UTC day)"
              inputMode="numeric"
              value={kbText}
              placeholder={`Platform: ${platformShown(budgets.kb)}`}
              onChange={(event) => setKbText(event.target.value)}
              disabled={save.isPending || unreadable}
              error={kb.ok ? undefined : kb.error}
            />
            <Input
              label="Regular work (tokens per UTC day)"
              inputMode="numeric"
              value={regularText}
              placeholder={`Platform: ${platformShown(budgets.regular)}`}
              onChange={(event) => setRegularText(event.target.value)}
              disabled={save.isPending || unreadable}
              error={regular.ok ? undefined : regular.error}
            />
            {unreadable && (
              // BE R16: the prefilled override and the "Platform:" figures are the fallback — but
              // only when the dialog was FILLED unreadable. One that turned unreadable while open
              // kept the real saved figures (or the operator's typing), and calling them "not
              // saved" was untrue (pass 19, LOW).
              <p className="text-xs text-warning" data-testid="workspace-limits-unreadable">
                {filledUnreadable
                  ? 'The stored limit settings could not be read: the fields here and a figure marked “fallback” are not this workspace’s saved limits. They cannot be edited until the settings can be read.'
                  : 'The stored limit settings can no longer be read: the fields keep what they held before, and a figure marked “fallback” is not a saved limit. They cannot be edited until the settings can be read.'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Blank follows the platform limit; 0 switches the limit off for this workspace. The KB
              limit is at least {KB_MIN_TOKENS_PER_DAY.toLocaleString('en-US')} tokens a day.
              {savedBelowFloor &&
                ` Saved as ${savedKb.toLocaleString('en-US')}; the limit in force is ${KB_MIN_TOKENS_PER_DAY.toLocaleString('en-US')} (the minimum).`}
              {unreadable
                ? ''
                : budget.enforcementLookupFailed
                  ? ` ${ENFORCEMENT_UNKNOWN.charAt(0).toUpperCase()}${ENFORCEMENT_UNKNOWN.slice(1)}.`
                  : !budget.enforced &&
                    ' This workspace runs on its own key and own-key limits are measured only — nothing is stopped until own-key enforcement is switched on.'}
            </p>
          </div>
          <div className="pt-3 border-t border-border">
            {forecast.isLoading ? (
              <p className="text-sm text-muted-foreground">Working out the forecast…</p>
            ) : forecast.error ? (
              <p className="text-sm text-muted-foreground">
                The forecast could not be loaded:{' '}
                {getApiErrorMessage(forecast.error) ?? 'unknown error'}
              </p>
            ) : forecast.data ? (
              <ForecastView forecast={forecast.data} />
            ) : null}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={leave} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              isLoading={save.isPending}
              disabled={!kb.ok || !regular.ok || save.isPending || unreadable}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
