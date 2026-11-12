import { apiClient } from '@/lib/api-client';
import type { SlaBreach } from '@/types/api';

export type SLASummary = {
  messages: {
    avgResponseTime: number | null;
    avgResponsePeriodDays: number | null; // = selected window when it has data, null otherwise
    breaches24h: number;
    complianceRate: number | null; // null when no replied messages exist yet
  };
  tickets: {
    avgFirstResponse: number | null; // null when no first-response data yet
    avgResolution: number | null; // null when no resolved tickets yet
    firstResponseBreaches24h: number;
    resolutionBreaches24h: number;
    complianceRate: number | null; // null when no tickets with first_response_at exist yet
  };
};

type ChannelStats = {
  total: number;
  responded: number;
  avgResponseSeconds: number;
  breached: number;
  breachRate: number;
  botResponses: number;
  humanResponses: number;
};

type PriorityStats = {
  total: number;
  firstResponseTarget: number;
  avgFirstResponse: number;
  firstResponseBreached: number;
  resolutionTarget: number;
  /** Backend 0238: the target in minutes (resolutionTarget may be fractional hours). Absent before. */
  resolutionTargetMinutes?: number;
  avgResolution: number;
  resolutionBreached: number;
};

/** Thread resolution cycles (backend 0238): one per resolve, against the thread's target. */
export type ResolutionTotals = {
  total: number;
  resolved: number;
  breached: number;
  decided: number;
  complianceRate: number | null;
  avgResolutionSeconds: number | null;
  medianResolutionSeconds: number | null;
};
export type ThreadResolutionStats = ResolutionTotals & {
  byPriority: Partial<Record<'critical' | 'high' | 'medium' | 'low', ResolutionTotals>>;
};

export type SLAStatistics = {
  period: {
    days: number;
    from: string;
    to: string;
  };
  messages: {
    // The server keys these off whatever channels actually have traffic, so a channel
    // missing here is invisible in the UI rather than merely untyped.
    email?: ChannelStats;
    telegram?: ChannelStats;
    slack?: ChannelStats;
    chat?: ChannelStats;
    whatsapp?: ChannelStats;
    compliance: {
      total: number;
      breached: number;
      rate: number;
    };
    /** Null from a backend older than 0238 (normalised in getStatistics). */
    resolution: ThreadResolutionStats | null;
  };
  tickets: {
    critical?: PriorityStats;
    high?: PriorityStats;
    medium?: PriorityStats;
    low?: PriorityStats;
    compliance: {
      firstResponse: {
        total: number;
        breached: number;
        rate: number;
      };
      resolution: {
        total: number;
        breached: number;
        rate: number;
      };
    };
  };
};

// Breach shape generated from the backend contract (adds targetHours/actualHours
// for resolution breaches, which the old FE type omitted).
export type SLABreach = SlaBreach;

export type SLABreachesResponse = {
  total: number;
  breaches: SLABreach[];
};

export type SLATrendPoint = {
  period: string;
  total: number;
  responded?: number;
  avg_response_seconds?: number;
  breached: number;
  bot_responses?: number;
  human_responses?: number;
  with_first_response?: number;
  avg_first_response_minutes?: number;
  first_response_breached?: number;
  resolved?: number;
  avg_resolution_hours?: number;
  resolution_breached?: number;
};

export type SLATrendsResponse = {
  period: {
    days: number;
    interval: string;
    from: string;
    to: string;
  };
  messages: SLATrendPoint[];
  tickets: SLATrendPoint[];
};

export type SLABreachEvent = {
  id: number;
  type: 'message' | 'message_resolution' | 'ticket_first_response' | 'ticket_resolution';
  organizationId: number;
  severity: 'warning' | 'critical';
  breachAmount: number;
  details: {
    channel?: string;
    priority?: string;
    sender: string;
    subject?: string;
    title?: string;
    targetMinutes?: number;
    actualMinutes?: number;
  };
  createdAt: string;
};

// SLA endpoints return the resource directly (no { success, data } envelope)
const getSummary = async (params?: {
  days?: number;
  from?: string;
  to?: string;
}): Promise<SLASummary> => {
  const response = await apiClient.get<SLASummary>('/api/sla/summary', { params });
  return response.data;
};

const getStatistics = async (params?: {
  channel?: string;
  departmentSlug?: string;
  days?: number;
  from?: string;
  to?: string;
}): Promise<SLAStatistics> => {
  const response = await apiClient.get<SLAStatistics>('/api/sla/statistics', { params });
  const data = response.data;
  // Version skew: an older backend sends no `messages.resolution`; a malformed one is dropped.
  const resolution = (data?.messages as { resolution?: unknown } | undefined)?.resolution;
  const valid =
    !!resolution &&
    typeof resolution === 'object' &&
    typeof (resolution as ResolutionTotals).total === 'number' &&
    typeof (resolution as ThreadResolutionStats).byPriority === 'object' &&
    (resolution as ThreadResolutionStats).byPriority !== null;
  return data?.messages
    ? {
        ...data,
        messages: {
          ...data.messages,
          resolution: valid ? (resolution as ThreadResolutionStats) : null,
        },
      }
    : data;
};

const getBreaches = async (params?: {
  limit?: number;
  type?: 'message' | 'ticket';
  days?: number;
  from?: string;
  to?: string;
}): Promise<SLABreachesResponse> => {
  // `include=resolution` (backend 0238): threads' resolution-clock breaches too. An older backend
  // ignores the parameter.
  const response = await apiClient.get<SLABreachesResponse>('/api/sla/breaches', {
    params: { ...params, include: 'resolution' },
  });
  return response.data;
};

const getTrends = async (params?: {
  days?: number;
  from?: string;
  to?: string;
  interval?: 'hour' | 'day' | 'week';
}): Promise<SLATrendsResponse> => {
  const response = await apiClient.get<SLATrendsResponse>('/api/sla/trends', { params });
  return response.data;
};

/**
 * "Count SLA from" (backend 0230): SLA Performance counts customer waits that began at or after
 * this instant. null = everything counts. Nothing is deleted by moving it.
 */
export type SlaStatsSince = {
  since: string | null;
  /** The workspace never chose: counting from when exact tracking began (the release). */
  isDefault: boolean;
};

/** A backend without `isDefault` (before the follow-up) reads as an explicit choice. */
const toStatsSince = (data: { since: string | null; isDefault?: boolean }): SlaStatsSince => ({
  since: data.since,
  isDefault: data.isDefault === true,
});

const getStatsSince = async (): Promise<SlaStatsSince> => {
  const response = await apiClient.get<{ since: string | null; isDefault?: boolean }>(
    '/api/sla/stats-since'
  );
  return toStatsSince(response.data);
};

/** Org admin: 'now' starts over; null counts all history; 'default' goes back to the release. */
const setStatsSince = async (since: 'now' | 'default' | null): Promise<SlaStatsSince> => {
  const response = await apiClient.put<{ since: string | null; isDefault?: boolean }>(
    '/api/sla/stats-since',
    { since }
  );
  return toStatsSince(response.data);
};

export const slaService = {
  getStatsSince,
  setStatsSince,
  getSummary,
  getStatistics,
  getBreaches,
  getTrends,
};
