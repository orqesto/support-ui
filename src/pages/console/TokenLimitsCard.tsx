import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  managedAiUsageService,
  type ManagedAiUsage,
  type TokenBucket,
} from '@/services/managedAiUsage.service';
import {
  describeLimit,
  KB_MIN_TOKENS_PER_DAY,
  parseKbLimitInput,
  parseLimitInput,
  toastLimitSaved,
} from './tokenLimits.helpers';

type Budgets = NonNullable<ManagedAiUsage['totals']['tokenBudgets']>;
type PlatformLimit = Budgets['kb'];

/** Said under a field left blank: a platform limit is a value, never "nothing". */
const BLANK_ERROR = 'Enter a limit — 0 switches it off.';

/**
 * The platform's daily AI token limits — KB processing and regular work, apart (owner,
 * 2026-09-30) — and whether a workspace on its OWN key is stopped at them or only measured.
 *
 * These ARE the defaults every workspace without its own limit gets (owner 2026-10-12: "why this
 * magical numbers are just in code? … why its in .env?"). The backend saves 5,000,000 / 2,000,000
 * here on install (migration 0156) and refuses to clear them, so the form always edits a saved
 * value: no blank field, no reset to a hidden layer. A figure the backend answers as `default`
 * is its fail-safe built-in value — nothing saved (before the migration ran) or the settings
 * unreadable — and is labelled so; Save turns it into a saved value.
 *
 * Every figure says where it came from: a built-in value nobody chose must not read like a
 * decision (the old single ceiling showed "2,000,000" on petro while applying to none of its
 * workspaces, because all four ran on their own keys).
 */
