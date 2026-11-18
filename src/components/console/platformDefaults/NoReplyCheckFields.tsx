import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  NO_REPLY_CHECK_NUMBERS,
  NO_REPLY_CHECK_TIMES,
  type NoReplyCheckInput,
  type NoReplyCheckNumber,
  type NoReplyCheckSettings,
  type NoReplyCheckTime,
  type NoReplyInstructions,
} from '@/services/noReplyCheck.settings';
import { SourceBadge } from './SourceBadge';
import { useReseededTexts } from './useReseededTexts';

export const NO_REPLY_CHECK_NOT_DEPLOYED =
  '"No reply needed" settings are not available on this server version yet.';

const LABELS: Record<NoReplyCheckNumber | NoReplyCheckTime, { label: string; help: string }> = {
  ownTextMaxChars: {
    label: 'Longest reply checked (characters)',
    help: "The customer's own new text (quoted mail removed) longer than this always gets a draft.",
  },
  inlineLogoMaxBytes: {
    label: 'Signature logo size (bytes)',
    help: 'An inline image smaller than this is a signature logo; anything larger counts as a file and the email gets a draft. 0 = every inline image counts.',
  },
  keywordReplyDeferMs: {
    label: 'Hold a keyword reply to a thank-you (seconds)',
    help: "A keyword rule's reply to a short email that opens with thanks (no question) waits this long for the AI's verdict. It is sent unless the AI found that no reply is needed.",
  },
  keywordReplyMaxWaitMs: {
    label: 'Longest total hold (seconds)',
    help: 'If the AI has not judged the email by then (a busy queue), the reply is sent anyway — it is never lost.',
  },
  repairTimeoutMs: {
    label: 'Follow-up question time limit (seconds)',
    help: 'When the AI leaves out whether a reply is needed, one short follow-up asks for it. Without an answer the email gets a draft.',
  },
};

type WordingField = 'instructions' | 'repairInstructions';
type Field = NoReplyCheckNumber | NoReplyCheckTime | WordingField;
type Texts = Record<Field, string>;

/** Times are kept in milliseconds and shown in seconds. */
const toSeconds = (ms: number): string => String(ms / 1000);

const savedTexts = (check: NoReplyCheckSettings): Texts => ({
  ownTextMaxChars: String(check.ownTextMaxChars.value),
  inlineLogoMaxBytes: String(check.inlineLogoMaxBytes.value),
  // A time the server does not send (an older backend) has no field: '' is never shown.
  keywordReplyDeferMs: check.keywordReplyDeferMs ? toSeconds(check.keywordReplyDeferMs.value) : '',
  keywordReplyMaxWaitMs: check.keywordReplyMaxWaitMs
    ? toSeconds(check.keywordReplyMaxWaitMs.value)
    : '',
  repairTimeoutMs: check.repairTimeoutMs ? toSeconds(check.repairTimeoutMs.value) : '',
  instructions: check.instructions.value,
  repairInstructions: check.repairInstructions?.value ?? '',
});

/**
 * Platform Defaults → AI drafts → "No reply needed" (`ai.no_reply_check`, owner 2026-11-18): an
 * email that only thanks or confirms gets no AI draft. The limits, the model's wording, and (from
 * backend #1613) how long a keyword rule's reply to a thank-you waits for the AI and the follow-up
 * question when the AI leaves its answer out — each shown only when the server sends it. Saved on
 * their own (PUT /settings/drafts `{ noReplyCheck }`, only the fields that changed; the server
 * merges them over the saved ones). The fence around the customer's text stays in code.
 */
