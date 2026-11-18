import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  NO_REPLY_CHECK_NUMBERS,
  type NoReplyCheckInput,
  type NoReplyCheckNumber,
  type NoReplyCheckSettings,
} from '@/services/noReplyCheck.settings';
import { SourceBadge } from './SourceBadge';
import { useReseededTexts } from './useReseededTexts';

export const NO_REPLY_CHECK_NOT_DEPLOYED =
  '"No reply needed" settings are not available on this server version yet.';

const LABELS: Record<NoReplyCheckNumber, { label: string; help: string }> = {
  ownTextMaxChars: {
    label: 'Longest reply checked (characters)',
    help: "The customer's own new text (quoted mail removed) longer than this always gets a draft.",
  },
  inlineLogoMaxBytes: {
    label: 'Signature logo size (bytes)',
    help: 'An inline image smaller than this is a signature logo; anything larger counts as a file and the email gets a draft. 0 = every inline image counts.',
  },
};

type Texts = Record<NoReplyCheckNumber | 'instructions', string>;
const savedTexts = (check: NoReplyCheckSettings): Texts => ({
  ownTextMaxChars: String(check.ownTextMaxChars.value),
  inlineLogoMaxBytes: String(check.inlineLogoMaxBytes.value),
  instructions: check.instructions.value,
});

/**
 * Platform Defaults → AI drafts → "No reply needed" (`ai.no_reply_check`, owner 2026-11-18): an
 * email that only thanks or confirms gets no AI draft. The two limits and the model's wording,
 * saved on their own (PUT /settings/drafts `{ noReplyCheck }`, only the fields that changed; the
 * server merges them over the saved ones). The fence around the customer's text stays in code.
 */
export const NoReplyCheckFields = ({
  check,
  saving,
  onSave,
}: {
  check: NoReplyCheckSettings;
  saving: boolean;
  /** Resolves when the save succeeded, rejects when it failed. */
  onSave: (changed: NoReplyCheckInput) => Promise<unknown>;
}) => {
  // Re-seed only the fields the operator has not edited (useReseededTexts, review of #1503): the
  // numbers compare by value, the wording trimmed; a field's source is its version (a reset to a
  // default equal to the stored value still lands).
  const { texts, setTexts, isSame, trackReset } = useReseededTexts<keyof Texts>(savedTexts(check), {
    trimmed: ['instructions'],
    numeric: NO_REPLY_CHECK_NUMBERS,
    versions: {
      ownTextMaxChars: check.ownTextMaxChars.source,
      inlineLogoMaxBytes: check.inlineLogoMaxBytes.source,
      instructions: check.instructions.source,
    },
  });
  // Reset: the field shows the default once its refetch lands — unless the operator typed since;
  // the inputs stay editable (review of #980).
  const reset = (field: keyof Texts) => {
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
  const wording = texts.instructions.trim();
  if (!isSame('instructions', texts.instructions, check.instructions.value)) {
    const { minLength, maxLength } = check.instructions;
    if (wording.length < minLength || wording.length > maxLength) {
      errors.instructions = `Write ${minLength} to ${maxLength} characters.`;
    } else {
      changed.instructions = wording;
    }
  }
  const hasError = Object.keys(errors).length > 0;
  const nothingChanged = Object.keys(changed).length === 0;

  return (
    <div className="pt-3 space-y-3 border-t border-border">
      <p className="text-sm text-muted-foreground">
        No reply needed: a customer email that only thanks or confirms gets no AI draft (the thread
        shows a &quot;No reply needed&quot; chip). These limits decide which emails are checked.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {NO_REPLY_CHECK_NUMBERS.map((field) => (
          <div key={field} className="space-y-1">
            <Input
              type="number"
              min={check[field].min}
              max={check[field].max}
              step={1}
              label={LABELS[field].label}
              value={texts[field]}
              error={errors[field]}
              onChange={(event) =>
                setTexts((current) => ({ ...current, [field]: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">{LABELS[field].help}</p>
            <SourceBadge source={check[field].source} envLabel="Server setting" />
            {check[field].source === 'db' && (
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => reset(field)}>
                Reset to default
              </Button>
            )}
          </div>
        ))}
      </div>
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
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => reset('instructions')}>
            Reset wording to default
          </Button>
        )}
      </div>
      <Button disabled={saving || nothingChanged || hasError} onClick={() => save(changed)}>
        Save &quot;No reply needed&quot;
      </Button>
    </div>
  );
};
