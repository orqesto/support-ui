import { apiClient } from '@/lib/api-client';

export type TicketingSystem = {
  id: number;
  organizationId: number;
  name: string;
  type: 'jira' | 'asana' | 'linear' | 'clickup' | 'monday';
  enabled: boolean;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  isDefault: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

/**
 * Service for managing ticketing system integrations (Jira, Asana, Linear, etc.)
 */
export const ticketingSystemsService = {
  /**
   * Get all ticketing system integrations
   */
  getAll: async (): Promise<ApiResponse<TicketingSystem[]>> => {
    const response = await apiClient.get<{ success: boolean; data: TicketingSystem[] }>(
      '/api/ticketing-systems'
    );
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Get a specific ticketing system integration by ID
   */
  getById: async (id: number, type: string): Promise<ApiResponse<TicketingSystem>> => {
    const response = await apiClient.get<{ success: boolean; data: TicketingSystem }>(
      `/api/ticketing-systems/${id}?type=${type}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * Set a ticketing integration as the default for its department
   */
  setDefault: async (
    id: number,
    type: string
  ): Promise<
    ApiResponse<{
      id: number;
      name: string;
      departmentRole: string;
      isDefault: boolean;
    }>
  > => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: {
        id: number;
        name: string;
        departmentRole: string;
        isDefault: boolean;
      };
    }>(`/api/ticketing-systems/${id}/set-default?type=${type}`);
    return {
      success: response.data.success,
      message: response.data.message,
      data: response.data.data,
    };
  },
};
