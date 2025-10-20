const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export type Comment = {
  id: number;
  ticketId: number;
  userId: number | null;
  authorName: string;
  content: string;
  isInternal: boolean;
  externalId: string | null;
  source: 'app' | 'jira';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  user: {
    id: number;
    firstName: string;
    lastName: string | null;
    email: string;
    organization: string | null;
    position: string | null;
    role: string;
  } | null;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const getAuthToken = () => {
  return localStorage.getItem('token');
};

export const commentsService = {
  getAll: async (ticketId: number): Promise<ApiResponse<Comment[]>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch comments');
    }

    return response.json();
  },

  create: async (
    ticketId: number,
    content: string,
    isInternal: boolean = false
  ): Promise<ApiResponse<Comment>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, isInternal }),
    });

    if (!response.ok) {
      throw new Error('Failed to create comment');
    }

    return response.json();
  },

  sync: async (ticketId: number): Promise<ApiResponse<Comment[]>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to sync comments');
    }

    return response.json();
  },
};
