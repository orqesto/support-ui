const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export type Attachment = {
  id: number;
  ticketId: number | null;
  commentId: number | null;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  externalId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

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
    position: string | null;
    role: string;
  } | null;
  attachments?: Attachment[];
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

  update: async (commentId: number, content: string): Promise<ApiResponse<Comment>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update comment');
    }

    return response.json();
  },

  delete: async (commentId: number): Promise<ApiResponse<void>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete comment');
    }

    return response.json();
  },

  uploadAttachments: async (commentId: number, files: File[]): Promise<ApiResponse<Attachment[]>> => {
    const token = getAuthToken();
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });

    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload attachments');
    }

    return response.json();
  },

  deleteAttachment: async (attachmentId: number): Promise<ApiResponse<void>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete attachment');
    }

    return response.json();
  },

  getTicketAttachments: async (ticketId: number): Promise<ApiResponse<Attachment[]>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/attachments`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch ticket attachments');
    }

    return response.json();
  },

  syncFromJira: async (ticketId: number): Promise<ApiResponse<Comment[]>> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to sync comments from Jira');
    }

    return response.json();
  },
};
