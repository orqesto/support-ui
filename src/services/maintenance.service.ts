import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * Console → Maintenance (backend `GET/PATCH /api/system/maintenance…`, 2026-10-20): background
 * jobs with an on/off switch and their last run, and the "Repairs allowed" switch over every
 * repair route. Normalised defensively — the page may reach a backend that predates it.
 */

export type MaintenanceJobSchedule =
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily'; hour: number; minute?: number; note?: string; weekday?: number }
  | { kind: 'startup' };

export type MaintenanceRunOutcome = 'ok' | 'failed' | 'skipped';

export interface MaintenanceJobLastRun {
  at: string;
  outcome: MaintenanceRunOutcome;
  durationMs?: number;
  error?: string;
  lastRanAt?: string;
  /**
   * A backlog job's standing after this tick (BE `MaintenanceJobLastRun.progress`, 2026-10-23),
   * e.g. `{ done, workspacesLeft, rowsLeft, stamped }`. Absent on older backends and on jobs
   * without a backlog.
   */
  progress?: MaintenanceJobProgress;
}

export type MaintenanceJobProgress = Record<string, number | boolean | string>;

export interface MaintenanceJob {
  id: string;
  label: string;
  does: string;
  whenOff: string;
  schedule: MaintenanceJobSchedule;
  enabled: boolean;
  lastRun: MaintenanceJobLastRun | null;
  nextRunAt: string | null;
}

/**
 * Office addresses (IPs or CIDR ranges) that skip the traffic rate limits — login, 2FA and
 * password-reset limits still apply (BE `security.trusted_addresses`, 2026-10-27). `null` when the
 * backend predates the list.
 */
export interface TrustedAddressesState {
  entries: string[];
  /** The admin's own address as the server sees it. */
  yourAddress: string | null;
  /** A self-hosted box skips the traffic limits for everyone; the list then changes nothing. */
  selfHosted: boolean;
}

/**
 * Workspaces that never send product analytics to PostHog (BE `analytics.excluded_workspaces`,
 * 2026-11-07) — the owner's demo and testing workspaces. System and load-test workspaces are always
 * excluded on top of this list. `null` when the backend predates it.
 */
export interface AnalyticsExclusionsState {
  workspaceIds: number[];
  /** A self-hosted server never sends analytics; the list then changes nothing. */
  selfHosted: boolean;
}

export interface MaintenanceState {
  jobs: MaintenanceJob[];
  repairs: { allowed: boolean; source: 'default' | 'console' };
  trustedAddresses: TrustedAddressesState | null;
  analyticsExclusions: AnalyticsExclusionsState | null;
}

