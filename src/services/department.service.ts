import { apiClient } from '@/lib/api-client';
import type { Department } from '@/types';

export type { Department };

/**
 * Customers call a department a "team". The API keeps the `/api/departments` paths and the
 * `department*` field names; only the words on screen changed.
 *
 * Every teams-mode call lives in this file, so the response shapes are easy to adjust in one
 * place once the backend lands.
 */

/**
 * `GET /api/departments/mode` → `{ data: { enabled, source, defaultDepartmentId } }`, and
 * `PUT /api/departments/mode` with body `{ enabled }`. Exposed here as `teamsEnabled`.
 */
export type TeamsMode = {
  teamsEnabled: boolean;
  /** 'stored' = the admin chose; 'derived' = nothing stored (on when 2+ active teams). */
  source?: 'stored' | 'derived';
  defaultDepartmentId?: number | null;
};

/**
 * `GET /api/departments/mode/preview`: what moves into the default team when teams are
 * switched off. The backend sends `{ defaultDepartment, teams: [{ …, moves }], totals,
 * membersAddedToDefault, irreversible }`; `counts` here is `totals`, rendered generically by
 * key, so a key the backend adds or drops needs no FE change (labels: `TEAMS_OFF_COUNT_LABELS`).
 */
export type TeamsOffPreview = {
  defaultDepartment: { id: number; name: string } | null;
  /** Every active team except the default, with its own moves. */
  teams: Array<{ id: number; name: string; moves: Record<string, number> }>;
  teamsToMerge: number;
  counts: Record<string, number>;
  /** Members not yet in the default team, who will be added to it. */
  membersAddedToDefault: number;
};

/** New team. The slug is derived from the name; the backend derives the ID prefix. */
export type CreateTeamInput = {
  name: string;
  slug: string;
  color?: string;
  description?: string;
};

/** Called with the list response's `teamsEnabled`; `undefined` when the backend is older. */
type TeamsModeReceiver = (teamsEnabled: boolean | undefined) => void;

const readTeamsEnabled = (body: unknown): boolean | undefined => {
  if (body && typeof body === 'object' && 'teamsEnabled' in body) {
    const value = (body as { teamsEnabled?: unknown }).teamsEnabled;
    return typeof value === 'boolean' ? value : undefined;
  }
  return undefined;
};

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** `{ a: 1, b: 'x' }` → `{ a: 1 }`: numbers only, anything else dropped. */
const numbersOf = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
  }
  return out;
};

/** The `data` of `{ success, data }`, or the body itself when it is not wrapped. */
const unwrap = (body: unknown): Record<string, unknown> => {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const inner = 'success' in obj && obj.data && typeof obj.data === 'object' ? obj.data : obj;
  return inner as Record<string, unknown>;
};

/** `{ enabled }` (current backend) or `{ teamsEnabled }`; undefined when neither is a boolean. */
const readEnabled = (body: Record<string, unknown>): boolean | undefined => {
  if (typeof body.enabled === 'boolean') return body.enabled;
  if (typeof body.teamsEnabled === 'boolean') return body.teamsEnabled;
  return undefined;
};

/** Normalise the preview so a missing or odd field never reaches the dialog. */
const normalisePreview = (raw: unknown): TeamsOffPreview => {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawDefault = body.defaultDepartment as { id?: unknown; name?: unknown } | null | undefined;
  const teams = (Array.isArray(body.teams) ? (body.teams as unknown[]) : []).flatMap((raw) => {
    const one = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return typeof one.id === 'number'
      ? [
          {
            id: one.id,
            name: typeof one.name === 'string' ? one.name : '',
            moves: numbersOf(one.moves),
          },
        ]
      : [];
  });
  // `totals` is the backend's name; `counts` is accepted too.
  const counts = numbersOf(body.totals ?? body.counts);
  return {
    defaultDepartment:
      rawDefault && typeof rawDefault.id === 'number'
        ? { id: rawDefault.id, name: typeof rawDefault.name === 'string' ? rawDefault.name : '' }
        : null,
    teams,
    teamsToMerge: Array.isArray(body.teams) ? teams.length : toNumber(body.teamsToMerge),
    counts,
    membersAddedToDefault: toNumber(body.membersAddedToDefault),
  };
};

