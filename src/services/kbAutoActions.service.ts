/**
 * KB automatic actions, step 1: automatic removal of entries the quality review suggests removing.
 *
 * The backend scores every "remove this entry" suggestion 0–100% sure. A per-workspace setting
 * picks Off / Shadow (show what WOULD go, act on nothing) / Automatic (remove everything at or
 * above the bar each night, with Restore). Entries a person approved are never removed.
 *
 * ⚠️ Version skew: the FE can reach a backend without these routes. Every response is normalised
 * defensively here, so a missing or malformed field reads as "nothing" rather than white-screening
 * the page; the page itself shows a calm notice on a route-absent 404 (`isRouteAbsent`).
 */
import { apiClient } from '@/lib/api-client';

export type KbAutoRemoveMode = 'off' | 'shadow' | 'auto';

export type KbAutoActionsSettings = {
  remove: { mode: KbAutoRemoveMode; threshold: number };
};

export type KbAutoBandKey =
  | 'lt50'
  | '50to70'
  | '70to80'
  | '80to90'
  | '90to95'
  | 'gte95'
  | 'unscored';

export type KbAutoPercentCount = { percent: number; count: number };
export type KbAutoPercentAgreement = { percent: number; agreed: number; disagreed: number };

export type KbAutoActionsOverview = {
  settings: KbAutoActionsSettings;
  candidates: {
    total: number;
    byReason: Record<string, number>;
    bySubject: { qa: number; document: number };
    byBand: Record<string, number>;
    wouldRemoveAtThreshold: number;
    personApprovedAtThreshold: number;
    /** Above the saved bar but waiting for a person's capture review: never removed automatically. */
    openReviewAtThreshold: number;
    removableByPercent: KbAutoPercentCount[];
  };
  bands: { key: string; from: number; to: number }[];
  agreement: {
    decided: number;
    agreed: number;
    disagreed: number;
    byBand: Record<string, { agreed: number; disagreed: number }>;
    atThreshold: { agreed: number; disagreed: number; total: number; rate: number | null };
    byPercent: KbAutoPercentAgreement[];
  };
  autoRemoved: {
    last90Days: number;
    lastRun: { at: string; removed: number; capped: boolean; via: string | null } | null;
  };
};

export type KbAutoSampleItem = {
  suggestionId: number;
  entryId: number;
  publicId: string | null;
  subject: 'qa' | 'document';
  question: string;
  answer: string;
  reasons: string[];
  note: string;
  confidence: number | null;
  approved: boolean;
  personApproved: boolean;
};

export type KbAutoSample = { items: KbAutoSampleItem[]; poolLimited: boolean };

export type KbAutoRemovedItem = {
  entryId: number;
  publicId: string | null;
  subject: 'qa' | 'document';
  question: string;
  answer: string;
  reasons: string[];
  confidence: number | null;
  threshold: number | null;
  suggestionId: number | null;
  removedAt: string | null;
  purgeAfter: string | null;
};

export type KbAutoRemovedPage = {
  items: KbAutoRemovedItem[];
  page: number;
  pageSize: number;
  total: number;
};

/** The slider's range, as a fraction. */
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 1;
export const DEFAULT_THRESHOLD = 0.9;

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const countMap = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(asObj(value)).filter(
      (pair): pair is [string, number] => typeof pair[1] === 'number' && Number.isFinite(pair[1])
    )
  );
const subjectOf = (value: unknown): 'qa' | 'document' => (value === 'document' ? 'document' : 'qa');

export const clampThreshold = (value: number): number =>
  Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));

/** A missing or unknown mode reads as Shadow, the backend's default — never as Off. */
export const normaliseSettings = (value: unknown): KbAutoActionsSettings => {
  const remove = asObj(asObj(value).remove);
  const mode: KbAutoRemoveMode =
    remove.mode === 'off' || remove.mode === 'auto' ? remove.mode : 'shadow';
  const threshold = numOrNull(remove.threshold);
  return {
    remove: { mode, threshold: threshold === null ? DEFAULT_THRESHOLD : clampThreshold(threshold) },
  };
};

