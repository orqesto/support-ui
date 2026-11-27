import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import type { Department } from '@/types';

/**
 * Teams builder calls (presets, library, rules summary, roles). Response shapes follow the
 * backend routes in `departmentRoutes.ts`; every reader is defensive so a missing field reads
 * as 0 / [] / null and never throws.
 */

export const TEAM_ROLES = [
  'generalRules',
  'billingExtraction',
  'receivesPromotional',
  'analysisPreferred',
  'intentRouted',
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** The roles a team holds (true flags only), in `TEAM_ROLES` order. */
export const rolesOf = (team: Department): TeamRole[] =>
  TEAM_ROLES.filter((role) => team[role] === true);

export type PresetRef = { scope: 'platform' | 'workspace'; id: number };

export type PresetView = {
  scope: 'platform' | 'workspace';
  id: number;
  key: string;
  name: string;
  description: string;
  roles: TeamRole[];
  /** Items an apply would copy. */
  itemCount: number;
  /** `itemCount` per flow. */
  flowCounts: Record<string, number>;
  source: 'builtin' | 'admin' | 'workspace';
  /** Library items archived since; an apply leaves them out. */
  retiredCount: number;
};

/**
 * The create answered 2xx but without the team: it most likely exists. The page must not say it
 * could not be created, or a retry makes a second team.
 */
export class TeamNotReturnedError extends Error {
  constructor() {
    super('The team was not returned');
    this.name = 'TeamNotReturnedError';
  }
}

export type ApplyFailure = { name: string; flow: string; code: string };
export type ApplyFailureCode =
  | 'MISSING_ITEM'
  | 'CAPABILITY_ITEM'
  | 'WORKSPACE_WIDE_ITEM'
  | 'EMBEDDING_UNAVAILABLE'
  | 'UNSAFE_PATTERN'
  | 'NOT_IN_EFFECT'
  | 'VALIDATION_ERROR'
  | 'WRITE_FAILED';

export type ApplyResult = {
  inserted: number;
  alreadyPresent: number;
  retired: number;
  failed: ApplyFailure[];
  rolesSet: TeamRole[];
  previousHolders: { role: TeamRole; teamId: number }[];
};

export type HeldRole = { role: TeamRole; teamId: number; teamName: string };

/** A 409 `ROLES_HELD`: the preset would move roles other teams hold. Nothing was changed. */
export class RolesHeldError extends Error {
  heldRoles: HeldRole[];
  constructor(heldRoles: HeldRole[], message = 'Some roles are held by other teams.') {
    super(message);
    this.name = 'RolesHeldError';
    this.heldRoles = heldRoles;
  }
}

export type CreateFromPresetResult = {
  team: Department;
  apply: ApplyResult | { error: string; heldRoles?: HeldRole[] };
  notice: string | null;
  warnings: string[];
};

export type WorkspaceLibraryItem = {
  id: number;
  flow: string;
  name: string;
  description: string;
  purposeGroup: string | null;
  preview: string | null;
};

export type TeamRuleSummary = {
  flow: string;
  total: number;
  /** null for a flow with no on/off (categories, sla). */
  active: number | null;
  /** null for a flow that records no fires. */
  neverFired: number | null;
};

export type TeamRuleRow = {
  id: number;
  label: string;
  active: boolean | null;
  matchCount: number | null;
  lastMatchedAt: string | null;
  createdAt: string | null;
};

export type SkippedRule = { flow: string; name: string; reason: string };

// ── normalisers ─────────────────────────────────────────────────────────────────────────────────

const objectOf = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** The `data` of `{ success, data }`, or the body itself when it is not wrapped. */
const unwrap = (body: unknown): unknown => {
  const obj = objectOf(body);
  return 'success' in obj && 'data' in obj ? obj.data : body;
};

const numberOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const numbersOf = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(objectOf(raw))) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
};

const isRole = (value: unknown): value is TeamRole =>
  typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value);
const rolesList = (raw: unknown): TeamRole[] => listOf(raw).filter(isRole);

const heldRolesOf = (raw: unknown): HeldRole[] =>
  listOf(raw).flatMap((entry) => {
    const one = objectOf(entry);
    return isRole(one.role)
      ? [{ role: one.role, teamId: numberOf(one.teamId), teamName: stringOf(one.teamName) }]
      : [];
  });

