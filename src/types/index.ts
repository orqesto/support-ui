import type { GlobalRole, OrganizationRole, PermissionOverrides } from './roles';

export type Department = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  active: boolean;
  // Org-level fallback department: where messages land when no source/rule resolves one.
  // Exactly one per organization.
  isDefault: boolean;
};

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
  | 'filtered' // system: spam/noreply, hidden from inbox
  | 'needs_routing'; // system: routing engine found no winner; awaiting manual triage

export type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  role: GlobalRole; // Global role (admin, user)
  organizationRole?: OrganizationRole; // Role in current organization
  departmentIds?: number[]; // ALL department IDs the user belongs to in their current organization
  permissionOverrides?: PermissionOverrides; // Wave 5 B per-user overrides on top of org role
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
  // Jira-style human-readable ID (e.g. 'SUP-42'). Set once routing settles;
  // NULL during backfill window or for unstamped legacy rows. FE renders
  // publicId when present, falls back to #id. See planning/public-id-design.md.
  publicId?: string | null;
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
  departmentId?: number | null;
  nearMissDepts?: number[]; // Wave 5 C-1 / Wave 4 PR 9 — runner-up depts within threshold of winner
  priority?: TicketPriority | null;
  categoryId?: number | null;
  closedAt?: string | null;
  // "Parked" overlay (Pending). Nullable timestamp that coexists with the flow
  // state (awaiting/replied) — set when parked, cleared on client reply or any
  // other status change. When present, the FE shows the Pending badge regardless
  // of status. Parking does not pause SLA.
  parkedAt?: string | null;
  attachmentCount?: number;
  slaResponseMinutes?: number | null;
  slaResponseBreached?: boolean | null;
  firstResponseAt?: string | null;
  actualResponseSeconds?: number | null;
  lastReplyAt?: string | null;
  lastReplyFromClient?: boolean | null;
  // BE returns labels UNIONed from three sources (#16). `source` lets the FE
  // render an "inherited via contact" badge so agents understand why the
  // label is showing without having to look it up. Optional for back-compat
  // with older payloads that didn't include the field.
  labels?: { id: number; name: string; color: string; source?: 'conversation' | 'ticket' | 'contact' }[];
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

// NOTE: This is the app's tolerant "ticket in state" type — the loose superset
// that BOTH GET /api/tickets (TicketListItem) and GET /api/tickets/:id
// (TicketDetail) satisfy. Fields absent on one endpoint are optional here:
//   - `sender`: returned by BOTH endpoints (detail returns the full ticket row),
//     so it is required.
//   - `assigneeName`: computed only on the LIST endpoint, so optional here.
//   - `categoryName`/`assigneeName`/`metadata`: the BE sends `null`, not absent.
// For endpoint-precise shapes use `TicketListItem`/`TicketDetail` from '@/types/api'
// (generated from the backend zod contract).
export type Ticket = {
  id: number;
  title: string;
  description: string;
  sender: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: number | null;
  categoryName?: string | null;
  assigneeId: number | null;
  assigneeName?: string | null;
  departmentId?: number | null;
  externalId: string | null;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
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
  email: string;
  password: string;
  // Optional — present only when the caller bypasses the multi-step picker
  // (legacy / direct API consumers). The new FE flow leaves this out.
  organizationSlug?: string;
};

export type LoginResponse = {
  // Set when the user belongs to >1 active org and must pick one to continue.
  requiresOrgSelection?: boolean;
  organizations?: Array<{ id: number; name: string; slug: string }>;

  twoFactorRequired?: boolean;
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