export const normaliseOverview = (value: unknown): KbAutoActionsOverview => {
  const raw = asObj(value);
  const candidates = asObj(raw.candidates);
  const agreement = asObj(raw.agreement);
  const atThreshold = asObj(agreement.atThreshold);
  const autoRemoved = asObj(raw.autoRemoved);
  const lastRun = autoRemoved.lastRun ? asObj(autoRemoved.lastRun) : null;
  const bySubject = asObj(candidates.bySubject);
  return {
    settings: normaliseSettings(raw.settings),
    candidates: {
      total: num(candidates.total),
      byReason: countMap(candidates.byReason),
      bySubject: { qa: num(bySubject.qa), document: num(bySubject.document) },
      byBand: countMap(candidates.byBand),
      wouldRemoveAtThreshold: num(candidates.wouldRemoveAtThreshold),
      personApprovedAtThreshold: num(candidates.personApprovedAtThreshold),
      openReviewAtThreshold: num(candidates.openReviewAtThreshold),
      removableByPercent: arr(candidates.removableByPercent)
        .map(asObj)
        .filter((row) => typeof row.percent === 'number')
        .map((row) => ({ percent: num(row.percent), count: num(row.count) })),
    },
    bands: arr(raw.bands)
      .map(asObj)
      .filter(
        (band) =>
          typeof band.key === 'string' &&
          numOrNull(band.from) !== null &&
          numOrNull(band.to) !== null
      )
      .map((band) => ({ key: str(band.key), from: num(band.from), to: num(band.to) })),
    agreement: {
      decided: num(agreement.decided),
      agreed: num(agreement.agreed),
      disagreed: num(agreement.disagreed),
      byBand: Object.fromEntries(
        Object.entries(asObj(agreement.byBand)).map(([key, band]) => [
          key,
          { agreed: num(asObj(band).agreed), disagreed: num(asObj(band).disagreed) },
        ])
      ),
      atThreshold: {
        agreed: num(atThreshold.agreed),
        disagreed: num(atThreshold.disagreed),
        total: num(atThreshold.total),
        rate: numOrNull(atThreshold.rate),
      },
      byPercent: arr(agreement.byPercent)
        .map(asObj)
        .filter((row) => typeof row.percent === 'number')
        .map((row) => ({
          percent: num(row.percent),
          agreed: num(row.agreed),
          disagreed: num(row.disagreed),
        })),
    },
    autoRemoved: {
      last90Days: num(autoRemoved.last90Days),
      lastRun:
        lastRun && typeof lastRun.at === 'string'
          ? {
              at: lastRun.at,
              removed: num(lastRun.removed),
              capped: lastRun.capped === true,
              via: strOrNull(lastRun.via),
            }
          : null,
    },
  };
};

export const normaliseSample = (value: unknown): KbAutoSample => {
  const raw = asObj(value);
  return {
    items: arr(raw.items)
      .map(asObj)
      // A 0% score is no verdict to rate: never offer it in the sample.
      .filter((item) => typeof item.suggestionId === 'number' && item.confidence !== 0)
      .map((item) => ({
        suggestionId: num(item.suggestionId),
        entryId: num(item.entryId),
        publicId: strOrNull(item.publicId),
        subject: subjectOf(item.subject),
        question: str(item.question),
        answer: str(item.answer),
        reasons: arr(item.reasons).filter((reason): reason is string => typeof reason === 'string'),
        note: str(item.note),
        confidence: numOrNull(item.confidence),
        approved: item.approved === true,
        personApproved: item.personApproved === true,
      })),
    poolLimited: raw.poolLimited === true,
  };
};

export const normaliseRemovedPage = (value: unknown): KbAutoRemovedPage => {
  const raw = asObj(value);
  return {
    items: arr(raw.items)
      .map(asObj)
      .filter((item) => typeof item.entryId === 'number')
      .map((item) => ({
        entryId: num(item.entryId),
        publicId: strOrNull(item.publicId),
        subject: subjectOf(item.subject),
        question: str(item.question),
        answer: str(item.answer),
        reasons: arr(item.reasons).filter((reason): reason is string => typeof reason === 'string'),
        confidence: numOrNull(item.confidence),
        threshold: numOrNull(item.threshold),
        suggestionId: numOrNull(item.suggestionId),
        removedAt: strOrNull(item.removedAt),
        purgeAfter: strOrNull(item.purgeAfter),
      })),
    page: num(raw.page, 1),
    pageSize: num(raw.pageSize, 25) || 25,
    total: num(raw.total),
  };
};

