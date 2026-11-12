import { apiClient } from '@/lib/api-client';
import { finiteNumber } from '@/lib/finiteNumber';

/**
 * SLA targets (owner 2026-11-11/12, backend migration 0238): every target in MINUTES.
 *   ticket          tickets by priority: first response + resolution
 *   threadPriority  threads by priority (type 'message', key = a priority): first response + resolution
 *   threadChannel   threads by channel (type 'message', key = a channel): caps — the shorter applies;
 *                   a null resolution = no cap
 *
 * ⛔ Version skew: an older backend sends `resolutionHours` only and no thread-priority rows. Read
 * hours × 60 then, report `supportsThreadPriority: false` (the screen hides that table), and never
 * send it a thread-priority row.
 */
export type SlaGroup = 'ticket' | 'threadPriority' | 'threadChannel';

export type SlaTargetRow = {
  type: 'ticket' | 'message';
  key: string;
  group: SlaGroup;
  firstResponseMinutes: number;
  resolutionMinutes: number | null;
  /** The row has an override (at least one field). */
  isCustom: boolean;
  /** Each field's own override flag. An older backend sends none: both then read as `isCustom`. */
  firstResponseIsCustom: boolean;
  resolutionIsCustom: boolean;
};

export type SlaConfig = {
  rows: SlaTargetRow[];
  supportsThreadPriority: boolean;
  /**
   * The backend sends per-field override flags: its PUT leaves an omitted field unchanged and it
   * has the per-row reset (DELETE). An older backend requires `firstResponseMinutes` on every PUT
   * row and reads an omitted resolution as "keep" or "none" depending on its version, so it is
   * sent both fields (as before) and offered no reset.
   */
  supportsFieldSave: boolean;
};

const PRIORITY_KEYS = ['critical', 'high', 'medium', 'low'];

const groupOf = (type: 'ticket' | 'message', key: string): SlaGroup =>
  type === 'ticket' ? 'ticket' : PRIORITY_KEYS.includes(key) ? 'threadPriority' : 'threadChannel';

export const normaliseSlaConfig = (raw: unknown): SlaConfig => {
  const list = Array.isArray(raw) ? raw : [];
  const rows: SlaTargetRow[] = [];
  let perFieldRows = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if ((row.type !== 'ticket' && row.type !== 'message') || typeof row.key !== 'string') continue;
    const first = finiteNumber(row.firstResponseMinutes);
    if (first === null) continue;
    const hours = finiteNumber(row.resolutionHours);
    const minutes =
      'resolutionMinutes' in row
        ? finiteNumber(row.resolutionMinutes)
        : hours === null
          ? null
          : hours * 60;
    const isCustom = row.isCustom === true;
    rows.push({
      type: row.type,
      key: row.key,
      group: groupOf(row.type, row.key),
      firstResponseMinutes: first,
      resolutionMinutes: minutes,
      isCustom,
      firstResponseIsCustom:
        typeof row.firstResponseIsCustom === 'boolean' ? row.firstResponseIsCustom : isCustom,
      resolutionIsCustom:
        typeof row.resolutionIsCustom === 'boolean' ? row.resolutionIsCustom : isCustom,
    });
    if (typeof row.firstResponseIsCustom === 'boolean') perFieldRows += 1;
  }
  return {
    rows,
    supportsThreadPriority: rows.some((row) => row.group === 'threadPriority'),
    supportsFieldSave: rows.length > 0 && perFieldRows === rows.length,
  };
};

export const getSlaConfig = async (): Promise<SlaConfig> => {
  const result = await apiClient.get('/api/organizations/sla-config');
  return normaliseSlaConfig((result.data as { data?: unknown } | undefined)?.data);
};

/** One row to save, and which of its fields the admin changed. */
export type SlaRowChange = { row: SlaTargetRow; firstResponse: boolean; resolution: boolean };

/**
 * What to save: each row whose values differ from what was loaded (or last saved), with the fields
 * that differ. The backend marks what it is sent as custom, so sending an untouched default would
 * pin it as an override and later product defaults would never reach this workspace. An unchanged
 * row is not sent at all (the PUT is an upsert: nothing absent is removed), and on a backend that
 * keeps an omitted field, an unchanged FIELD is not sent either — re-sending this tab's copy of it
 * could overwrite another admin's newer edit, and would pin a default as an override.
 */
export const changedSlaRows = (rows: SlaTargetRow[], baseline: SlaTargetRow[]): SlaRowChange[] =>
  rows.flatMap((row) => {
    const before = baseline.find((entry) => entry.type === row.type && entry.key === row.key);
    if (!before) return [{ row, firstResponse: true, resolution: true }];
    const firstResponse = row.firstResponseMinutes !== before.firstResponseMinutes;
    const resolution = row.resolutionMinutes !== before.resolutionMinutes;
    return firstResponse || resolution ? [{ row, firstResponse, resolution }] : [];
  });

export const saveSlaConfig = async (
  changes: SlaRowChange[],
  caps: { supportsThreadPriority: boolean; supportsFieldSave: boolean }
): Promise<void> => {
  const configs = changes
    .filter(({ row }) => caps.supportsThreadPriority || row.group !== 'threadPriority')
    .map(({ row, firstResponse, resolution }) => {
      // An older backend needs both fields on every row (see `supportsFieldSave`).
      const sendFirst = firstResponse || !caps.supportsFieldSave;
      const sendResolution = resolution || !caps.supportsFieldSave;
      return {
        type: row.type,
        key: row.key,
        ...(sendFirst ? { firstResponseMinutes: row.firstResponseMinutes } : {}),
        ...(sendResolution
          ? {
              resolutionMinutes: row.resolutionMinutes,
              // For an older backend, which reads hours only (it never had a channel resolution).
              resolutionHours:
                row.resolutionMinutes === null ||
                (!caps.supportsThreadPriority && row.group === 'threadChannel')
                  ? null
                  : Math.ceil(row.resolutionMinutes / 60),
            }
          : {}),
      };
    });
  // The backend refuses an empty list; nothing to send is nothing to save.
  if (configs.length === 0) return;
  await apiClient.put('/api/organizations/sla-config', { configs });
};

/** Removes a row's override (both fields); the backend answers with the whole config, as GET. */
export const resetSlaRow = async (row: Pick<SlaTargetRow, 'type' | 'key'>): Promise<SlaConfig> => {
  const result = await apiClient.delete(
    `/api/organizations/sla-config/${encodeURIComponent(row.type)}/${encodeURIComponent(row.key)}`
  );
  return normaliseSlaConfig((result.data as { data?: unknown } | undefined)?.data);
};
