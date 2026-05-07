import type { GlobalRole, OrganizationRole } from './roles';

export type ChannelType = 'email' | 'telegram' | 'slack' | 'chat' | 'other';
export type TicketStatus = 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type MessageStatus = 'new' | 'in_progress' | 'pending' | 'awaiting_response' | 'client_replied' | 'resolved' | 'closed' | 'filtered';

export type DepartmentRole = 'support' | 'sales' | 'billing' | 'general' | 'hr';

export type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  role: GlobalRole; // Global role (admin, user)
  organizationRole?: OrganizationRole; // Role in current organization
  departmentRoles?: DepartmentRole[]; // ALL departments/functions within organization (can have multiple!)
  organizationId?: number; // Current organization ID
  // Optional contact methods
  telegram?: string | null; // Telegram username (e.g., @username)
  slack?: string | null; // Slack username or user ID
  phone?: string | null; // Phone number
  signature?: string | null; // Personal email signature
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
  threadId?: string | null;
  processingError?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
  rawData?: Record<string, unknown>;
  // AI model tracking
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  analysisProvider?: string | null;
  analysisModel?: string | null;
  // Threading
  parentMessageId?: number | null;
  // Direct reply tracking
  isOutgoing?: boolean;
  directReply?: string | null;
  repliedBy?: number | null;
  repliedAt?: string | null;
  resolved?: boolean;
  awaitingCustomerResponse?: boolean;
  // Lead tracking
  isLead?: boolean;
  // Attachment tracking
  attachmentCount?: number;
  // Assignment tracking
  assigneeId?: number | null;
  assigneeName?: string;
  assignedAt?: string | null;
  // Ticket parity fields
  status?: MessageStatus;
  priority?: TicketPriority;
  categoryId?: number | null;
  closedAt?: string | null;
  needsHumanReview?: boolean;
  labels?: { id: number; name: string; color: string }[];
  // SLA tracking
  slaResponseMinutes?: number | null;
  slaResponseBreached?: boolean | null;
  firstResponseAt?: string | null;
  actualResponseSeconds?: number | null;
  // Thread reply state
  lastReplyAt?: string | null;
  lastReplyFromClient?: boolean | null;
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
  labels?: { id: number; name: string; color: string }[];
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

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  limit: number;
}>;

export type LoginRequest = {
  organizationSlug: string;
  email: string;
  password: string;
};

export type LoginResponse = {
  twoFactorRequired: boolean;
  token?: string;
  user?: User;
  tempToken?: string;
};

export type CreateTicketRequest = {
  title: string;
  description: string;
  messageId: number;
  priority?: TicketPriority;
  categoryId?: number;
  assigneeId?: number;
  syncToJira?: boolean;
};

export type UpdateTicketRequest = {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: number;
  assigneeId?: number;
};
