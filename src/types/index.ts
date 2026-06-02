import type { GlobalRole, OrganizationRole } from './roles';

export type ChannelType = 'email' | 'telegram' | 'slack' | 'chat' | 'other';
export const MESSAGE_SOURCE_TYPES = ['email', 'gmail', 'telegram', 'slack', 'chat'] as const;
export type MessageSourceType = (typeof MESSAGE_SOURCE_TYPES)[number];
export type TicketStatus = 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type ThreadStatus =
  | 'open' // user-settable: unprocessed (DB: 'new')
  | 'in_progress' // user-settable: agent working
  | 'pending' // user-settable: awaiting more info
  | 'resolved' // user-settable: resolved with KB capture
  | 'closed' // user-settable: done, no KB capture
  | 'filtered'; // system: spam/noreply, hidden from inbox

export type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  role: GlobalRole; // Global role (admin, user)
  organizationRole?: OrganizationRole; // Role in current organization
  departmentIds?: number[]; // ALL department IDs the user belongs to in their current organization
  organizationId?: number; // Current organization ID
  organizationSlug?: string; // Slug of the current organization (present in login response)
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
  subject: string | null;
  status: ThreadStatus;
  needsHumanReview: boolean;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown> | null;
  externalThreadId?: string | null;
  isLead?: boolean;
  assigneeId?: number | null;
  assigneeName?: string | null;
  assignedAt?: string | null;
  priority?: TicketPriority | null;
  categoryId?: number | null;
  closedAt?: string | null;
  attachmentCount?: number;
  slaResponseMinutes?: number | null;
  slaResponseBreached?: boolean | null;
  firstResponseAt?: string | null;
  actualResponseSeconds?: number | null;
  lastReplyAt?: string | null;
  lastReplyFromClient?: boolean | null;
  labels?: { id: number; name: string; color: string }[];
  botHandled?: boolean;
  // sparse: only present on spam_log fake entries
  content?: string | null;
};

export type MessageEvent = {
  id: number;
  conversationId: number;
  type: string;
  content: string;
  channel: ChannelType;
  authorId?: number | null;
  authorEmail?: string | null;
  parentEventId?: number | null;
  processingError?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown> | null;
  assigneeName?: string | null;
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
  twoFactorSetupRequired?: boolean;
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
