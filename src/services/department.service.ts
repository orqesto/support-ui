import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';
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
  /** A switch-off is running, or was interrupted. Absent on an older backend. */
  switching?: boolean;
  /**
   * A switch-off started and nobody is running it: it did not finish. PUT `{ enabled: false }`
   * resumes it; until then creating a team or switching one on is refused (409).
   */
  interrupted?: boolean;
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
  /** Teams already switched off that still hold rows: swept into the default team too. */
  inactiveTeamsSwept: number;
  /**
   * What stops the switch-off (the confirm is disabled while any is listed), e.g. a team's own
   * ticket system connection: `{ kind: 'ticketingIntegration', teamId, teamName, integrationName }`.
   */
  blockers: Array<{
    kind: string;
    teamId: number | null;
    teamName: string;
    integrationId: number | null;
    integrationName: string;
  }>;
  /** Labels / categories merged into the default team's same-named one (`moves.mergedIntoSameName`). */
  mergedIntoSameName: Record<string, number>;
  counts: Record<string, number>;
  /** Members not yet in the default team, who will be added to it. */
  membersAddedToDefault: number;
  /** A merged team qualifies leads ⇒ the default team will, so on all the workspace's mail. */
  leadQualificationMovesToDefault: boolean;
  /**
   * What does NOT move: it stays with each team and comes back if the team is switched on
   * again. Summed over the teams (`teams[].staysWithTeam`), or the top-level `staysWithTeam`
   * (an object of counts, or a list of names). `count` is absent when only a name was sent.
   */
  staysWithTeam: Array<{ key: string; count?: number }>;
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
  const teamsOf = (list: unknown) =>
    (Array.isArray(list) ? (list as unknown[]) : []).flatMap((raw) => {
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
  const teams = teamsOf(body.teams);
  const blockers = (Array.isArray(body.blockers) ? (body.blockers as unknown[]) : []).flatMap(
    (raw) => {
      const one = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return [
        {
          kind: typeof one.kind === 'string' ? one.kind : 'unknown',
          teamId: typeof one.teamId === 'number' ? one.teamId : null,
          teamName: typeof one.teamName === 'string' ? one.teamName : '',
          integrationId: typeof one.integrationId === 'number' ? one.integrationId : null,
          integrationName: typeof one.integrationName === 'string' ? one.integrationName : '',
        },
      ];
    }
  );
  // `mergedIntoSameName` sits inside `moves`: read it from the totals, else sum the teams.
  const mergedIntoSameName: Record<string, number> = {};
  const addMerged = (raw: unknown) => {
    const nested = (raw as Record<string, unknown> | null | undefined)?.mergedIntoSameName;
    for (const [key, value] of Object.entries(numbersOf(nested))) {
      mergedIntoSameName[key] = (mergedIntoSameName[key] ?? 0) + value;
    }
  };
  const totalsRaw = (body.totals ?? body.counts) as Record<string, unknown> | undefined;
  if (totalsRaw && typeof totalsRaw === 'object' && 'mergedIntoSameName' in totalsRaw)
    addMerged(totalsRaw);
  else
    for (const raw of [
      ...(Array.isArray(body.teams) ? (body.teams as unknown[]) : []),
      ...(Array.isArray(body.inactiveTeams) ? (body.inactiveTeams as unknown[]) : []),
    ]) {
      if (raw && typeof raw === 'object') addMerged((raw as Record<string, unknown>).moves);
    }
  const inactiveTeams = teamsOf(body.inactiveTeams);
  // `totals` is the backend's name; `counts` is accepted too.
  const counts = numbersOf(body.totals ?? body.counts);
  const stays = new Map<string, number | undefined>();
  const addStays = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const item of raw)
        if (typeof item === 'string' && !stays.has(item)) stays.set(item, undefined);
      return;
    }
    for (const [key, value] of Object.entries(numbersOf(raw))) {
      stays.set(key, (stays.get(key) ?? 0) + value);
    }
    // `sameAsDefault`: twins the default team already has, so they stay behind. Kept apart
    // under `sameAsDefault.<key>` so the label can say why.
    const twins = (raw as Record<string, unknown> | null)?.sameAsDefault;
    for (const [key, value] of Object.entries(numbersOf(twins))) {
      const twinKey = `sameAsDefault.${key}`;
      stays.set(twinKey, (stays.get(twinKey) ?? 0) + value);
    }
  };
  if (body.staysWithTeam !== undefined) addStays(body.staysWithTeam);
  else
    for (const raw of [
      ...(Array.isArray(body.teams) ? (body.teams as unknown[]) : []),
      ...(Array.isArray(body.inactiveTeams) ? (body.inactiveTeams as unknown[]) : []),
    ]) {
      if (raw && typeof raw === 'object') addStays((raw as Record<string, unknown>).staysWithTeam);
    }
  return {
    defaultDepartment:
      rawDefault && typeof rawDefault.id === 'number'
        ? { id: rawDefault.id, name: typeof rawDefault.name === 'string' ? rawDefault.name : '' }
        : null,
    teams,
    teamsToMerge: Array.isArray(body.teams) ? teams.length : toNumber(body.teamsToMerge),
    inactiveTeamsSwept: inactiveTeams.length,
    blockers,
    mergedIntoSameName,
    counts,
    membersAddedToDefault: toNumber(body.membersAddedToDefault),
    leadQualificationMovesToDefault: body.leadQualificationMovesToDefault === true,
    // Zero rows are left out: "Routing rules 0" says nothing.
    staysWithTeam: [...stays.entries()]
      .filter(([, count]) => count === undefined || count > 0)
      .map(([key, count]) => (count === undefined ? { key } : { key, count })),
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
      switching: body.switching === true,
      interrupted: body.interrupted === true,
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

  /**
   * After a switch-off whose answer never arrived (timeout, dropped connection) or that the
   * backend says is still running: poll `GET /mode` until `switching` is false, then return the
   * final mode. A failed poll is retried; after `timeoutMs` the last known mode is returned with
   * `switching: true`, and the caller says it is still running.
   */
  waitForTeamsSwitch: async ({
    intervalMs = 3000,
    timeoutMs = 10 * 60 * 1000,
  }: { intervalMs?: number; timeoutMs?: number } = {}): Promise<TeamsMode> => {
    const startedAt = Date.now();
    let last: TeamsMode = { teamsEnabled: true, switching: true };
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        last = await departmentService.getTeamsMode();
        // Interrupted: nobody is running it any more, so waiting longer changes nothing.
        if (!last.switching || last.interrupted) return last;
      } catch {
        // The server is busy or the connection is still down: try again.
      }
    }
    return { ...last, switching: true };
  },

  /**
   * The plan's team limit (`maxDepartments`) from GET /api/subscriptions/current; undefined
   * when it cannot be read. 1 = the plan includes one team, so teams cannot be switched on.
   */
  getPlanTeamLimit: async (): Promise<number | undefined> => {
    try {
      const response = await apiClient.get<unknown>('/api/subscriptions/current');
      const plan = unwrap(response.data).plan as
        | { limits?: { maxDepartments?: unknown } }
        | undefined;
      const value = plan?.limits?.maxDepartments;
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
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
  // Moves (GET /mode/preview `moves` / `totals`)
  conversations: 'Threads',
  openConversations: 'Open threads',
  tickets: 'Tickets',
  channels: 'Channels',
  members: 'Members',
  messageSources: 'Channels whose main team this is',
  channelLinks: 'Channel links',
  kbEntries: 'Knowledge base entries',
  kbSourceLinks: 'Knowledge base source links',
  documents: 'Documentation links',
  replyTemplates: 'Reply templates',
  customApiConnections: 'Custom API connection links',
  chatWidgets: 'Chat widgets',
  chatWidgetLinks: 'Chat widget links',
  ticketingIntegrations: 'Ticket system connections',
  spamRules: 'Spam rules',
  detectionRules: 'Detection rules',
  contradictionRules: 'Contradiction rules',
  responseRules: 'Response rules',
  categories: 'Categories',
  labels: 'Labels',
  labelLinks: 'Label links',
  spamLogEntries: 'Spam log entries',
  // Stays (`staysWithTeam`)
  routingRules: 'Routing rules',
  promptTemplates: 'AI prompt templates',
  // Older / alternative names
  threads: 'Threads',
  totalConversations: 'Threads',
  sources: 'Channels',
  sourceLinks: 'Channel links',
  messageSourceLinks: 'Channel links',
  users: 'Members',
  memberships: 'Members',
  userMemberships: 'Members',
  knowledgeBase: 'Knowledge base entries',
  knowledgeBaseEntries: 'Knowledge base entries',
  integrations: 'Ticket system connections',
};

/** A key with no label reads as words: `mergedRules` → "Merged rules", `open_threads` → "Open threads". */
export const labelForTeamsOffCount = (key: string): string => {
  if (key.startsWith('sameAsDefault.')) {
    return `${labelForTeamsOffCount(key.slice('sameAsDefault.'.length))} the default team already has`;
  }
  const known = TEAMS_OFF_COUNT_LABELS[key];
  if (known) return known;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

/**
 * A switch-off that may still be running on the server: the request timed out or the
 * connection dropped (no status), or the backend says one is in progress. The caller polls
 * `getTeamsMode()` until `switching` is false instead of reporting a failure.
 */
export const isTeamsSwitchStillRunning = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  if (getErrorBody(err)?.code === 'TEAMS_SWITCH_IN_PROGRESS') return true;
  const status = getErrorStatus(err);
  if (status === 408 || status === 504) return true;
  if (status !== undefined) return false;
  // No status at all: the request never got an answer (timeout, dropped connection).
  const code = (err as { code?: unknown }).code;
  return (
    (err as { isAxiosError?: unknown }).isAxiosError === true ||
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    code === 'ETIMEDOUT'
  );
};
