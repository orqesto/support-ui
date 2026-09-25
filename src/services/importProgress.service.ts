import { apiClient } from '@/lib/api-client';

/**
 * Import progress of a Gmail source — counted by the backend in the database over a FIXED set of
 * message ids listed once, so it survives restarts and only ever moves forward. See
 * support-service `modules/inbox/ingestion/progress/`.
 */
export type ImportStage = 'imported' | 'decided' | 'analysis' | 'embedding' | 'kb';

export type StageEta =
  | { state: 'done' }
  | { state: 'estimating' }
  | { state: 'stalled' }
  | {
      state: 'running';
      perMinute?: { short: number; long: number };
      minMinutes: number;
      /** Null when the pessimistic end is unknown (one window finished nothing). */
      maxMinutes: number | null;
    };

export type StageProgress = {
  stage: ImportStage;
  done: number;
  total: number;
  /** The total is estimated from the share imported so far; exact once everything is in. */
  projected: boolean;
  eta: StageEta;
};

export type ImportRun = {
  state: 'counting' | 'ready' | 'failed';
  startedAt: string;
  countedAt: string | null;
  total: number | null;
  /** The listing stopped at a cap: `total` is a floor. */
  capped: boolean;
  cappedBy: 'size' | 'time' | 'quota' | 'error' | null;
  query: string | null;
  error: string | null;
};

export type ImportProgress =
  | { tracked: false }
  | {
      tracked: true;
      run: ImportRun;
      progress?: {
        total: number;
        capped: boolean;
        imported: number;
        drained: boolean;
        notStored: number;
        awaitingRouting: number;
        unrecorded: number;
        stages: StageProgress[];
        eta: StageEta;
        sampledAt: string;
      };
    };

export const importProgressService = {
  get: async (sourceId: number): Promise<ImportProgress> => {
    const response = await apiClient.get<{ success: boolean; data: ImportProgress }>(
      `/api/integrations/${sourceId}/import-progress`
    );
    return response.data.data;
  },

  recount: async (sourceId: number): Promise<void> => {
    await apiClient.post(`/api/integrations/${sourceId}/import-progress/recount`);
  },
};
