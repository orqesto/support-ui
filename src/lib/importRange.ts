import type { DateRangeValue } from '@/components/ui/DateRangePicker';

/**
 * A mailbox's first-sync range as stored (`gmail.*` / `email.*`): `bulkImportDays` (0 = all
 * time), and since the calendar (2026-10-22) an optional `bulkImportSince` day that wins over it
 * on the server (importHistoryDays). The picker shows a since day as "Since 3 Oct 2026".
 */
export type ImportRangeConfig = { bulkImportDays?: number | string; bulkImportSince?: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const importRangeValue = (cfg: ImportRangeConfig | undefined, defaultDays: number): DateRangeValue => {
  if (typeof cfg?.bulkImportSince === 'string' && DAY.test(cfg.bulkImportSince)) {
    return { kind: 'since', since: cfg.bulkImportSince };
  }
  const days = Number(cfg?.bulkImportDays);
  return { kind: 'preset', value: String(Number.isFinite(days) && cfg?.bulkImportDays !== undefined ? days : defaultDays) };
};

/**
 * The config patch for a choice. A since day is sent as such; a preset sends its days AND clears
 * a stored since day (null) — otherwise the old day would keep outranking the preset just chosen.
 */
export const importRangePatch = (
  value: DateRangeValue
): { bulkImportDays?: number; bulkImportSince: string | null } => {
  if (value.kind === 'since') return { bulkImportSince: value.since };
  if (value.kind === 'range') return { bulkImportSince: value.from };
  return { bulkImportDays: Number(value.value) || 0, bulkImportSince: null };
};

/**
 * The days a choice reaches back, for a message-count ESTIMATE (the count endpoints take days):
 * the server's own rule for a since day — whole days from its 00:00 UTC to now, at least 1.
 */
export const importRangeDays = (value: DateRangeValue, now: Date = new Date()): number => {
  if (value.kind === 'preset') return Number(value.value) || 0;
  const since = value.kind === 'since' ? value.since : value.from;
  const [year, month, day] = since.split('-').map(Number);
  return Math.max(1, Math.floor((now.getTime() - Date.UTC(year, month - 1, day)) / DAY_MS));
};

/**
 * The lookback an IMAP "Check Messages Count" sends: the days back to a since day when one is set
 * (the import reads from it), else the form's lookback — so the count is for what will be read.
 */
export const countLookbackDays = (
  cfg: { lookbackDays?: number; bulkImportSince?: string | null },
  now: Date = new Date()
): number | undefined =>
  cfg.bulkImportSince ? importRangeDays({ kind: 'since', since: cfg.bulkImportSince }, now) : cfg.lookbackDays;

/** IMAP reads at most 365 days back (imapHistoryWindows): an older since day would be cut silently. */
export const IMAP_MAX_IMPORT_DAYS = 365;

/** The earliest since day an IMAP import can honour, `YYYY-MM-DD`. */
export const imapEarliestDay = (now: Date = new Date()): string => {
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (IMAP_MAX_IMPORT_DAYS - 1));
  return `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, '0')}-${String(earliest.getDate()).padStart(2, '0')}`;
};
