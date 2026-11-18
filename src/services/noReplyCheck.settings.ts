import { isRecord, isSource, readBounded } from './boundedFieldRead';
import type { BoundedField } from './resolvedField';

/**
 * "No reply needed" (`ai.no_reply_check`, backend noReplyCheckSetting.ts): an email that only
 * thanks or confirms gets no AI draft. Two whole-number limits and the model's wording, as GET
 * answers and PUT takes them, and the GET reader.
 */
export const NO_REPLY_CHECK_NUMBERS = ['ownTextMaxChars', 'inlineLogoMaxBytes'] as const;
export type NoReplyCheckNumber = (typeof NO_REPLY_CHECK_NUMBERS)[number];
/** The wording with its source and allowed length. */
export type NoReplyInstructions = {
  value: string;
  source: BoundedField['source'];
  minLength: number;
  maxLength: number;
};
/** GET `drafts.noReplyCheck`. */
export type NoReplyCheckSettings = Record<NoReplyCheckNumber, BoundedField> & {
  instructions: NoReplyInstructions;
};
/**
 * PUT `noReplyCheck`: any non-empty subset; the server merges it over the saved row. `null`
 * removes a saved field — back to the default, which then follows later releases.
 */
export type NoReplyCheckInput = Partial<Record<NoReplyCheckNumber, number | null>> & {
  instructions?: string | null;
};

/** A known source as given; an unknown one is a stored override (Reset stays visible). */
const overrideSource = (value: unknown): BoundedField['source'] => (isSource(value) ? value : 'db');

/** GET `drafts.noReplyCheck`: both limits and the wording well-formed — or absent (older backend). */
export const readNoReplyCheck = (raw: unknown): NoReplyCheckSettings | undefined => {
  if (!isRecord(raw)) return undefined;
  // A source this build does not know is read as a stored OVERRIDE ('db'), so "Reset to default"
  // stays offered (review of #979); never "not deployed" over one word.
  const numbers = NO_REPLY_CHECK_NUMBERS.map((key) => {
    const field = readBounded(raw[key]);
    const given = isRecord(raw[key]) ? raw[key].source : undefined;
    return [key, field && { ...field, source: overrideSource(given) }] as const;
  });
  const wording = raw.instructions;
  const instructions =
    isRecord(wording) &&
    typeof wording.value === 'string' &&
    typeof wording.minLength === 'number' &&
    typeof wording.maxLength === 'number'
      ? {
          value: wording.value,
          source: overrideSource(wording.source),
          minLength: wording.minLength,
          maxLength: wording.maxLength,
        }
      : undefined;
  return numbers.every(([, field]) => field) && instructions
    ? ({ ...Object.fromEntries(numbers), instructions } as NoReplyCheckSettings)
    : undefined;
};
