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
}

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

export interface MaintenanceState {
  jobs: MaintenanceJob[];
  repairs: { allowed: boolean; source: 'default' | 'console' };
}

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

const normaliseLastRun = (raw: unknown): MaintenanceJobLastRun | null => {
  if (!isRecord(raw) || typeof raw.at !== 'string') return null;
  const outcome = raw.outcome === 'failed' || raw.outcome === 'skipped' ? raw.outcome : 'ok';
  return {
    at: raw.at,
    outcome,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    lastRanAt: typeof raw.lastRanAt === 'string' ? raw.lastRanAt : undefined,
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
  return {
    jobs: jobs.filter((job) => job.id !== ''),
    repairs: {
      allowed: repairs.allowed !== false,
      source: repairs.source === 'console' ? 'console' : 'default',
    },
  };
};

/** What a repair answered: the backend's `data`, shown as it came. */
export type RepairResult = Record<string, unknown>;

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
};

export default maintenanceService;
