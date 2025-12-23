import { apiClient } from '@/lib/api-client';

export type SLASummary = {
  messages: {
    avgResponseTime: number;
    breaches24h: number;
    complianceRate: number;
  };
  tickets: {
    avgFirstResponse: number;
    avgResolution: number;
    firstResponseBreaches24h: number;
    resolutionBreaches24h: number;
    complianceRate: number;
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
  avgResolution: number;
  resolutionBreached: number;
};

export type SLAStatistics = {
  period: {
    days: number;
    from: string;
    to: string;
  };
  messages: {
    email?: ChannelStats;
    telegram?: ChannelStats;
    slack?: ChannelStats;
    compliance: {
      total: number;
      breached: number;
      rate: number;
    };
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

export type SLABreach = {
  id: number;
  type: 'message' | 'ticket_first_response' | 'ticket_resolution';
  channel?: string;
  priority?: string;
  sender: string;
  subject?: string;
  title?: string;
  targetMinutes?: number;
  actualMinutes?: number;
  breachAmount: number;
  createdAt: string;
};

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
  type: 'message' | 'ticket_first_response' | 'ticket_resolution';
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

const getSummary = async (): Promise<SLASummary> => {
  const response = await apiClient.get('/api/sla/summary');
  return response.data;
};

const getStatistics = async (params?: {
  channel?: string;
  departmentRole?: string;
  days?: number;
}): Promise<SLAStatistics> => {
  const response = await apiClient.get('/api/sla/statistics', { params });
  return response.data;
};

const getBreaches = async (params?: {
  limit?: number;
  type?: 'message' | 'ticket';
}): Promise<SLABreachesResponse> => {
  const response = await apiClient.get('/api/sla/breaches', { params });
  return response.data;
};

const getTrends = async (params?: {
  days?: number;
  interval?: 'hour' | 'day' | 'week';
}): Promise<SLATrendsResponse> => {
  const response = await apiClient.get('/api/sla/trends', { params });
  return response.data;
};

export const slaService = {
  getSummary,
  getStatistics,
  getBreaches,
  getTrends,
};