const normaliseApply = (raw: unknown): ApplyResult => {
  const body = objectOf(raw);
  return {
    inserted: numberOf(body.inserted),
    alreadyPresent: numberOf(body.alreadyPresent),
    retired: numberOf(body.retired),
    failed: listOf(body.failed).map((entry) => {
      const one = objectOf(entry);
      return { name: stringOf(one.name), flow: stringOf(one.flow), code: stringOf(one.code) };
    }),
    rolesSet: rolesList(body.rolesSet),
    previousHolders: listOf(body.previousHolders).flatMap((entry) => {
      const one = objectOf(entry);
      return isRole(one.role) ? [{ role: one.role, teamId: numberOf(one.teamId) }] : [];
    }),
  };
};

const normalisePreset = (raw: unknown): PresetView | null => {
  const body = objectOf(raw);
  if (typeof body.id !== 'number') return null;
  const source = body.source === 'builtin' || body.source === 'admin' ? body.source : 'workspace';
  return {
    scope: body.scope === 'platform' ? 'platform' : 'workspace',
    id: body.id,
    key: stringOf(body.key),
    name: stringOf(body.name),
    description: stringOf(body.description),
    roles: rolesList(body.roles),
    itemCount: numberOf(body.itemCount),
    flowCounts: numbersOf(body.flowCounts),
    source,
    retiredCount: numberOf(body.retiredCount),
  };
};

const emptyPreset = (): PresetView => ({
  scope: 'workspace',
  id: 0,
  key: '',
  name: '',
  description: '',
  roles: [],
  itemCount: 0,
  flowCounts: {},
  source: 'workspace',
  retiredCount: 0,
});

const normaliseLibraryItem = (raw: unknown): WorkspaceLibraryItem | null => {
  const body = objectOf(raw);
  if (typeof body.id !== 'number') return null;
  return {
    id: body.id,
    flow: stringOf(body.flow),
    name: stringOf(body.name),
    description: stringOf(body.description),
    purposeGroup: stringOrNull(body.purposeGroup),
    preview: stringOrNull(body.preview),
  };
};

const normaliseRuleRow = (raw: unknown): TeamRuleRow | null => {
  const body = objectOf(raw);
  if (typeof body.id !== 'number') return null;
  return {
    id: body.id,
    label: stringOf(body.label),
    active: typeof body.active === 'boolean' ? body.active : null,
    matchCount: numberOrNull(body.matchCount),
    lastMatchedAt: stringOrNull(body.lastMatchedAt),
    createdAt: stringOrNull(body.createdAt),
  };
};

const notNull = <T>(value: T | null): value is T => value !== null;

/** Only the params that are set, so the request carries no `undefined` keys. */
const paramsOf = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));

/** A 409 `ROLES_HELD` becomes a `RolesHeldError`; any other error comes back unchanged. */
const rolesHeldOrSame = (err: unknown): unknown => {
  const body = getErrorBody(err);
  if (getErrorStatus(err) === 409 && body?.code === 'ROLES_HELD') {
    return new RolesHeldError(
      heldRolesOf((body as { heldRoles?: unknown }).heldRoles),
      typeof body.error === 'string' ? body.error : undefined
    );
  }
  return err;
};

