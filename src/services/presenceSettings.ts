import type { FieldSource } from './resolvedField';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The six numeric thread-presence settings, in the milliseconds / count the server stores. */
export const PRESENCE_NUMBER_FIELDS = [
  'heartbeatMs',
  'expiryMs',
  'writingIdleMs',
  'awayAfterMs',
  'listFlushMs',
  'ticketWatchCap',
] as const;
export type PresenceNumberField = (typeof PRESENCE_NUMBER_FIELDS)[number];
export type PresenceBoundedField = { value: number; source: FieldSource; min: number; max: number };
/** GET `ingestion.presence`: each numeric field {value, source, min, max}; `enabled` {value, source}. */
export type PresenceSettingsView = Record<PresenceNumberField, PresenceBoundedField> & {
  enabled: { value: boolean; source: FieldSource };
};
/** PUT /settings/ingestion `presence`: a partial body, only the fields sent are saved. */
export type PlatformPresenceInput = Partial<Record<PresenceNumberField, number>> & {
  enabled?: boolean;
};

const readSource = (raw: unknown): FieldSource => (raw === 'db' || raw === 'env' ? raw : 'default');

/** `ingestion.presence`: all seven fields, or undefined on a backend without them. */
export const normalizePresence = (raw: unknown): PresenceSettingsView | undefined => {
  if (!isObject(raw) || !isObject(raw.enabled) || typeof raw.enabled.value !== 'boolean') {
    return undefined;
  }
  const numbers: Partial<Record<PresenceNumberField, PresenceBoundedField>> = {};
  for (const key of PRESENCE_NUMBER_FIELDS) {
    const field = raw[key];
    if (
      !isObject(field) ||
      !Number.isInteger(field.value) ||
      !Number.isInteger(field.min) ||
      !Number.isInteger(field.max)
    ) {
      return undefined;
    }
    numbers[key] = {
      value: field.value as number,
      source: readSource(field.source),
      min: field.min as number,
      max: field.max as number,
    };
  }
  return {
    ...(numbers as Record<PresenceNumberField, PresenceBoundedField>),
    enabled: { value: raw.enabled.value, source: readSource(raw.enabled.source) },
  };
};
