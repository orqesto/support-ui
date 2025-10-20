export type ChannelType = 'email' | 'telegram' | 'slack' | 'other';
export type TicketStatus = 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type UserRole = 'admin' | 'agent' | 'user';

export type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
};

export type Message = {
  id: number;
  channel: ChannelType;
  sender: string;
  recipient: string | null;
  subject: string | null;
  content: string;
  processed: boolean;
  ticketId: number | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type Ticket = {
  id: number;
  title: string;
  description: string;
  sender: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: number | null;
  categoryName?: string;
  assigneeId: number | null;
  assigneeName?: string;
  externalId: string | null;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type Category = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
};

export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  limit: number;
}>;

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type CreateTicketRequest = {
  title: string;
  description: string;
  messageId: number;
  priority?: TicketPriority;
  categoryId?: number;
  assigneeId?: number;
};

export type UpdateTicketRequest = {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: number;
  assigneeId?: number;
};
