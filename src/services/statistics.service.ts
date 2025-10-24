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
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const statisticsService = {
  getAll: async (): Promise<ApiResponse<StatisticsData>> => {
    const response = await apiClient.get<{ success: boolean; data: StatisticsData }>(
      '/api/statistics'
    );
    return { success: response.data.success, data: response.data.data };
  },
};
