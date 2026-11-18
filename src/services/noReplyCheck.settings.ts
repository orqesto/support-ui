import { isRecord } from '@/lib/isRecord';
import { readBounded, sourceOf } from './boundedFieldRead';
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

/** GET `drafts.noReplyCheck`: both limits and the wording well-formed — or absent (older backend). */
export const readNoReplyCheck = (raw: unknown): NoReplyCheckSettings | undefined => {
  if (!isRecord(raw)) return undefined;
  // One rule with every console reader: a source this build does not know reads as 'default'
  // (readBounded); the backend sends only db / env / default.
  const numbers = NO_REPLY_CHECK_NUMBERS.map((key) => [key, readBounded(raw[key])] as const);
  const wording = raw.instructions;
  const instructions =
    isRecord(wording) &&
    typeof wording.value === 'string' &&
    typeof wording.minLength === 'number' &&
    typeof wording.maxLength === 'number'
      ? {
          value: wording.value,
          source: sourceOf(wording.source),
          minLength: wording.minLength,
          maxLength: wording.maxLength,
        }
      : undefined;
  return numbers.every(([, field]) => field) && instructions
    ? ({ ...Object.fromEntries(numbers), instructions } as NoReplyCheckSettings)
    : undefined;
};
