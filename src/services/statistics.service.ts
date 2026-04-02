import { apiClient } from '@/lib/api-client';

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
  email: string;
  orgRole: string;
  departmentRoles: string[];
  stats: {
    messagesAssigned: number;
    messagesProcessed: number;
    messagesReplied: number;
    avgReplyTimeHours: number | null;
    ticketsAssigned: number;
    ticketsResolved: number;
    notesAdded: number;
    unresolvedMessages: number;
    outgoingMessages: number;
    avgConfidence: number | null;
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
  threadSizeDistribution: Record<string, number>;
  categoryTrends: Array<{
    categoryId: number | null;
    categoryName: string;
    week: string;
    count: number;
  }>;
  languageBreakdown: Array<{ language: string; count: number }>;
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
};
