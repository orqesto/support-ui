import { isRecord } from '@/lib/isRecord';
import type { BoundedField } from './resolvedField';

/** Shared (src/lib/isRecord.ts); re-exported for the settings readers. */
export { isRecord };

/** Where a console value comes from. */
export const isSource = (value: unknown): value is BoundedField['source'] =>
  value === 'db' || value === 'env' || value === 'default';

/** A source this build does not know reads as 'default' — never "not deployed" over one word. */
export const sourceOf = (value: unknown): BoundedField['source'] =>
  isSource(value) ? value : 'default';

/**
 * A console bound as GET answers it, {value, source, min, max}: value, min and max whole numbers
 * (else undefined — an older backend, a malformed row); a source this build does not know reads as
 * 'default'. The one reader for every bounded field (platformSettings.service.ts and the settings
 * files), so they never drift apart.
 */
export const readBounded = (raw: unknown): BoundedField | undefined =>
  isRecord(raw) && [raw.value, raw.min, raw.max].every((num) => Number.isInteger(num))
    ? {
        value: raw.value as number,
        source: sourceOf(raw.source),
        min: raw.min as number,
        max: raw.max as number,
      }
    : undefined;
