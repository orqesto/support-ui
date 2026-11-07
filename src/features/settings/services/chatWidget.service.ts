import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export interface ChatWidget {
  id: number;
  organizationId: number;
  name: string;
  departmentId: number | null;
  departmentIds: number[];
  enabled: boolean;
  welcomeMessage: string | null;
  placeholder: string | null;
  /**
   * The email account agents' replies to escalated chats go out from. Without one, a visitor
   * who left an address can still not be answered by email. Optional: older backends omit it.
   */
  escalationSourceId?: number | null;
  /**
   * "AI drafts off" contact-form texts. null = the built-in default. `{email}` in the handoff
   * message becomes the visitor's address. Optional: older backends omit them.
   */
  handoffMessage?: string | null;
  emailRequestMessage?: string | null;
  collectUserInfo: boolean;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  widgetKey: string;
  messagesPerSession: number;
  allowedDomains: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  embedCode?: string;
}

export interface CreateChatWidgetRequest {
  name: string;
  departmentId?: number | null;
  departmentIds?: number[];
  welcomeMessage?: string;
  placeholder?: string;
  escalationSourceId?: number | null;
  handoffMessage?: string | null;
  emailRequestMessage?: string | null;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  collectUserInfo?: boolean;
  allowedDomains?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateChatWidgetRequest {
  name?: string;
  departmentId?: number | null;
  departmentIds?: number[];
  welcomeMessage?: string;
  placeholder?: string;
  escalationSourceId?: number | null;
  handoffMessage?: string | null;
  emailRequestMessage?: string | null;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  collectUserInfo?: boolean;
  allowedDomains?: string[];
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export const chatWidgetService = {
  async getAll(): Promise<ApiResponse<ChatWidget[]>> {
    const response = await apiClient.get<{ success: boolean; data: ChatWidget[] }>('/api/chat-widgets');
    return { success: response.data.success, data: response.data.data };
  },

  async create(data: CreateChatWidgetRequest): Promise<ApiResponse<ChatWidget>> {
    const response = await apiClient.post<{ success: boolean; data: ChatWidget }>('/api/chat-widgets', data);
    return { success: response.data.success, data: response.data.data };
  },

  async update(id: number, data: UpdateChatWidgetRequest): Promise<ApiResponse<ChatWidget>> {
    const response = await apiClient.put<{ success: boolean; data: ChatWidget }>(`/api/chat-widgets/${id}`, data);
    return { success: response.data.success, data: response.data.data };
  },

  async delete(id: number): Promise<ApiResponse<{ message: string }>> {
    const response = await apiClient.delete<{ success: boolean; data: { message: string } }>(`/api/chat-widgets/${id}`);
    return { success: response.data.success, data: response.data.data };
  },
};
