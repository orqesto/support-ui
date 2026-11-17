import type { BoundedField } from './resolvedField';

/** A plain object (not null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Where a console value comes from. */
export const isSource = (value: unknown): value is BoundedField['source'] =>
  value === 'db' || value === 'env' || value === 'default';

/**
 * A console bound as GET answers it, {value, source, min, max} with finite numbers — else undefined
 * (an older backend, a malformed row). The settings files' readers share it.
 */
export const readBounded = (raw: unknown): BoundedField | undefined =>
  isRecord(raw) &&
  [raw.value, raw.min, raw.max].every((num) => typeof num === 'number' && Number.isFinite(num)) &&
  isSource(raw.source)
    ? {
        value: raw.value as number,
        source: raw.source,
        min: raw.min as number,
        max: raw.max as number,
      }
    : undefined;
