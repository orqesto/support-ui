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
  /**
   * false = the widget never asks a model: every visitor message takes the contact-form path (it
   * asks for an address and hands the chat to the team). Optional: an older backend omits it —
   * absent means "this backend cannot switch it", never "off".
   */
  aiAnswersEnabled?: boolean;
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
  aiAnswersEnabled?: boolean;
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
  aiAnswersEnabled?: boolean;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  collectUserInfo?: boolean;
  allowedDomains?: string[];
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type ChatWidgetSession = {
  id: number;
  startedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  visitorName: string | null;
  visitorEmail: string | null;
  /** The inbox thread the chat was handed to, when it was. */
  conversationId: number | null;
  /** At least one message in the chat was written by a model. */
  botAnswered: boolean;
};
export type ChatWidgetSessionsPage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type ChatWidgetTranscript = {
  session: ChatWidgetSession;
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    /** `bot` = a model wrote it; `notice` = the widget's own fixed line. */
    author: 'visitor' | 'bot' | 'notice';
    content: string;
    createdAt: string;
    /** 0–100. */
    confidence: number | null;
  }>;
  truncated: boolean;
};

export const chatWidgetService = {
  async getAll(): Promise<ApiResponse<ChatWidget[]>> {
    const response = await apiClient.get<{ success: boolean; data: ChatWidget[] }>(
      '/api/chat-widgets'
    );
    return { success: response.data.success, data: response.data.data };
  },

  async create(data: CreateChatWidgetRequest): Promise<ApiResponse<ChatWidget>> {
    const response = await apiClient.post<{ success: boolean; data: ChatWidget }>(
      '/api/chat-widgets',
      data
    );
    return { success: response.data.success, data: response.data.data };
  },

  async update(id: number, data: UpdateChatWidgetRequest): Promise<ApiResponse<ChatWidget>> {
    const response = await apiClient.put<{ success: boolean; data: ChatWidget }>(
      `/api/chat-widgets/${id}`,
      data
    );
    return { success: response.data.success, data: response.data.data };
  },

  /** A widget's chats, newest activity first. Read-only. */
  async getSessions(
    id: number,
    page = 1,
    limit = 25
  ): Promise<{ sessions: ChatWidgetSession[]; pagination: ChatWidgetSessionsPage }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { sessions?: ChatWidgetSession[]; pagination?: Partial<ChatWidgetSessionsPage> };
    }>(`/api/chat-widgets/${id}/sessions?page=${page}&limit=${limit}`);
    const sessions = response.data.data?.sessions ?? [];
    const paging = response.data.data?.pagination;
    return {
      sessions,
      pagination: {
        page: paging?.page ?? page,
        limit: paging?.limit ?? limit,
        total: paging?.total ?? sessions.length,
        totalPages: paging?.totalPages ?? 1,
      },
    };
  },

  /** One chat with what was said in it (the first 500 messages; `truncated` says there are more). */
  async getSession(id: number, sessionId: number): Promise<ChatWidgetTranscript> {
    const response = await apiClient.get<{ success: boolean; data: ChatWidgetTranscript }>(
      `/api/chat-widgets/${id}/sessions/${sessionId}`
    );
    return {
      session: response.data.data.session,
      messages: response.data.data.messages ?? [],
      truncated: response.data.data.truncated === true,
    };
  },

  async delete(id: number): Promise<ApiResponse<{ message: string }>> {
    const response = await apiClient.delete<{ success: boolean; data: { message: string } }>(
      `/api/chat-widgets/${id}`
    );
    return { success: response.data.success, data: response.data.data };
  },
};
