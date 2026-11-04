import { apiClient } from '@/lib/api-client';

export type SettingsLine = {
  key: string;
  value: unknown;
  default: unknown;
  source: 'always_on' | 'locked' | 'own' | 'role_default' | 'code_default';
  locked: boolean;
  alwaysOn: boolean;
};

export type NotificationSettings = {
  role: string | null;
  lines: SettingsLine[];
  /** True when the server only has the old preferences endpoint. */
  legacy: boolean;
};

/** Mirrors the backend `workingHours` line value. */
export type WorkingHours = { days: number[]; start: string; end: string; timeZone: string };

const SETTINGS_URL = '/api/users/me/notification-settings';
const LEGACY_URL = '/api/users/me/notification-preferences';

const SOURCES = ['always_on', 'locked', 'own', 'role_default', 'code_default'] as const;

const isRecord = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null;

/** Never throws: missing pieces get defaults, unknown keys are kept. */
export const normaliseSettings = (raw: unknown): NotificationSettings => {
  const body = isRecord(raw) ? raw : {};
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: SettingsLine[] = [];
  for (const row of rawLines) {
    if (!isRecord(row) || typeof row.key !== 'string') continue;
    const source = SOURCES.find((src) => src === row.source) ?? 'code_default';
    lines.push({
      key: row.key,
      value: row.value ?? null,
      default: row.default ?? null,
      source,
      locked: row.locked === true,
      alwaysOn: row.alwaysOn === true,
    });
  }
  return { role: typeof body.role === 'string' ? body.role : null, lines, legacy: false };
};

// Which legacy column drives which line(s). `notifyMessages` stands for both message lines.
const LEGACY_LINES: Array<[field: string, keys: string[]]> = [
  ['notifyMessages', ['kind:sla_message_breach', 'kind:customer_message_on_assigned']],
  ['notifyTicketFirstResponse', ['kind:sla_ticket_first_response']],
  ['notifyTicketResolution', ['kind:sla_ticket_resolution']],
  ['notifyNewUnassigned', ['kind:new_unassigned_message']],
  ['onlyAssignedToMe', ['onlyAssignedToMe']],
  ['minSeverity', ['slaMinSeverity']],
];

const legacyToSettings = (raw: unknown): NotificationSettings => {
  const body = isRecord(raw) ? raw : {};
  const lines: SettingsLine[] = [];
  for (const [field, keys] of LEGACY_LINES) {
    if (!(field in body)) continue;
    for (const key of keys) {
      lines.push({ key, value: body[field], default: null, source: 'own', locked: false, alwaysOn: false });
    }
  }
  return { role: null, lines, legacy: true };
};

/** Remembered from the last fetch: an old server answers 404 on the new endpoint. */
let legacyMode = false;

const unwrap = (res: unknown): unknown => (isRecord(res) && isRecord(res.data) ? res.data.data : undefined);

/** The api-client interceptor rethrows an Error with `status`/`data`; accept the axios shape too. */
const errorStatus = (err: unknown): number | undefined => {
  if (!isRecord(err)) return undefined;
  if (typeof err.status === 'number') return err.status;
  return isRecord(err.response) && typeof err.response.status === 'number' ? err.response.status : undefined;
};
const errorBody = (err: unknown): Record<string, unknown> => {
  if (!isRecord(err)) return {};
  if (isRecord(err.data)) return err.data;
  return isRecord(err.response) && isRecord(err.response.data) ? err.response.data : {};
};

const lockedKeysOf = (err: unknown): string[] | null => {
  if (errorStatus(err) !== 409) return null;
  const body = errorBody(err);
  if (body.code !== 'LINE_LOCKED') return null;
  return Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === 'string') : [];
};

export const fetchNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const res = await apiClient.get(SETTINGS_URL);
    legacyMode = false;
    return normaliseSettings(unwrap(res));
  } catch (err) {
    if (errorStatus(err) !== 404) throw err;
  }
  const res = await apiClient.get(LEGACY_URL);
  legacyMode = true;
  return legacyToSettings(unwrap(res));
};

const saveLegacy = async (lines: Record<string, unknown>): Promise<NotificationSettings | { lockedKeys: string[] }> => {
  // Read-modify-write so emailEnabled / digestEnabled (not lines) are sent back untouched.
  const current = unwrap(await apiClient.get(LEGACY_URL));
  const next: Record<string, unknown> = { ...(isRecord(current) ? current : {}) };
  for (const [field, keys] of LEGACY_LINES) {
    const hit = keys.find((key) => key in lines);
    if (hit) next[field] = lines[hit];
  }
  try {
    return legacyToSettings(unwrap(await apiClient.put(LEGACY_URL, next)));
  } catch (err) {
    const locked = lockedKeysOf(err);
    if (locked) return { lockedKeys: locked };
    throw err;
  }
};

export const saveNotificationSettings = async (
  lines: Record<string, unknown>
): Promise<NotificationSettings | { lockedKeys: string[] }> => {
  if (legacyMode) return saveLegacy(lines);
  try {
    return normaliseSettings(unwrap(await apiClient.put(SETTINGS_URL, { lines })));
  } catch (err) {
    const locked = lockedKeysOf(err);
    if (locked) return { lockedKeys: locked };
    throw err;
  }
};

export const resetNotificationSettings = async (keys?: string[]): Promise<NotificationSettings> => {
  if (legacyMode) return fetchNotificationSettings();
  return normaliseSettings(unwrap(await apiClient.post(`${SETTINGS_URL}/reset`, keys ? { keys } : {})));
};
