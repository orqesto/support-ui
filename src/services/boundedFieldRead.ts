import type { BoundedField } from './resolvedField';

/** A plain object (not null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Where a console value comes from. */
export const isSource = (value: unknown): value is BoundedField['source'] =>
  value === 'db' || value === 'env' || value === 'default';

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
        source: isSource(raw.source) ? raw.source : 'default',
        min: raw.min as number,
        max: raw.max as number,
      }
    : undefined;