export const departmentService = {
  /**
   * Active departments by default; pass true to include soft-deleted ones (for restore UIs).
   * `onTeamsMode` receives the response's `teamsEnabled` (undefined on an older backend).
   */
  getAll: async (
    includeInactive = false,
    onTeamsMode?: TeamsModeReceiver
  ): Promise<Department[]> => {
    const response = await apiClient.get<{
      success: boolean;
      data: Department[];
      teamsEnabled?: boolean;
    }>(`/api/departments${includeInactive ? '?includeInactive=true' : ''}`);
    onTeamsMode?.(readTeamsEnabled(response.data));
    return response.data.data;
  },

  /**
   * Promote a department to the org-level default (fallback). The BE clears the previous
   * default in the same transaction, so exactly one department stays default per org.
   */
  setDefault: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { isDefault: true }
    );
    return response.data.data;
  },

  /**
   * Deactivate (BE sets active=false); the department disappears from getAll(). A team with
   * threads, channels or members needs `targetDepartmentId`: its work moves there first.
   */
  deactivate: async (id: number, targetDepartmentId?: number): Promise<void> => {
    await apiClient.delete(`/api/departments/${id}`, {
      data: targetDepartmentId ? { targetDepartmentId } : undefined,
    });
  },

  /**
   * Restore a soft-deleted department (active=true). 403 `PLAN_TEAM_LIMIT` = plan limit,
   * 409 `TEAMS_SWITCHED_OFF` = teams off; both messages are shown as the server wrote them.
   */
  reactivate: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { active: true }
    );
    return response.data.data;
  },

  /** Create a team. 403 `PLAN_TEAM_LIMIT` / 409 `TEAMS_SWITCHED_OFF`: messages shown as-is. */
  create: async (input: CreateTeamInput): Promise<Department> => {
    const response = await apiClient.post<{ success: boolean; data: Department }>(
      '/api/departments',
      input
    );
    return response.data.data;
  },

  /** Rename or recolour a team. */
  update: async (
    id: number,
    patch: { name?: string; color?: string; description?: string }
  ): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      patch
    );
    return response.data.data;
  },

  /** Whether the workspace uses teams. */
  getTeamsMode: async (): Promise<TeamsMode> => {
    const response = await apiClient.get<unknown>('/api/departments/mode');
    const body = unwrap(response.data);
    const source = body.source === 'stored' || body.source === 'derived' ? body.source : undefined;
    return {
      teamsEnabled: readEnabled(body) ?? false,
      source,
      defaultDepartmentId:
        typeof body.defaultDepartmentId === 'number' ? body.defaultDepartmentId : null,
    };
  },

  /**
   * Switch teams on or off. Off merges every other team into the default team and cannot be
   * undone; on only writes the flag (teams switched back on start empty).
   */
  setTeamsMode: async (teamsEnabled: boolean): Promise<TeamsMode> => {
    const response = await apiClient.put<unknown>('/api/departments/mode', {
      enabled: teamsEnabled,
    });
    return { teamsEnabled: readEnabled(unwrap(response.data)) ?? teamsEnabled };
  },

  /** What switching teams off would move into the default team. */
  previewTeamsOff: async (): Promise<TeamsOffPreview> => {
    const response = await apiClient.get<unknown>('/api/departments/mode/preview');
    return normalisePreview(unwrap(response.data));
  },
};

/**
 * Readable labels for the preview's count keys. A key not listed here is shown with a label
 * derived from the key itself, so a new backend key still renders.
 */
export const TEAMS_OFF_COUNT_LABELS: Record<string, string> = {
  conversations: 'Threads',
  threads: 'Threads',
  totalConversations: 'Threads',
  openConversations: 'Open threads',
  tickets: 'Tickets',
  messageSources: 'Channels',
  sources: 'Channels',
  channels: 'Channels',
  sourceLinks: 'Channel links',
  users: 'Members',
  members: 'Members',
  memberships: 'Members',
  kbEntries: 'Knowledge base entries',
  knowledgeBaseEntries: 'Knowledge base entries',
  userMemberships: 'Members',
  messageSourceLinks: 'Channel links',
  knowledgeBase: 'Knowledge base entries',
  ticketingIntegrations: 'Ticket system connections',
  integrations: 'Ticket system connections',
};

/** A key with no label reads as words: `mergedRules` → "Merged rules", `open_threads` → "Open threads". */
export const labelForTeamsOffCount = (key: string): string => {
  const known = TEAMS_OFF_COUNT_LABELS[key];
  if (known) return known;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};
