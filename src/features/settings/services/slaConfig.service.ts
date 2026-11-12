import { apiClient } from '@/lib/api-client';

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
  isCustom: boolean;
};

export type SlaConfig = { rows: SlaTargetRow[]; supportsThreadPriority: boolean };

const PRIORITY_KEYS = ['critical', 'high', 'medium', 'low'];

const groupOf = (type: 'ticket' | 'message', key: string): SlaGroup =>
  type === 'ticket' ? 'ticket' : PRIORITY_KEYS.includes(key) ? 'threadPriority' : 'threadChannel';

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const normaliseSlaConfig = (raw: unknown): SlaConfig => {
  const list = Array.isArray(raw) ? raw : [];
  const rows: SlaTargetRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if ((row.type !== 'ticket' && row.type !== 'message') || typeof row.key !== 'string') continue;
    const first = asNumber(row.firstResponseMinutes);
    if (first === null) continue;
    const hours = asNumber(row.resolutionHours);
    const minutes = 'resolutionMinutes' in row ? asNumber(row.resolutionMinutes) : hours === null ? null : hours * 60;
    rows.push({
      type: row.type,
      key: row.key,
      group: groupOf(row.type, row.key),
      firstResponseMinutes: first,
      resolutionMinutes: minutes,
      isCustom: row.isCustom === true,
    });
  }
  return { rows, supportsThreadPriority: rows.some((row) => row.group === 'threadPriority') };
};

export const getSlaConfig = async (): Promise<SlaConfig> => {
  const result = await apiClient.get('/api/organizations/sla-config');
  return normaliseSlaConfig((result.data as { data?: unknown } | undefined)?.data);
};

export const saveSlaConfig = async (rows: SlaTargetRow[], caps: { supportsThreadPriority: boolean }): Promise<void> => {
  const configs = rows
    .filter((row) => caps.supportsThreadPriority || row.group !== 'threadPriority')
    .map((row) => ({
      type: row.type,
      key: row.key,
      firstResponseMinutes: row.firstResponseMinutes,
      resolutionMinutes: row.resolutionMinutes,
      // For an older backend, which reads hours only (it never had a channel resolution).
      resolutionHours:
        row.resolutionMinutes === null || (!caps.supportsThreadPriority && row.group === 'threadChannel')
          ? null
          : Math.ceil(row.resolutionMinutes / 60),
    }));
  await apiClient.put('/api/organizations/sla-config', { configs });
};