/** The backend's bands (BE `CONFIDENCE_BANDS`), used when an overview carries none. */
export const DEFAULT_BANDS: KbAutoActionsOverview['bands'] = [
  { key: 'lt50', from: 0, to: 0.5 },
  { key: '50to70', from: 0.5, to: 0.7 },
  { key: '70to80', from: 0.7, to: 0.8 },
  { key: '80to90', from: 0.8, to: 0.9 },
  { key: '90to95', from: 0.9, to: 0.95 },
  { key: 'gte95', from: 0.95, to: 1 },
];

export type KbAutoBandRow = { key: string; label: string; count: number };

const bandLabel = (band: { from: number; to: number }): string => {
  const from = Math.round(band.from * 100);
  const to = Math.round(band.to * 100);
  if (from <= 0) return `Under ${to}%`;
  if (to >= 100) return `${from}% and over`;
  return `${from}–${to}%`;
};

/**
 * Candidates per confidence band, in band order, unscored last. Every band is listed (a band the
 * counts leave out reads 0), so an empty band is visible rather than missing.
 */
export const candidateBands = (overview: KbAutoActionsOverview): KbAutoBandRow[] => {
  const bands = overview.bands.length > 0 ? overview.bands : DEFAULT_BANDS;
  const counts = overview.candidates.byBand;
  return [
    ...bands.map((band) => ({
      key: band.key,
      label: bandLabel(band),
      count: counts[band.key] ?? 0,
    })),
    { key: 'unscored', label: 'No score yet', count: counts.unscored ?? 0 },
  ];
};

/**
 * Entries the run would remove at `percent` (0–100): every scored candidate at or above it.
 * The server sends counts per whole percent, so the slider previews without a refetch.
 */
export const wouldRemoveAt = (rows: KbAutoPercentCount[], percent: number): number =>
  rows.reduce((sum, row) => (row.percent >= percent ? sum + row.count : sum), 0);

/** How often the system agreed with people on entries scored at or above `percent`. */
export const agreementAt = (
  rows: KbAutoPercentAgreement[],
  percent: number
): { agreed: number; total: number; rate: number | null } => {
  let agreed = 0;
  let disagreed = 0;
  for (const row of rows) {
    if (row.percent < percent) continue;
    agreed += row.agreed;
    disagreed += row.disagreed;
  }
  const total = agreed + disagreed;
  return { agreed, total, rate: total > 0 ? agreed / total : null };
};

type Envelope = { success?: boolean; data?: unknown };

export const kbAutoActionsService = {
  async getOverview(): Promise<KbAutoActionsOverview> {
    const response = await apiClient.get<Envelope>('/api/knowledge-base/auto-actions');
    return normaliseOverview(response.data?.data);
  },

  async getSample(limit = 30): Promise<KbAutoSample> {
    const response = await apiClient.get<Envelope>('/api/knowledge-base/auto-actions/sample', {
      params: { limit: Math.min(50, Math.max(1, Math.round(limit))) },
    });
    return normaliseSample(response.data?.data);
  },

  async saveSettings(
    settings: KbAutoActionsSettings
  ): Promise<{ settings: KbAutoActionsSettings; startedRun: boolean }> {
    const response = await apiClient.patch<Envelope>('/api/knowledge-base/auto-actions/settings', {
      remove: { mode: settings.remove.mode, threshold: clampThreshold(settings.remove.threshold) },
    });
    const data = asObj(response.data?.data);
    return { settings: normaliseSettings(data.settings), startedRun: data.startedRun === true };
  },

  async listRemoved(page = 1): Promise<KbAutoRemovedPage> {
    const response = await apiClient.get<Envelope>('/api/knowledge-base/auto-actions/removed', {
      params: { page },
    });
    return normaliseRemovedPage(response.data?.data);
  },

  async restore(entryId: number): Promise<void> {
    await apiClient.post(`/api/knowledge-base/auto-actions/removed/${entryId}/restore`, {});
  },
};