const workspaceIdsOf = (raw: unknown): number[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normaliseSchedule = (raw: unknown): MaintenanceJobSchedule => {
  if (isRecord(raw) && raw.kind === 'interval' && typeof raw.minutes === 'number') {
    return { kind: 'interval', minutes: raw.minutes };
  }
  if (isRecord(raw) && raw.kind === 'daily' && typeof raw.hour === 'number') {
    return {
      kind: 'daily',
      hour: raw.hour,
      minute: typeof raw.minute === 'number' ? raw.minute : undefined,
      note: typeof raw.note === 'string' ? raw.note : undefined,
      weekday: typeof raw.weekday === 'number' ? raw.weekday : undefined,
    };
  }
  return { kind: 'startup' };
};

const normaliseProgress = (raw: unknown): MaintenanceJobProgress | undefined => {
  if (!isRecord(raw)) return undefined;
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, number | boolean | string] =>
      typeof entry[1] === 'number' || typeof entry[1] === 'boolean' || typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normaliseLastRun = (raw: unknown): MaintenanceJobLastRun | null => {
  if (!isRecord(raw) || typeof raw.at !== 'string') return null;
  const outcome = raw.outcome === 'failed' || raw.outcome === 'skipped' ? raw.outcome : 'ok';
  return {
    at: raw.at,
    outcome,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    lastRanAt: typeof raw.lastRanAt === 'string' ? raw.lastRanAt : undefined,
    progress: normaliseProgress(raw.progress),
  };
};

export const normaliseMaintenance = (raw: unknown): MaintenanceState => {
  const data = isRecord(raw) ? raw : {};
  const jobs = (Array.isArray(data.jobs) ? data.jobs : []).filter(isRecord).map((job) => ({
    id: typeof job.id === 'string' ? job.id : '',
    label: typeof job.label === 'string' ? job.label : typeof job.id === 'string' ? job.id : '',
    does: typeof job.does === 'string' ? job.does : '',
    whenOff: typeof job.whenOff === 'string' ? job.whenOff : '',
    schedule: normaliseSchedule(job.schedule),
    enabled: job.enabled !== false,
    lastRun: normaliseLastRun(job.lastRun),
    nextRunAt: typeof job.nextRunAt === 'string' ? job.nextRunAt : null,
  }));
  const repairs = isRecord(data.repairs) ? data.repairs : {};
  const trusted = isRecord(data.trustedAddresses) ? data.trustedAddresses : null;
  const exclusions = isRecord(data.analyticsExclusions) ? data.analyticsExclusions : null;
  return {
    jobs: jobs.filter((job) => job.id !== ''),
    repairs: {
      allowed: repairs.allowed !== false,
      source: repairs.source === 'console' ? 'console' : 'default',
    },
    trustedAddresses: trusted
      ? {
          entries: (Array.isArray(trusted.entries) ? trusted.entries : []).filter(
            (entry): entry is string => typeof entry === 'string'
          ),
          yourAddress: typeof trusted.yourAddress === 'string' ? trusted.yourAddress : null,
          selfHosted: trusted.selfHosted === true,
        }
      : null,
    analyticsExclusions: exclusions
      ? {
          workspaceIds: workspaceIdsOf(exclusions.workspaceIds),
          selfHosted: exclusions.selfHosted === true,
        }
      : null,
  };
};

/** What a repair answered: the backend's `data`, shown as it came. */
export type RepairResult = Record<string, unknown>;

/**
 * A repair that lists every row it would change, paged by id (BE `repair-wrong-label-replies`,
 * `repair-outbound-only-new-threads`, 2026-11-10). Request: `organizationId` in the body, a dry
 * run unless `dryRun` is exactly `false`, `limit` (max 1000) and `afterId` (where a page starts).
 */
export interface ListedRepairRow {
  /** The message (wrong-label) or thread (outbound-only) id. */
  id: number;
  /** The thread the message sits in (wrong-label); null for a thread row. */
  threadId: number | null;
  /** The thread's public id (outbound-only); null when the backend sent none. */
  publicId: string | null;
  labels: string[];
  createdAt: string | null;
  outcome: string;
  /** KB entries made from this message (wrong-label; kept as they are). Null when not sent. */
  kbEntries: number | null;
  attachmentsRemoved: number | null;
  detail: string | null;
}

export interface ListedRepairResult {
  dryRun: boolean;
  /** Every row the repair would touch in the workspace, ignoring the page. */
  totalInScope: number;
  /** Rows on this page. */
  selected: number;
  limit: number;
  counts: Record<string, number>;
  rows: ListedRepairRow[];
  /** Set when the page stopped at its limit: the next page starts after this id. */
  nextAfterId: number | null;
  /** Wrong-label only: mail that also carries SENT — real replies, never removed. */
  skippedSent: {
    count: number;
    rows: Array<Pick<ListedRepairRow, 'id' | 'threadId' | 'labels' | 'createdAt'>>;
    truncated: boolean;
  } | null;
}

const numberOr = <T>(value: unknown, fallback: T): number | T =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOr = <T>(value: unknown, fallback: T): string | T =>
  typeof value === 'string' ? value : fallback;

const labelsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((label): label is string => typeof label === 'string') : [];

const normaliseListedRow = (raw: Record<string, unknown>): ListedRepairRow => ({
  id: numberOr(raw.id, 0),
  threadId: numberOr(raw.conversationId, null),
  publicId: stringOr(raw.publicId, null),
  labels: labelsOf(raw.labels),
  createdAt: stringOr(raw.createdAt, null),
  outcome: stringOr(raw.outcome, 'selected'),
  kbEntries: numberOr(raw.kbEntries, null),
  attachmentsRemoved: numberOr(raw.attachmentsRemoved, null),
  detail: stringOr(raw.detail, null),
});

export const normaliseListedRepair = (raw: unknown): ListedRepairResult => {
  const data = isRecord(raw) ? raw : {};
  const rows = (Array.isArray(data.rows) ? data.rows : []).filter(isRecord).map(normaliseListedRow);
  const counts = isRecord(data.counts)
    ? Object.fromEntries(
        Object.entries(data.counts).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
        )
      )
    : {};
  const sent = isRecord(data.skippedSent) ? data.skippedSent : null;
  return {
    dryRun: data.dryRun !== false,
    totalInScope: numberOr(data.totalInScope, rows.length),
    selected: numberOr(data.selected, rows.length),
    limit: numberOr(data.limit, rows.length),
    counts,
    rows,
    nextAfterId: numberOr(data.nextAfterId, null),
    skippedSent: sent
      ? {
          count: numberOr(sent.count, 0),
          rows: (Array.isArray(sent.rows) ? sent.rows : [])
            .filter(isRecord)
            .map(normaliseListedRow)
            .map(({ id, threadId, labels, createdAt }) => ({ id, threadId, labels, createdAt })),
          truncated: sent.truncated === true,
        }
      : null,
  };
};

