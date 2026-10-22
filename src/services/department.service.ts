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

/** `GET /api/departments/mode` and the body of `PUT /api/departments/mode`. */
export type TeamsMode = { teamsEnabled: boolean };

/**
 * `GET /api/departments/mode/preview`: what moves into the default team when teams are
 * switched off. `counts` is rendered generically by key, so a key the backend adds or drops
 * needs no FE change; see `TEAMS_OFF_COUNT_LABELS` for the readable labels.
 */
export type TeamsOffPreview = {
  defaultDepartment: { id: number; name: string } | null;
  teamsToMerge: number;
  counts: Record<string, number>;
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

/** Normalise the preview so a missing or odd field never reaches the dialog. */
const normalisePreview = (raw: unknown): TeamsOffPreview => {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawDefault = body.defaultDepartment as { id?: unknown; name?: unknown } | null | undefined;
  const counts: Record<string, number> = {};
  if (body.counts && typeof body.counts === 'object') {
    for (const [key, value] of Object.entries(body.counts as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value;
    }
  }
  return {
    defaultDepartment:
      rawDefault && typeof rawDefault.id === 'number'
        ? { id: rawDefault.id, name: typeof rawDefault.name === 'string' ? rawDefault.name : '' }
        : null,
    teamsToMerge: toNumber(body.teamsToMerge),
    counts,
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

  /** Restore a soft-deleted department (active=true). 403 = plan limit, 409 = teams off. */
  reactivate: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { active: true }
    );
    return response.data.data;
  },

  /** Create a team. 403 = plan limit (message shown as-is), 409 = teams are switched off. */
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
    const body = response.data as { data?: unknown } | undefined;
    // Accept both `{ teamsEnabled }` and the usual `{ success, data: { teamsEnabled } }`.
    const value = readTeamsEnabled(body) ?? readTeamsEnabled(body?.data);
    return { teamsEnabled: value ?? false };
  },

  /**
   * Switch teams on or off. Off merges every other team into the default team and cannot be
   * undone; on only writes the flag (teams switched back on start empty).
   */
  setTeamsMode: async (teamsEnabled: boolean): Promise<TeamsMode> => {
    const response = await apiClient.put<unknown>('/api/departments/mode', { teamsEnabled });
    const body = response.data as { data?: unknown } | undefined;
    const value = readTeamsEnabled(body) ?? readTeamsEnabled(body?.data);
    return { teamsEnabled: value ?? teamsEnabled };
  },

  /** What switching teams off would move into the default team. */
  previewTeamsOff: async (): Promise<TeamsOffPreview> => {
    const response = await apiClient.get<unknown>('/api/departments/mode/preview');
    const body = response.data as { success?: unknown; data?: unknown } | undefined;
    const payload = body && 'success' in body && body.data !== undefined ? body.data : body;
    return normalisePreview(payload);
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
