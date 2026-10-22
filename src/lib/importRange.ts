import type { DateRangeValue } from '@/components/ui/DateRangePicker';

/**
 * A mailbox's first-sync range as stored (`gmail.*` / `email.*`): `bulkImportDays` (0 = all
 * time), and since the calendar (2026-10-22) an optional `bulkImportSince` day that wins over it
 * on the server (importHistoryDays). The picker shows a since day as "Since 3 Oct 2026".
 */
export type ImportRangeConfig = {
  bulkImportDays?: number | string;
  bulkImportSince?: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (num: number): string => String(num).padStart(2, '0');

/**
 * The since value SENT for a chosen day: the instant of that day's LOCAL midnight (owner decision
 * 2026-10-22), e.g. 1 Oct in UTC+3 -> '2026-09-30T21:00:00.000Z'. The server also still accepts a
 * bare 'YYYY-MM-DD'.
 */
export const sinceInstant = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toISOString();
};

/**
 * The calendar day a STORED since value stands for: an instant reads as the LOCAL day it falls on;
 * a legacy 'YYYY-MM-DD' is that day as it is. Anything else: null.
 */
export const sinceDay = (stored: string | null | undefined): string | null => {
  if (typeof stored !== 'string') return null;
  if (DAY.test(stored)) return stored;
  const at = new Date(stored);
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

export const importRangeValue = (
  cfg: ImportRangeConfig | undefined,
  defaultDays: number
): DateRangeValue => {
  const day = sinceDay(cfg?.bulkImportSince);
  if (day) return { kind: 'since', since: day };
  const days = Number(cfg?.bulkImportDays);
  return {
    kind: 'preset',
    value: String(Number.isFinite(days) && cfg?.bulkImportDays !== undefined ? days : defaultDays),
  };
};

/**
 * The config patch for a choice. A since day is sent as its local-midnight instant; a preset sends its days AND clears
 * a stored since day (null) — otherwise the old day would keep outranking the preset just chosen.
 */
export const importRangePatch = (
  value: DateRangeValue
): { bulkImportDays?: number; bulkImportSince: string | null } => {
  if (value.kind === 'since') return { bulkImportSince: sinceInstant(value.since) };
  if (value.kind === 'range') return { bulkImportSince: sinceInstant(value.from) };
  return { bulkImportDays: Number(value.value) || 0, bulkImportSince: null };
};

/**
 * The days a choice reaches back, for a message-count ESTIMATE (the count endpoints take days):
 * whole days from the chosen day's local midnight (the instant sent) to now, at least 1.
 */
export const importRangeDays = (value: DateRangeValue, now: Date = new Date()): number => {
  if (value.kind === 'preset') return Number(value.value) || 0;
  const since = value.kind === 'since' ? value.since : value.from;
  return daysSince(Date.parse(sinceInstant(since)), now);
};

const daysSince = (startMs: number, now: Date): number =>
  Math.max(1, Math.floor((now.getTime() - startMs) / DAY_MS));

/**
 * The lookback an IMAP "Check Messages Count" sends: the days back to a since day when one is set
 * (the import reads from it), else the form's lookback — so the count is for what will be read.
 */
export const countLookbackDays = (
  cfg: { lookbackDays?: number; bulkImportSince?: string | null },
  now: Date = new Date()
): number | undefined =>
  cfg.bulkImportSince ? daysSinceStored(cfg.bulkImportSince, now) : cfg.lookbackDays;

/** A stored since value (instant, or legacy day = 00:00 UTC as the server reads it) -> days back. */
const daysSinceStored = (stored: string, now: Date): number => {
  const startMs = DAY.test(stored) ? Date.parse(`${stored}T00:00:00Z`) : Date.parse(stored);
  return Number.isNaN(startMs) ? 1 : daysSince(startMs, now);
};

/** IMAP reads at most 365 days back (imapHistoryWindows): an older since day would be cut silently. */
export const IMAP_MAX_IMPORT_DAYS = 365;

/** The earliest since day an IMAP import can honour, `YYYY-MM-DD`. */
export const imapEarliestDay = (now: Date = new Date()): string => {
  const earliest = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (IMAP_MAX_IMPORT_DAYS - 1)
  );
  return `${earliest.getFullYear()}-${pad(earliest.getMonth() + 1)}-${pad(earliest.getDate())}`;
};