const maintenanceService = {
  get: async (): Promise<MaintenanceState> => {
    const response = await apiClient.get<ApiResponse<unknown>>('/api/system/maintenance');
    return normaliseMaintenance(response.data.data);
  },

  setJobEnabled: async (id: string, enabled: boolean): Promise<void> => {
    await apiClient.patch(`/api/system/maintenance/jobs/${encodeURIComponent(id)}`, { enabled });
  },

  setRepairsAllowed: async (allowed: boolean): Promise<void> => {
    await apiClient.patch('/api/system/maintenance/repairs', { allowed });
  },

  /** Replaces the whole trusted list; answers the saved list. */
  setTrustedAddresses: async (entries: string[]): Promise<string[]> => {
    const response = await apiClient.put<ApiResponse<{ entries?: unknown }>>(
      '/api/system/maintenance/trusted-addresses',
      { entries }
    );
    const saved = response.data.data?.entries;
    return Array.isArray(saved)
      ? saved.filter((entry): entry is string => typeof entry === 'string')
      : entries;
  },

  /** Replaces the whole analytics exclusion list; answers the saved list. */
  setAnalyticsExclusions: async (workspaceIds: number[]): Promise<number[]> => {
    const response = await apiClient.put<ApiResponse<{ workspaceIds?: unknown }>>(
      '/api/system/maintenance/analytics-exclusions',
      { workspaceIds }
    );
    const saved = response.data.data?.workspaceIds;
    return Array.isArray(saved) ? workspaceIdsOf(saved) : workspaceIds;
  },

  /**
   * Run one repair (`path` = its route under `/api/system/`). `organizationId` names the workspace for a workspace repair — sent as the
   * request's own `X-Organization-Context`, since the platform console sends none by default.
   */
  runRepair: async (
    path: string,
    method: 'post' | 'get',
    body: Record<string, unknown>,
    organizationId: number | null
  ): Promise<RepairResult> => {
    const config = organizationId ? { organizationContext: organizationId } : {};
    const route = `/api/system/${encodeURIComponent(path)}`;
    const response =
      method === 'get'
        ? await apiClient.get<ApiResponse<unknown>>(route, config)
        : await apiClient.post<ApiResponse<unknown>>(route, body, config);
    const data = response.data.data;
    return isRecord(data) ? data : { result: data };
  },

  /**
   * Run a listed repair (see `ListedRepairResult`). The workspace goes in the body AND as the
   * request's `X-Organization-Context` (the backend requires them to agree when both are sent).
   */
  runListedRepair: async (
    path: string,
    organizationId: number,
    options: { dryRun: boolean; limit: number; afterId: number | null }
  ): Promise<ListedRepairResult> => {
    const body: Record<string, unknown> = {
      organizationId,
      dryRun: options.dryRun,
      limit: options.limit,
    };
    if (options.afterId !== null) body.afterId = options.afterId;
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/api/system/${encodeURIComponent(path)}`,
      body,
      { organizationContext: organizationId }
    );
    return normaliseListedRepair(response.data.data);
  },
};

export default maintenanceService;
