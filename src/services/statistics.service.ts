import { apiClient } from '@/lib/api-client';
import { slaService, type SLASummary } from './sla.service';

export type { SLASummary } from './sla.service';

export type ChannelStats = {
  channel: string;
  totalMessages: number;
  unprocessedMessages: number;
  processedMessages: number;
  spamCount: number;
  needsInfoCount: number;
  ticketWorthyCount: number;
  totalTickets: number;
  jiraSyncedTickets: number;
  categories: Array<{
    categoryId: string;
    categoryName: string;
    messageCount: number;
    ticketCount: number;
  }>;
};

export type StatisticsData = {
  overview: {
    totalMessages: number;
    actionableMessages: number;
    totalTickets: number;
    totalSpam: number;
    totalNeedsInfo: number;
    jiraSyncedTickets: number;
    activeMessages: number;
    resolvedMessages: number;
    closedMessages: number;
    filteredMessages: number;
  };
  byChannel: ChannelStats[];
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    totalMessages: number;
    totalTickets: number;
  }>;
  aiAccuracy: Array<{
    suggestedCategoryName: string;
    actualCategoryName: string;
    count: number;
  }>;
  aiModels: {
    totalMessages: number;
    totalSpam: number;
    totalUnprocessed: number;
    totalAnalyzed: number;
    totalEmbedded: number;
    analysisProviders: Array<{ provider: string; count: number; percentage: number }>;
    analysisModels: Array<{ model: string; count: number; percentage: number }>;
    embeddingProviders: Array<{ provider: string; count: number; percentage: number }>;
    embeddingModels: Array<{ model: string; count: number; percentage: number }>;
  };
  meta?: {
    truncated: boolean;
    conversationsTruncated: boolean;
    conversationsTotal: number | null;
    eventsTruncated: boolean;
    cached: boolean;
    windowDays: number;
  };
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type UserStatEntry = {
  userId: number;
  firstName: string;
  lastName: string | null;
  // W1-M40: the BE deliberately omits email from team stats (userStatsController), so this
  // is never populated — optional to reflect the real contract; not rendered.
  email?: string;
  orgRole: string;
  departmentSlugs: string[];
  stats: {
    messagesAssigned: number;
    messagesProcessed: number;
    messagesReplied: number;
    avgReplyTimeHours: number | null;
    ticketsAssigned: number;
    ticketsResolved: number;
    notesAdded: number;
    unresolvedMessages: number;
    languageBreakdown: Record<string, number>;
  };
};

export type MessageStatsData = {
  resolutionTime: {
    avgHours: number | null;
    p50Hours: number | null;
    p90Hours: number | null;
    totalClosed: number;
  };
  firstResponseTime: {
    avgHours: number | null;
    p50Hours: number | null;
    p90Hours: number | null;
    totalResponded: number;
  };
  threadSizeDistribution: Record<string, number>;
  categoryTrends: Array<{
    categoryId: number | null;
    categoryName: string;
    week: string;
    count: number;
  }>;
  languageBreakdown: Array<{ language: string; count: number }>;
};

export type LabelStatEntry = {
  labelId: number;
  name: string;
  color: string;
  messageCount: number;
};

export type AIStatsData = {
  respondedBy: Array<{ respondedBy: string; count: number }>;
  summary: {
    aiResponded: number;
    humanResponded: number;
    noResponse: number;
    aiPercentage: number;
  };
  aiReplyDistribution: Record<string, number>;
  analysisModels: Array<{ model: string; provider: string; count: number; percentage: number }>;
  embeddingModels: Array<{ model: string; provider: string; count: number; percentage: number }>;
  suggestedAnswerUsage: {
    total: number;
    bySource: Array<{ source: string; count: number; percentage: number }>;
  };
};

export type SpeedToLeadData = {
  totalLeads: number;
  respondedLeads: number;
  pendingLeads: number;
  slowLeads: number;
  slowLeadRate: number;
  avgResponseSeconds: number;
  medianResponseSeconds: number;
  p90ResponseSeconds: number;
  fastestSeconds: number;
  slowestSeconds: number;
  buckets: {
    under5m: number;
    from5to30m: number;
    from30mToThreshold: number;
    overThreshold: number;
  };
  aiResponses: number;
  humanResponses: number;
  byChannel: Array<{
    channel: string;
    totalLeads: number;
    respondedLeads: number;
    slowLeads: number;
    avgResponseSeconds: number;
  }>;
  thresholdMinutes: number;
  estimatedLostValue: number | null;
  avgLeadValue: number | null;
  window: { days: number };
  leadQualConfigured: boolean;
};

export const statisticsService = {
  getAll: async (): Promise<ApiResponse<StatisticsData>> => {
    const response = await apiClient.get<{ success: boolean; data: StatisticsData }>(
      '/api/statistics'
    );
    return { success: response.data.success, data: response.data.data };
  },

  getTeamStats: async (days = 30): Promise<ApiResponse<UserStatEntry[]>> => {
    const response = await apiClient.get<{ success: boolean; data: UserStatEntry[] }>(
      `/api/statistics/team?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  getUserStats: async (userId: number, days = 30): Promise<ApiResponse<UserStatEntry>> => {
    const response = await apiClient.get<{ success: boolean; data: UserStatEntry }>(
      `/api/statistics/users/${userId}?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  getMessageStats: async (days = 30): Promise<ApiResponse<MessageStatsData>> => {
    const response = await apiClient.get<{ success: boolean; data: MessageStatsData }>(
      `/api/statistics/messages?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  getAIStats: async (days = 30): Promise<ApiResponse<AIStatsData>> => {
    const response = await apiClient.get<{ success: boolean; data: AIStatsData }>(
      `/api/statistics/ai?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  getLabelStats: async (days = 30): Promise<ApiResponse<LabelStatEntry[]>> => {
    const response = await apiClient.get<{ success: boolean; data: LabelStatEntry[] }>(
      `/api/statistics/labels?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  getSpeedToLead: async (days = 30): Promise<ApiResponse<SpeedToLeadData>> => {
    const response = await apiClient.get<{ success: boolean; data: SpeedToLeadData }>(
      `/api/statistics/speed-to-lead?days=${days}`
    );
    return { success: response.data.success, data: response.data.data };
  },
  // Adapter so the SLA summary flows through useStatisticsFetch on the Overview
  // KPI row (getSummary takes {days} and returns raw; the hook needs (days)=>{success,data}).
  getSlaSummary: async (days = 30): Promise<ApiResponse<SLASummary>> => {
    const data = await slaService.getSummary({ days });
    return { success: true, data };
  },
};
