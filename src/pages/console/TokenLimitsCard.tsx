import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

const BUCKET_WORDS: Record<TokenBucket, string> = {
  kb: 'KB processing',
  regular: 'regular work',
};

/**
 * What a limit falls back to once its platform setting is cleared. The backend reports only the
 * value in force, so the layer below a platform setting is not known here — both are named.
 */
const RESET_FALLBACK =
  'It falls back to the server environment setting, or to the built-in default when there is none.';

/**
 * The platform's daily AI token limits — KB processing and regular work, apart (owner,
 * 2026-09-30) — and whether a workspace on its OWN key is stopped at them or only measured.
 *
 * Every figure says where it came from: a built-in default nobody chose must not read like a
 * decision (the old single ceiling showed "2,000,000" on taco while applying to none of its
 * workspaces, because all four ran on their own keys).
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
    // Pre-filled only with a value set HERE; a default or env value stays a placeholder, so
    // saving without touching a field does not turn "built-in default" into "platform setting".
    setKbText(budgets.kb.source === 'platform' ? String(budgets.kb.limit) : '');
    setRegularText(budgets.regular.source === 'platform' ? String(budgets.regular.limit) : '');
    setOwnKeyEnforced(budgets.ownKeyEnforced);
    setEditing(true);
  };

  // Held to the KB floor (D-R21-1). The figure shown is the limit in force, which the backend
  // clamps to the floor, so a saved value never falls below it here.
  const kb = parseKbLimitInput(kbText);
  const regular = parseLimitInput(regularText);

  // Which limit's platform setting is about to be cleared (asked first — it takes effect at once).
  const [resetting, setResetting] = useState<TokenBucket | null>(null);
  // The limit the dialog names: kept after it closes, so its title never loses the limit's name
  // while the dialog animates out (FE audit pass 7, NIT).
  const [dialogBucket, setDialogBucket] = useState<TokenBucket>('kb');
  // A Reset asked while the settings were readable is dropped once they turn unreadable: its
  // confirm still cleared the platform setting the card had locked, and kept for their return it
  // would reopen by itself (pass 19, NIT).
  useEffect(() => {
    if (unreadable) setResetting(null);
  }, [unreadable]);
  const askReset = (bucket: TokenBucket) => {
    setDialogBucket(bucket);
    setResetting(bucket);
  };
  const hasResetButton = budgets.kb.source === 'platform' || budgets.regular.source === 'platform';
  const reset = useMutation({
    // ONE field only: the other limit, the own-key switch and whatever is typed stay as they are.
    mutationFn: (bucket: TokenBucket) =>
      managedAiUsageService.updatePlatformLimits(
        bucket === 'kb' ? { kbTokensPerDay: null } : { regularTokensPerDay: null }
      ),
    onSuccess: async (outcome, bucket) => {
      if (bucket === 'kb') setKbText('');
      else setRegularText('');
      toastLimitSaved(
        `The ${BUCKET_WORDS[bucket]} limit no longer has a platform setting`,
        outcome,
        // A cleared setting falls back to a layer not known here; the other limit is left be.
        bucket === 'kb' ? undefined : budgets.kb.limit,
        bucket === 'regular' ? undefined : budgets.regular.limit
      );
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not reset the limit'),
  });
  const busy = reset.isPending;

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
  const save = useMutation({
    mutationFn: () =>
      managedAiUsageService.updatePlatformLimits({
        // ⛔ Blank is "keep", never null: null CLEARS a limit on the server. Only Reset clears.
        kbTokensPerDay: kb.ok && kbChanged ? (kb.value ?? undefined) : undefined,
        regularTokensPerDay:
          regular.ok && regularChanged ? (regular.value ?? undefined) : undefined,
        ownKeyEnforced: ownKeyEnforced !== budgets.ownKeyEnforced ? ownKeyEnforced : undefined,
      }),
    onSuccess: async (outcome) => {
      toastLimitSaved(
        'Daily token limits saved',
        outcome,
        kbChanged && kb.ok && kb.value !== null ? kb.value : budgets.kb.limit,
        regularChanged && regular.ok && regular.value !== null
          ? regular.value
          : budgets.regular.limit
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
  const locked = save.isPending || busy;

  // " — fallback" only on a figure that IS one: the backend's soft re-read can still return the
  // stored platform setting beside `settingsLookupFailed` (FE audit pass 17, NIT-1).
  const shown = (limit: Budgets['kb']) =>
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
            <span className="text-sm">
              <span className="font-semibold">KB processing</span>{' '}
              <span className="text-muted-foreground">{shown(budgets.kb)}</span>
            </span>
            <span className="text-sm">
              <span className="font-semibold">Regular work</span>{' '}
              <span className="text-muted-foreground">{shown(budgets.regular)}</span>
            </span>
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
              placeholder={`${shown(budgets.kb)} — leave blank to keep`}
              onChange={(event) => setKbText(event.target.value)}
              error={kb.ok ? undefined : kb.error}
              disabled={locked || unreadable}
            />
            {budgets.kb.source === 'platform' && (
              <ResetButton
                bucket="kb"
                onAsk={askReset}
                pending={busy || save.isPending || unreadable}
              />
            )}
            <Input
              label="Regular work (tokens per UTC day)"
              inputMode="numeric"
              value={regularText}
              placeholder={`${shown(budgets.regular)} — leave blank to keep`}
              onChange={(event) => setRegularText(event.target.value)}
              error={regular.ok ? undefined : regular.error}
              disabled={locked || unreadable}
            />
            {budgets.regular.source === 'platform' && (
              <ResetButton
                bucket="regular"
                onAsk={askReset}
                pending={busy || save.isPending || unreadable}
              />
            )}
            <p className="text-xs text-muted-foreground">
              0 switches a limit off. The KB limit is at least{' '}
              {KB_MIN_TOKENS_PER_DAY.toLocaleString('en-US')} tokens a day. A blank field sends
              nothing and keeps its current value.
              {hasResetButton && (
                // Named as the button reads, and only where one is shown (FE audit pass 7, LOW).
                <>
                  {' '}
                  “Clear the platform setting for …” removes that limit’s platform value —{' '}
                  {RESET_FALLBACK.toLowerCase()}
                </>
              )}
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
                disabled={!kb.ok || !regular.ok || save.isPending || busy || unreadable}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        onConfirm={() => {
          if (resetting) reset.mutate(resetting);
          setResetting(null);
        }}
        title={`Reset the ${BUCKET_WORDS[dialogBucket]} limit?`}
        // Overrides are per limit: a workspace with only the OTHER limit overridden is affected.
        description={`This clears the platform setting for ${BUCKET_WORDS[dialogBucket]} now, for every workspace without its own ${BUCKET_WORDS[dialogBucket]} limit. ${RESET_FALLBACK}`}
        confirmText="Reset"
        variant="warning"
      />
    </Card>
  );
};

/** Clears ONE limit's platform setting — only offered where there is one to clear. */
const ResetButton = ({
  bucket,
  onAsk,
  pending,
}: {
  bucket: TokenBucket;
  onAsk: (bucket: TokenBucket) => void;
  pending: boolean;
}) => (
  <Button
    variant="ghost"
    size="sm"
    className="self-start"
    disabled={pending}
    onClick={() => onAsk(bucket)}
  >
    Clear the platform setting for {BUCKET_WORDS[bucket]}
  </Button>
);