export const TokenLimitsCard = ({
  budgets,
  kbMin = KB_MIN_TOKENS_PER_DAY,
}: {
  budgets: Budgets;
  /** The console's KB minimum (`tokenLimitRules`); the built-in one from an older backend. */
  kbMin?: number;
}) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [kbText, setKbText] = useState('');
  const [regularText, setRegularText] = useState('');
  const [ownKeyEnforced, setOwnKeyEnforced] = useState(budgets.ownKeyEnforced);
  // BE R16: the stored limits could not be read — the figures are the fallback, never fact. Not
  // editable then: a form opened on the fallback kept it after a refetch made the settings
  // readable, and Save sent it as a change — own-key enforcement switched off (FE audit pass 17,
  // queued + LOW-1). A form already open locks its Save until they can be read again.
  const unreadable = budgets.settingsLookupFailed === true;

  const startEditing = () => {
    // Always the value in force: a platform limit is a saved value to change, never a blank.
    setKbText(String(budgets.kb.limit));
    setRegularText(String(budgets.regular.limit));
    setOwnKeyEnforced(budgets.ownKeyEnforced);
    setEditing(true);
  };

  // Held to the KB floor (D-R21-1). The figure shown is the limit in force, which the backend
  // clamps to the floor, so a saved value never falls below it here.
  const kbParsed = parseKbLimitInput(kbText, undefined, kbMin);
  const regularParsed = parseLimitInput(regularText);
  // A blank field is refused: the backend refuses a cleared platform limit (400).
  const kb =
    kbParsed.ok && kbParsed.value === null ? { ok: false as const, error: BLANK_ERROR } : kbParsed;
  const regular =
    regularParsed.ok && regularParsed.value === null
      ? { ok: false as const, error: BLANK_ERROR }
      : regularParsed;

  // Both values and the own-key switch are sent only when CHANGED — as the workspace dialog does
  // (changedLimitEdit). The backend re-runs a release for a re-sent value or "own-key off" (R8 b,
  // and for regular since round 12), so re-sending a prefilled field on every Save retried a
  // release nobody asked for (FE audit pass 9, LOW, KB; pass 13, LOW, regular). A value not saved
  // yet (the built-in fail-safe) is sent even unchanged: saving it is the point.
  const changed = (limit: PlatformLimit, value: number | null | undefined) =>
    typeof value === 'number' && (limit.source !== 'platform' || value !== limit.limit);
  const kbValue = kb.ok ? kb.value : undefined;
  const regularValue = regular.ok ? regular.value : undefined;
  const kbChanged = changed(budgets.kb, kbValue);
  const regularChanged = changed(budgets.regular, regularValue);
  const save = useMutation({
    mutationFn: () =>
      managedAiUsageService.updatePlatformLimits({
        kbTokensPerDay: kbChanged ? (kbValue ?? undefined) : undefined,
        regularTokensPerDay: regularChanged ? (regularValue ?? undefined) : undefined,
        ownKeyEnforced: ownKeyEnforced !== budgets.ownKeyEnforced ? ownKeyEnforced : undefined,
      }),
    onSuccess: async (outcome) => {
      toastLimitSaved(
        'Daily token limits saved',
        outcome,
        kbChanged && typeof kbValue === 'number' ? kbValue : budgets.kb.limit,
        regularChanged && typeof regularValue === 'number' ? regularValue : budgets.regular.limit
      );
      // Closed only once the new limits are read back: closing first showed the OLD figures as
      // the saved ones until the refetch landed (FE audit pass 8, LOW).
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      setEditing(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the limits'),
  });

  // The same rule for the fields and the switch: an edit made while a write is on its way was
  // never sent, and the answer closed the form over it as if saved (FE audit pass 11, LOW).
  const locked = save.isPending;

  // " — fallback" only on a figure that IS one: the backend's soft re-read can still return the
  // stored platform setting beside `settingsLookupFailed` (FE audit pass 17, NIT-1).
  const shown = (limit: PlatformLimit) =>
    unreadable && limit.source !== 'platform'
      ? `${describeLimit(limit)} — fallback`
      : describeLimit(limit);
  const unreadableNote = (
    <span className="text-xs text-warning" data-testid="token-limits-unreadable">
      The stored limit settings could not be read. A figure marked “fallback” is the built-in
      fail-safe value, not a saved limit. Workspaces listed only for their own limits may be missing
      from the table, and the limits cannot be edited until the settings can be read.
    </span>
  );

  /** One limit in the read view: its figure, and a tag when it is not saved yet. */
  const limitLine = (bucket: TokenBucket, label: string) => {
    const limit = budgets[bucket];
    const notSaved = !unreadable && limit.source !== 'platform';
    return (
      <span className="text-sm flex flex-wrap items-center gap-x-2" key={bucket}>
        <span className="font-semibold">{label}</span>{' '}
        <span className="text-muted-foreground">{shown(limit)}</span>{' '}
        {notSaved && <Badge variant="warning">Not saved</Badge>}
      </span>
    );
  };
  const anyNotSaved =
    !unreadable && (budgets.kb.source !== 'platform' || budgets.regular.source !== 'platform');

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Daily token limits · the default for every workspace without its own
          </span>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={startEditing} disabled={unreadable}>
              Edit
            </Button>
          )}
        </div>
        {!editing ? (
          <>
            {unreadable && unreadableNote}
            {limitLine('kb', 'KB processing')}
            {limitLine('regular', 'Regular work')}
            {anyNotSaved && (
              <span className="text-xs text-warning" data-testid="token-limits-not-saved">
                A limit marked “Not saved” is the built-in fail-safe value, not a platform setting.
                Edit and Save to make it this platform’s default.
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {unreadable
                ? 'Whether own-key workspaces are stopped at their limits is unknown: the stored setting could not be read.'
                : budgets.ownKeyEnforced
                  ? 'Own-key workspaces are stopped at their limits, like platform-key ones.'
                  : 'Own-key workspaces are measured and notified only — nothing of theirs is stopped.'}
            </span>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {unreadable && unreadableNote}
            <Input
              label="KB processing (tokens per UTC day)"
              inputMode="numeric"
              value={kbText}
              onChange={(event) => setKbText(event.target.value)}
              error={kb.ok ? undefined : kb.error}
              disabled={locked || unreadable}
            />
            <Input
              label="Regular work (tokens per UTC day)"
              inputMode="numeric"
              value={regularText}
              onChange={(event) => setRegularText(event.target.value)}
              error={regular.ok ? undefined : regular.error}
              disabled={locked || unreadable}
            />
            <p className="text-xs text-muted-foreground">
              Every workspace without its own limit gets these. 0 switches a limit off. The KB limit
              is at least {kbMin.toLocaleString('en-US')} tokens a day.
            </p>
            <Toggle
              checked={ownKeyEnforced}
              onChange={setOwnKeyEnforced}
              // An open form locks too when the settings turn unreadable: the note says they
              // cannot be edited (FE audit pass 18, NIT).
              disabled={locked || unreadable}
              label="Stop own-key workspaces at their limits (off: measure and notify only)"
            />
            <div className="flex gap-2 justify-end">
              {/* ONE rule for every limits editor: the form cannot be left while a write is on its
                  way. Cancel → Edit then reopened it from the PRE-save figures and the next Save
                  sent them back, reverting the first (FE audit pass 10, MED P10-F1). */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={locked}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate()}
                isLoading={save.isPending}
                disabled={!kb.ok || !regular.ok || save.isPending || unreadable}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