export const NoReplyCheckFields = ({
  check,
  saving,
  onSave,
  onRefetch,
}: {
  check: NoReplyCheckSettings;
  saving: boolean;
  /** Resolves when the save succeeded, rejects when it failed. */
  onSave: (changed: NoReplyCheckInput) => Promise<unknown>;
  /** Fetch the saved values again (a reset whose own refetch never came). */
  onRefetch?: () => Promise<unknown>;
}) => {
  const times = NO_REPLY_CHECK_TIMES.filter((field) => check[field] !== undefined);
  const wordings: WordingField[] = check.repairInstructions
    ? ['instructions', 'repairInstructions']
    : ['instructions'];
  const wordingOf = (field: WordingField): NoReplyInstructions =>
    (field === 'instructions'
      ? check.instructions
      : check.repairInstructions) as NoReplyInstructions;
  // Re-seed only the fields the operator has not edited (useReseededTexts, review of #1503): the
  // numbers compare by value, the wordings trimmed; a field's source is its version (a reset to a
  // default equal to the stored value still lands).
  const { texts, setTexts, isSame, trackReset, unknown } = useReseededTexts<Field>(
    savedTexts(check),
    {
      trimmed: ['instructions', 'repairInstructions'],
      numeric: [...NO_REPLY_CHECK_NUMBERS, ...NO_REPLY_CHECK_TIMES],
      versions: {
        ownTextMaxChars: check.ownTextMaxChars.source,
        inlineLogoMaxBytes: check.inlineLogoMaxBytes.source,
        keywordReplyDeferMs: check.keywordReplyDeferMs?.source,
        keywordReplyMaxWaitMs: check.keywordReplyMaxWaitMs?.source,
        repairTimeoutMs: check.repairTimeoutMs?.source,
        instructions: check.instructions.source,
        repairInstructions: check.repairInstructions?.source,
      },
      refetch: onRefetch,
    }
  );
  // Reset: the field shows the default once its refetch lands — unless the operator typed since;
  // the inputs stay editable (review of #980).
  const reset = (field: Field) => {
    // Tied to THIS save: applied only after it succeeded, dropped when it fails, so another admin's
    // refetch never overwrites the edit with a reset that did not happen (review of #980).
    void trackReset(field, onSave({ [field]: null }));
  };

  // The shared mutation already reports a failed save: the rejection only must not go unhandled.
  const save = (input: NoReplyCheckInput) => {
    void onSave(input).catch(() => undefined);
  };

  const errors: Partial<Texts> = {};
  const changed: NoReplyCheckInput = {};
  for (const field of NO_REPLY_CHECK_NUMBERS) {
    // The one "unchanged" rule (useReseededTexts.isSame): "0300" is 300.
    if (isSame(field, texts[field], String(check[field].value))) continue;
    const { min, max } = check[field];
    const value = Number(texts[field]);
    if (texts[field].trim() === '' || !Number.isInteger(value) || value < min || value > max) {
      errors[field] = `Enter a whole number from ${min} to ${max}.`;
    } else {
      changed[field] = value;
    }
  }
  // The times, in whole seconds (saved in milliseconds).
  const secondsOf = (field: NoReplyCheckTime): number | undefined => {
    const bounds = check[field];
    if (!bounds) return undefined;
    if (isSame(field, texts[field], toSeconds(bounds.value))) return bounds.value;
    const seconds = Number(texts[field]);
    const ms = seconds * 1000;
    if (
      texts[field].trim() === '' ||
      !Number.isInteger(seconds) ||
      ms < bounds.min ||
      ms > bounds.max
    ) {
      errors[field] =
        `Enter a whole number of seconds from ${bounds.min / 1000} to ${bounds.max / 1000}.`;
      return undefined;
    }
    changed[field] = ms;
    return ms;
  };
  const deferMs = secondsOf('keywordReplyDeferMs');
  const maxWaitMs = secondsOf('keywordReplyMaxWaitMs');
  secondsOf('repairTimeoutMs');
  // A total wait below one hold is valid on the backend (the reply goes at the earlier of the two),
  // so it is only a hint — and only while the operator edits one of them, never on saved values.
  const editingHold =
    changed.keywordReplyDeferMs !== undefined || changed.keywordReplyMaxWaitMs !== undefined;
  const totalCapsHold =
    editingHold && deferMs !== undefined && maxWaitMs !== undefined && maxWaitMs < deferMs;
  for (const field of wordings) {
    const saved = wordingOf(field);
    if (isSame(field, texts[field], saved.value)) continue;
    const wording = texts[field].trim();
    if (wording.length < saved.minLength || wording.length > saved.maxLength) {
      errors[field] = `Write ${saved.minLength} to ${saved.maxLength} characters.`;
    } else {
      changed[field] = wording;
    }
  }
  const hasError = Object.keys(errors).length > 0;
  const nothingChanged = Object.keys(changed).length === 0;
  const resetDisabled = saving || unknown.size > 0;

  const numberField = (field: NoReplyCheckNumber | NoReplyCheckTime) => {
    const bounds = check[field];
    if (!bounds) return null;
    const isTime = (NO_REPLY_CHECK_TIMES as readonly string[]).includes(field);
    return (
      <div key={field} className="space-y-1">
        <Input
          type="number"
          min={isTime ? bounds.min / 1000 : bounds.min}
          max={isTime ? bounds.max / 1000 : bounds.max}
          step={1}
          label={LABELS[field].label}
          value={texts[field]}
          error={errors[field]}
          onChange={(event) => setTexts((current) => ({ ...current, [field]: event.target.value }))}
        />
        <p className="text-xs text-muted-foreground">{LABELS[field].help}</p>
        {field === 'keywordReplyMaxWaitMs' && totalCapsHold && (
          <p className="text-xs text-muted-foreground">
            Shorter than the hold above: the reply goes out when this total runs out — the rest of
            the hold is never waited.
          </p>
        )}
        <SourceBadge source={bounds.source} envLabel="Server setting" />
        {bounds.source === 'db' && (
          <Button variant="ghost" size="sm" disabled={resetDisabled} onClick={() => reset(field)}>
            Reset to default
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="pt-3 space-y-3 border-t border-border">
      <p className="text-sm text-muted-foreground">
        No reply needed: a customer email that only thanks or confirms gets no AI draft (the thread
        shows a &quot;No reply needed&quot; chip). These limits decide which emails are checked.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">{NO_REPLY_CHECK_NUMBERS.map(numberField)}</div>
      <div className="space-y-1">
        <Textarea
          label="What counts as needing no reply (told to the AI)"
          value={texts.instructions}
          error={errors.instructions}
          rows={4}
          onChange={(event) =>
            setTexts((current) => ({ ...current, instructions: event.target.value }))
          }
        />
        <p className="text-xs text-muted-foreground">
          The customer&apos;s text is always passed as data, never as instructions — this wording
          cannot change that.
        </p>
        <SourceBadge source={check.instructions.source} envLabel="Server setting" />
        {check.instructions.source === 'db' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={resetDisabled}
            onClick={() => reset('instructions')}
          >
            Reset wording to default
          </Button>
        )}
      </div>
      {times.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">{times.map(numberField)}</div>
      )}
      {check.repairInstructions && (
        <div className="space-y-1">
          <Textarea
            label="Follow-up question to the AI (when it leaves its answer out)"
            value={texts.repairInstructions}
            error={errors.repairInstructions}
            rows={3}
            onChange={(event) =>
              setTexts((current) => ({ ...current, repairInstructions: event.target.value }))
            }
          />
          <SourceBadge source={check.repairInstructions.source} envLabel="Server setting" />
          {check.repairInstructions.source === 'db' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={resetDisabled}
              onClick={() => reset('repairInstructions')}
            >
              Reset follow-up wording to default
            </Button>
          )}
        </div>
      )}
      {unknown.size > 0 && (
        <p className="text-sm text-destructive">
          A reset was saved, but its new value could not be loaded. Reload the page to see what is
          saved before changing these settings.
        </p>
      )}
      <Button
        disabled={saving || nothingChanged || hasError || unknown.size > 0}
        onClick={() => save(changed)}
      >
        Save &quot;No reply needed&quot;
      </Button>
    </div>
  );
};
