import { apiClient } from '@/lib/api-client';

/** The team roles the backend accepts (a copy: rule-library must not import from settings). */
export type TeamRole =
  | 'generalRules'
  | 'billingExtraction'
  | 'receivesPromotional'
  | 'analysisPreferred'
  | 'intentRouted';

export const TEAM_ROLES: TeamRole[] = [
  'generalRules',
  'billingExtraction',
  'receivesPromotional',
  'analysisPreferred',
  'intentRouted',
];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  generalRules: 'General rules',
  billingExtraction: 'Billing details',
  receivesPromotional: 'Promotional mail',
  analysisPreferred: 'Preferred for analysis',
  intentRouted: 'Routed by intent',
};

/**
 * Platform team presets (global-admin console). The list carries counts, never the items
 * themselves: an edit replaces the whole item list.
 */
export interface ConsolePreset {
  id: number;
  key: string;
  name: string;
  description: string;
  roles: TeamRole[];
  itemCount: number;
  /** `itemCount` per flow. */
  flowCounts: Record<string, number>;
  /** References to library items archived since. */
  retiredCount: number;
  source: string;
  active: boolean;
  updatedAt: string;
}

export interface TeamPresetItemRef {
  librarySeedKey: string;
}

export interface TeamPresetCreateBody {
  name: string;
  description: string;
  roles: TeamRole[];
  items: TeamPresetItemRef[];
  key?: string;
}

/** `updatedAt` is the optimistic-lock token (409 STALE_ITEM). */
export interface TeamPresetUpdateBody {
  updatedAt: string;
  name?: string;
  description?: string;
  roles?: TeamRole[];
  items?: TeamPresetItemRef[];
  active?: boolean;
}

const PATH = '/api/admin/platform/team-presets';

type Envelope<T> = { success: boolean; data: T };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** A row with every field present, so a missing one never crashes a render. */
const normalisePreset = (raw: Partial<ConsolePreset> | null | undefined): ConsolePreset => {
  const row = raw ?? {};
  return {
    id: count(row.id),
    key: text(row.key),
    name: text(row.name),
    description: text(row.description),
    roles: Array.isArray(row.roles) ? row.roles : [],
    itemCount: count(row.itemCount),
    flowCounts: row.flowCounts && typeof row.flowCounts === 'object' ? row.flowCounts : {},
    retiredCount: count(row.retiredCount),
    source: text(row.source),
    active: row.active === true,
    updatedAt: text(row.updatedAt),
  };
};

export const listTeamPresets = async (): Promise<ConsolePreset[]> => {
  const res = await apiClient.get<Envelope<ConsolePreset[]>>(PATH);
  return (Array.isArray(res.data.data) ? res.data.data : []).map(normalisePreset);
};

export const createTeamPreset = async (body: TeamPresetCreateBody): Promise<ConsolePreset> => {
  const res = await apiClient.post<Envelope<ConsolePreset>>(PATH, body);
  return normalisePreset(res.data.data);
};

export const updateTeamPreset = async (id: number, body: TeamPresetUpdateBody): Promise<ConsolePreset> => {
  const res = await apiClient.patch<Envelope<ConsolePreset>>(`${PATH}/${id}`, body);
  return normalisePreset(res.data.data);
};

export const teamPresetsService = { listTeamPresets, createTeamPreset, updateTeamPreset };
export type TeamPresetsService = typeof teamPresetsService;
