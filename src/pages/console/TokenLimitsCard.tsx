import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

const BUCKET_WORDS: Record<TokenBucket, string> = {
  kb: 'KB processing',
  regular: 'regular work',
};

/**
 * What a limit falls back to once its platform setting is cleared, when the backend does not say
 * (one older than `fallback`): the layer below a platform setting is not known then — both named.
 */
const RESET_FALLBACK =
  'It falls back to the server environment setting, or to the built-in default when there is none.';

/** "5,000,000 · built-in default", or the old two-layer sentence against an older backend. */
const describeFallback = (limit: PlatformLimit): string | null =>
  limit.fallback ? describeLimit(limit.fallback) : null;

/**
 * The platform's daily AI token limits — KB processing and regular work, apart (owner,
 * 2026-09-30) — and whether a workspace on its OWN key is stopped at them or only measured.
 *
 * Every figure says where it came from: a built-in default nobody chose must not read like a
 * decision (the old single ceiling showed "2,000,000" on petro while applying to none of its
 * workspaces, because all four ran on their own keys).
 *
 * A blank field FOLLOWS THE DEFAULT (tester feedback 2026-10-12): emptying a field set here — or
 * "Reset to default" — clears its platform setting on Save, after a confirmation naming the value
 * that applies then. Before, blank meant "keep", so emptying a field put the value back.
 */