export const teamBuilderService = {
  listPresets: async (): Promise<PresetView[]> => {
    const response = await apiClient.get<unknown>('/api/departments/presets');
    return listOf(unwrap(response.data)).map(normalisePreset).filter(notNull);
  },

  createFromPreset: async (input: {
    preset: PresetRef;
    name: string;
    color?: string;
    moveRoles?: boolean;
  }): Promise<CreateFromPresetResult> => {
    let response;
    try {
      response = await apiClient.post<unknown>('/api/departments/from-preset', input);
    } catch (err) {
      throw rolesHeldOrSame(err);
    }
    const body = objectOf(unwrap(response.data));
    const rawApply = objectOf(body.apply);
    // A 201 can still carry a refusal: the team exists, the apply did not run.
    const apply =
      typeof rawApply.error === 'string'
        ? {
            error: rawApply.error,
            ...(Array.isArray(rawApply.heldRoles)
              ? { heldRoles: heldRolesOf(rawApply.heldRoles) }
              : {}),
          }
        : normaliseApply(rawApply);
    const team = objectOf(body.team);
    if (typeof team.id !== 'number') throw new TeamNotReturnedError();
    return {
      team: team as unknown as Department,
      apply,
      notice: stringOrNull(body.notice),
      warnings: listOf(body.warnings).filter(
        (warning): warning is string => typeof warning === 'string'
      ),
    };
  },

  applyPreset: async (
    teamId: number,
    preset: PresetRef,
    moveRoles?: boolean
  ): Promise<ApplyResult> => {
    try {
      const response = await apiClient.post<unknown>(`/api/departments/${teamId}/apply-preset`, {
        preset,
        ...(moveRoles === undefined ? {} : { moveRoles }),
      });
      return normaliseApply(unwrap(response.data));
    } catch (err) {
      throw rolesHeldOrSame(err);
    }
  },

  applyItems: async (teamId: number, itemIds: number[]): Promise<ApplyResult> => {
    const response = await apiClient.post<unknown>(`/api/departments/${teamId}/apply-items`, {
      itemIds,
    });
    return normaliseApply(unwrap(response.data));
  },

  saveAsPreset: async (
    teamId: number,
    input: { name: string; description: string }
  ): Promise<{ preset: PresetView; skipped: SkippedRule[] }> => {
    const response = await apiClient.post<unknown>(
      `/api/departments/${teamId}/save-as-preset`,
      input
    );
    const body = objectOf(unwrap(response.data));
    return {
      preset: normalisePreset(body.preset) ?? emptyPreset(),
      skipped: listOf(body.skipped).flatMap((entry) => {
        const one = objectOf(entry);
        return typeof one.name === 'string'
          ? [{ flow: stringOf(one.flow), name: one.name, reason: stringOf(one.reason) }]
          : [];
      }),
    };
  },

  archivePreset: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/departments/presets/workspace/${id}`);
  },

  setRole: async (teamId: number, role: TeamRole, on: boolean): Promise<void> => {
    await apiClient.patch(`/api/departments/${teamId}/roles`, { role, on });
  },

  listLibrary: async (params: {
    flow?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: WorkspaceLibraryItem[];
    total: number;
    page: number;
    pageSize: number;
    countsByFlow: Record<string, number>;
  }> => {
    const response = await apiClient.get<unknown>('/api/departments/library', {
      params: paramsOf(params),
    });
    const body = objectOf(unwrap(response.data));
    return {
      items: listOf(body.items).map(normaliseLibraryItem).filter(notNull),
      total: numberOf(body.total),
      page: numberOf(body.page) || 1,
      pageSize: numberOf(body.pageSize),
      countsByFlow: numbersOf(body.countsByFlow),
    };
  },

  ruleSummary: async (teamId: number): Promise<TeamRuleSummary[]> => {
    const response = await apiClient.get<unknown>(`/api/departments/${teamId}/rules/summary`);
    return listOf(unwrap(response.data)).flatMap((entry) => {
      const one = objectOf(entry);
      return typeof one.flow === 'string'
        ? [
            {
              flow: one.flow,
              total: numberOf(one.total),
              active: numberOrNull(one.active),
              neverFired: numberOrNull(one.neverFired),
            },
          ]
        : [];
    });
  },

  teamRules: async (
    teamId: number,
    params: { flow: string; neverFired?: boolean; page?: number; pageSize?: number }
  ): Promise<{ items: TeamRuleRow[]; total: number; page: number; pageSize: number }> => {
    const { neverFired, ...rest } = params;
    const response = await apiClient.get<unknown>(`/api/departments/${teamId}/rules`, {
      params: paramsOf({ ...rest, neverFired: neverFired ? 'true' : undefined }),
    });
    const body = objectOf(unwrap(response.data));
    return {
      items: listOf(body.items).map(normaliseRuleRow).filter(notNull),
      total: numberOf(body.total),
      page: numberOf(body.page) || 1,
      pageSize: numberOf(body.pageSize),
    };
  },
};
