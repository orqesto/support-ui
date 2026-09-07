import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * Bring-your-own database (BYODB Phase 2). Mirrors the BE `tenantDatabaseController`:
 * the workspace card (`/api/integrations/database-config…`) and the platform console
 * (`/api/admin/organizations/:id/database…`, `/api/admin/platform/database/…`).
 *
 * The URL the admin types is sent once, on connect, and never comes back — every read
 * carries `hostMasked` (`postgres://…@host:5432/db`) and nothing else about the credential.
 */

export type DatabaseMode = 'managed' | 'own';
export type DatabaseStatus = 'provisioning' | 'active' | 'degraded' | 'suspended';

export type DatabaseMoveSummary = {
  id: number;
  /** pending → copying → verifying → copied → cleaned, or failed. */
  status: string;
  totalRows: number;
  copiedRows: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  cleanedAt: string | null;
};

/** Mirrors BE `TenantDatabaseDisplay`. Dates arrive as ISO strings. */
export type DatabaseDisplay = {
  mode: DatabaseMode;
  /** Whose Postgres: the customer's own, or the platform's managed database. */
  source: 'customer' | 'platform';
  hostMasked: string | null;
  /** `url` = entered in Settings (encrypted); `env` = provisioned by ops. */
  provenance: 'url' | 'env' | null;
  region: string | null;
  status: DatabaseStatus;
  schemaVersion: string | null;
  verifiedAt: string | null;
  provisionedAt: string | null;
  /** Free = own database: the date a Free workspace on the managed database must have moved by. */
  sharedRetentionUntil: string | null;
  updatedAt: string;
  move: DatabaseMoveSummary | null;
};

/** Mirrors BE `DatabaseTestResult`. `ok: false` with an `error` is a successful probe. */
export type DatabaseTestResult = {
  ok: boolean;
  latencyMs: number;
  serverVersion?: string;
  /** No tables in `public` yet — a fresh database the migrations will populate. */
  empty?: boolean;
  /** `CREATE` on the database (migrations need it). */
  canCreate?: boolean;
  /** pgvector is installed or installable. */
  vectorAvailable?: boolean;
  error?: string;
};

export type ConnectResult = {
  display: DatabaseDisplay;
  probe: DatabaseTestResult | null;
  migrationsApplied: number | null;
};

/** One `db_migrations` row as the console reads it. */
export type DatabaseMoveDetail = DatabaseMoveSummary & {
  organizationId: number;
  direction: string;
  /** Per table, in copy order: `{ source, copied, target }` row counts. */
  tables: Record<string, { source: number; copied: number; target: number | null }> | null;
  confirmedBy: number | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type RetentionRow = {
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  sharedRetentionUntil: string | null;
  daysLeft: number | null;
  /** Day marks (60/30/7/1) whose warning email has gone out. */
  warningsSent: number[];
};

export type DegradedRow = {
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  status: DatabaseStatus;
  verifiedAt: string | null;
  updatedAt: string;
};

type Envelope<T> = ApiResponse<T> & { meta?: { probe?: DatabaseTestResult; migrationsApplied?: number } };

const BASE = '/api/integrations/database-config';
const ADMIN = '/api/admin';

const unwrap = <T>(res: { data: ApiResponse<T> }, what: string): T => {
  if (res.data.data === undefined) throw new Error(`${what} not available`);
  return res.data.data;
};

export const databaseService = {
  /** This workspace's database, host masked. VIEW_INTEGRATIONS. */
  get: async (): Promise<DatabaseDisplay> =>
    unwrap(await apiClient.get<ApiResponse<DatabaseDisplay>>(BASE), 'Database config'),

  /** Probe a URL without saving anything; with no URL, re-probe the stored one. */
  test: async (url?: string): Promise<DatabaseTestResult> => {
    const res = await apiClient.post<ApiResponse<DatabaseTestResult>>(`${BASE}/test`, url ? { url } : {});
    return unwrap(res, 'Database test');
  },

  /**
   * Connect the workspace to its own Postgres: probe → store encrypted → migrate → active.
   * A workspace that already holds data is MOVED (the response's `display.move` says so) and
   * is paused for the copy.
   */
  connect: async (input: { url: string; region?: string | null }): Promise<ConnectResult> => {
    const res = await apiClient.put<Envelope<DatabaseDisplay>>(BASE, input);
    return {
      display: unwrap(res, 'Database config'),
      probe: res.data.meta?.probe ?? null,
      migrationsApplied: res.data.meta?.migrationsApplied ?? null,
    };
  },

  /** Re-probe the stored database; active ⇄ degraded follows the result. */
  reverify: async (): Promise<{ display: DatabaseDisplay; probe: DatabaseTestResult | null }> => {
    const res = await apiClient.post<Envelope<DatabaseDisplay>>(`${BASE}/reverify`, {});
    return { display: unwrap(res, 'Database config'), probe: res.data.meta?.probe ?? null };
  },

  /** Drop a connection that never went live. 409 for an active own database. */
  disconnect: async (): Promise<DatabaseDisplay> =>
    unwrap(await apiClient.delete<ApiResponse<DatabaseDisplay>>(BASE), 'Database config'),

  admin: {
    get: async (organizationId: number): Promise<DatabaseDisplay> =>
      unwrap(
        await apiClient.get<ApiResponse<DatabaseDisplay>>(`${ADMIN}/organizations/${organizationId}/database`),
        'Database config'
      ),

    reverify: async (organizationId: number): Promise<{ display: DatabaseDisplay; probe: DatabaseTestResult | null }> => {
      const res = await apiClient.post<Envelope<DatabaseDisplay>>(
        `${ADMIN}/organizations/${organizationId}/database/reverify`,
        {}
      );
      return { display: unwrap(res, 'Database config'), probe: res.data.meta?.probe ?? null };
    },

    /** Apply pending migrations to the workspace's own database now. 502 when they fail there. */
    migrate: async (organizationId: number): Promise<{ display: DatabaseDisplay; migrationsApplied: number | null }> => {
      const res = await apiClient.post<Envelope<DatabaseDisplay>>(
        `${ADMIN}/organizations/${organizationId}/database/migrate`,
        {}
      );
      return { display: unwrap(res, 'Database config'), migrationsApplied: res.data.meta?.migrationsApplied ?? null };
    },

    /** The workspace's latest data move, or null. */
    move: async (organizationId: number): Promise<DatabaseMoveDetail | null> => {
      const res = await apiClient.get<ApiResponse<DatabaseMoveDetail | null>>(
        `${ADMIN}/organizations/${organizationId}/database/move`
      );
      return res.data.data ?? null;
    },

    /** Operator confirmation: only now are the workspace's rows deleted from the managed database. */
    confirmCleanup: async (organizationId: number): Promise<DatabaseMoveDetail> =>
      unwrap(
        await apiClient.post<ApiResponse<DatabaseMoveDetail>>(
          `${ADMIN}/organizations/${organizationId}/database/move/cleanup`,
          {}
        ),
        'Data move'
      ),

    /** Free workspaces still on the managed database, soonest deadline first. */
    retention: async (): Promise<RetentionRow[]> =>
      (await apiClient.get<ApiResponse<RetentionRow[]>>(`${ADMIN}/platform/database/retention`)).data.data ?? [],

    /** Own-database workspaces whose database is not answering (paused). */
    degraded: async (): Promise<DegradedRow[]> =>
      (await apiClient.get<ApiResponse<DegradedRow[]>>(`${ADMIN}/platform/database/degraded`)).data.data ?? [],
  },
};