export const TokenLimitsCard = ({ budgets }: { budgets: Budgets }) => {
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
    // Pre-filled only with a value set HERE; a default or env value stays blank, so saving
    // without touching a field does not turn "built-in default" into "platform setting".
    setKbText(budgets.kb.source === 'platform' ? String(budgets.kb.limit) : '');
    setRegularText(budgets.regular.source === 'platform' ? String(budgets.regular.limit) : '');
    setOwnKeyEnforced(budgets.ownKeyEnforced);
    setEditing(true);
  };

  // Held to the KB floor (D-R21-1). The figure shown is the limit in force, which the backend
  // clamps to the floor, so a saved value never falls below it here.
  const kb = parseKbLimitInput(kbText);
  const regular = parseLimitInput(regularText);

  // A field set here and now blank: Save clears that platform setting (null). Blank where nothing
  // is set here already follows the default — nothing to send.
  const kbCleared = kb.ok && kb.value === null && budgets.kb.source === 'platform';
  const regularCleared =
    regular.ok && regular.value === null && budgets.regular.source === 'platform';
  const clearing: TokenBucket[] = [
    ...(kbCleared ? (['kb'] as const) : []),
    ...(regularCleared ? (['regular'] as const) : []),
  ];

  // Asked before a Save that clears a setting — it takes effect at once, for every workspace
  // without its own limit.
  const [confirming, setConfirming] = useState(false);
  // The buckets the dialog names: kept after it closes, so its text never loses them while the
  // dialog animates out (FE audit pass 7, NIT).
  const [dialogBuckets, setDialogBuckets] = useState<TokenBucket[]>(['kb']);
  // A confirmation asked while the settings were readable is dropped once they turn unreadable:
  // confirmed, it would clear a setting the card had locked (pass 19, NIT).
  useEffect(() => {
    if (unreadable) setConfirming(false);
  }, [unreadable]);

  // Both values and the own-key switch are sent only when CHANGED — as the workspace dialog does
  // (changedLimitEdit). The backend re-runs a release for a re-sent value or "own-key off" (R8 b,
  // and for regular since round 12), so re-sending a prefilled field on every Save retried a
  // release nobody asked for (FE audit pass 9, LOW, KB; pass 13, LOW, regular). A value typed
  // into a blank field counts as changed, so it still retries. The toast says where that matters.
  const kbChanged =
    kb.ok &&
    kb.value !== null &&
    !(budgets.kb.source === 'platform' && kb.value === budgets.kb.limit);
  const regularChanged =
    regular.ok &&
    regular.value !== null &&
    !(budgets.regular.source === 'platform' && regular.value === budgets.regular.limit);
  // The limit in force after the save: the typed value, the fallback of a cleared one (unknown
  // against an older backend), else the current one.
  const kbAfter = kbCleared
    ? budgets.kb.fallback?.limit
    : kbChanged && kb.ok && kb.value !== null
      ? kb.value
      : budgets.kb.limit;
  const regularAfter = regularCleared
    ? budgets.regular.fallback?.limit
    : regularChanged && regular.ok && regular.value !== null
      ? regular.value
      : budgets.regular.limit;
  const save = useMutation({
    mutationFn: () =>
      managedAiUsageService.updatePlatformLimits({
        // null CLEARS a setting on the server: only for a field set here and now blank.
        kbTokensPerDay: kbCleared ? null : kb.ok && kbChanged ? (kb.value ?? undefined) : undefined,
        regularTokensPerDay: regularCleared
          ? null
          : regular.ok && regularChanged
            ? (regular.value ?? undefined)
            : undefined,
        ownKeyEnforced: ownKeyEnforced !== budgets.ownKeyEnforced ? ownKeyEnforced : undefined,
      }),
    onSuccess: async (outcome) => {
      toastLimitSaved('Daily token limits saved', outcome, kbAfter, regularAfter);
      // Closed only once the new limits are read back: closing first showed the OLD figures as
      // the saved ones until the refetch landed (FE audit pass 8, LOW).
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      setEditing(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the limits'),
  });

  const askSave = () => {
    if (clearing.length === 0) {
      save.mutate();
      return;
    }
    setDialogBuckets(clearing);
    setConfirming(true);
  };

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
      The stored limit settings could not be read. A figure marked “fallback” is the server
      environment setting or the built-in default, not a saved limit. Workspaces listed only for
      their own limits may be missing from the table, and the limits cannot be edited until the
      settings can be read.
    </span>
  );

  /** One limit in the read view: its figure, whether it is set here, and what Reset gives. */
  const limitLine = (bucket: TokenBucket, label: string) => {
    const limit = budgets[bucket];
    const setHere = limit.source === 'platform';
    const fallback = describeFallback(limit);
    return (
      <span className="text-sm flex flex-wrap items-center gap-x-2" key={bucket}>
        <span className="font-semibold">{label}</span>{' '}
        <span className="text-muted-foreground">{shown(limit)}</span>{' '}
        {!unreadable && (
          <Badge variant={setHere ? 'warning' : 'secondary'}>
            {setHere ? 'Set here' : 'Default'}
          </Badge>
        )}{' '}
        {!unreadable && setHere && fallback && (
          <span className="text-xs text-muted-foreground">Default: {fallback}</span>
        )}
      </span>
    );
  };

  /** Under a field: what a blank field means, or that a typed value pins the default. */
  const fieldState = (bucket: TokenBucket, text: string, cleared: boolean, onReset: () => void) => {
    const limit = budgets[bucket];
    const fallback = describeFallback(limit);
    if (unreadable) return null;
    if (cleared) {
      return (
        <span className="text-xs text-warning" data-testid={`token-limit-${bucket}-state`}>
          {fallback
            ? `Reset to default: ${fallback} after Save.`
            : `Its platform setting is cleared on Save. ${RESET_FALLBACK}`}
        </span>
      );
    }
    if (text.trim() === '') {
      return (
        <span className="text-xs text-muted-foreground" data-testid={`token-limit-${bucket}-state`}>
          Follows the default: {describeLimit(limit)}.
        </span>
      );
    }
    const typed = bucket === 'kb' ? kb : regular;
    const pinsDefault =
      typed.ok && limit.fallback !== undefined && typed.value === limit.fallback.limit;
    return (
      <span
        className="flex flex-wrap items-center gap-x-2"
        data-testid={`token-limit-${bucket}-state`}
      >
        <span className="text-xs text-muted-foreground">
          {pinsDefault
            ? 'Same as the default — saved here it stops following the default. Leave the field blank to keep following it.'
            : limit.source === 'platform'
              ? 'Set here.'
              : 'Set here once saved.'}
        </span>
        {limit.source === 'platform' && (
          <Button variant="ghost" size="sm" disabled={locked || unreadable} onClick={onReset}>
            Reset {BUCKET_WORDS[bucket]} to default
          </Button>
        )}
      </span>
    );
  };

  const dialogWords = dialogBuckets.map((bucket) => BUCKET_WORDS[bucket]).join(' and ');
  const dialogAfter = dialogBuckets
    .map((bucket) => {
      const fallback = describeFallback(budgets[bucket]);
      return fallback ? `${BUCKET_WORDS[bucket]} becomes ${fallback}.` : null;
    })
    .filter(Boolean);

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Daily token limits · per workspace</span>
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
              placeholder={`${shown(budgets.kb)} — leave blank to follow the default`}
              onChange={(event) => setKbText(event.target.value)}
              error={kb.ok ? undefined : kb.error}
              disabled={locked || unreadable}
            />
            {fieldState('kb', kbText, kbCleared, () => setKbText(''))}
            <Input
              label="Regular work (tokens per UTC day)"
              inputMode="numeric"
              value={regularText}
              placeholder={`${shown(budgets.regular)} — leave blank to follow the default`}
              onChange={(event) => setRegularText(event.target.value)}
              error={regular.ok ? undefined : regular.error}
              disabled={locked || unreadable}
            />
            {fieldState('regular', regularText, regularCleared, () => setRegularText(''))}
            <p className="text-xs text-muted-foreground">
              0 switches a limit off. The KB limit is at least{' '}
              {KB_MIN_TOKENS_PER_DAY.toLocaleString('en-US')} tokens a day. A blank field follows
              the default: the server environment setting, or the built-in default when there is
              none.
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
                onClick={askSave}
                isLoading={save.isPending}
                disabled={!kb.ok || !regular.ok || save.isPending || unreadable}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          save.mutate();
        }}
        title={`Reset the ${dialogWords} limit${dialogBuckets.length > 1 ? 's' : ''} to default?`}
        // Overrides are per limit: a workspace with only the OTHER limit overridden is affected.
        description={`Saving clears the platform setting for ${dialogWords} now, for every workspace without its own ${dialogWords} limit. ${
          dialogAfter.length === dialogBuckets.length ? dialogAfter.join(' ') : RESET_FALLBACK
        }`}
        confirmText="Reset and save"
        variant="warning"
      />
    </Card>
  );
};
