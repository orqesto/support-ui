import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * Workspace Slack notifications (Settings › Notifications › Slack). Workspace admins and global
 * admins only — the backend's `requireOrgAdmin` is the authority.
 *
 * Shapes mirror support-service `src/routes/notificationsRoutes.ts` (`/api/notifications/slack*`)
 * and `src/modules/notifications/services/slackConnectionService.ts`.
 */

export type SlackRouteChannel = 'team' | 'admin';

/**
 * Copied from support-service `src/modules/notifications/services/slackKinds.ts` (TEAM_KINDS,
 * ADMIN_KINDS, DEFAULT_TEAM_ON, DEFAULT_ADMIN_ON). The backend refuses a kind that is not on the
 * channel's own list, so keep these in step with that file.
 */
export const TEAM_KINDS = [
  'new_unassigned_message',
  'customer_message_on_assigned',
  'conversation_reopened',
  'sla_message_breach',
  'sla_ticket_first_response',
  'sla_ticket_resolution',
  'hold_recheck_due',
  'conversation_assigned',
] as const;

export const DEFAULT_TEAM_ON: readonly string[] = [
  'new_unassigned_message',
  'customer_message_on_assigned',
  'conversation_reopened',
  'sla_message_breach',
  'sla_ticket_first_response',
  'sla_ticket_resolution',
];

export const ADMIN_KINDS = [
  'ingestion_dark',
  'ingestion_gap',
  'customer_reply_in_spam',
  'ai_provider_down',
  'ai_token_limit_reached',
  'mailbox_address_undeclared',
  'one_sided_outbound',
  'suspicious_arrival',
  'spam_arrival',
  'kb_review_pending',
  'kb_consolidation_pending',
  'kb_document_stale',
] as const;

export const DEFAULT_ADMIN_ON: readonly string[] = [
  'ingestion_dark',
  'ingestion_gap',
  'customer_reply_in_spam',
  'ai_provider_down',
  'ai_token_limit_reached',
  'mailbox_address_undeclared',
  'one_sided_outbound',
];

export const kindsForChannel = (channel: SlackRouteChannel): readonly string[] =>
  channel === 'team' ? TEAM_KINDS : ADMIN_KINDS;

export const defaultKindsForChannel = (channel: SlackRouteChannel): readonly string[] =>
  channel === 'team' ? DEFAULT_TEAM_ON : DEFAULT_ADMIN_ON;

/** The bot scopes the "Add to Slack" link asks for (connect-url); a pasted token needs the same. */
export const SLACK_BOT_SCOPES = ['chat:write', 'chat:write.public', 'channels:read', 'groups:read'];

export type SlackConnection = {
  teamName: string;
  status: 'connected' | 'broken';
  /** The Slack error code that broke it (`token_revoked`, `invalid_auth`, …). */
  brokenReason: string | null;
};

export type SlackRoute = {
  channel: SlackRouteChannel;
  slackChannelId: string;
  slackChannelName: string;
  enabledKinds: string[];
  includePreview: boolean;
  departmentFilter: { excludedDepartmentIds: number[] } | null;
  updatedAt: string;
};

export type SlackStatus = { connection: SlackConnection | null; routes: SlackRoute[] };

export type SlackChannelInfo = { id: string; name: string; isPrivate: boolean; isMember: boolean };

/** At most 2,000 channels; `truncated` says Slack had more (a bound must report that it bit). */
export type SlackChannelList = { channels: SlackChannelInfo[]; truncated: boolean };

export type SlackRouteInput = {
  slackChannelId: string;
  slackChannelName?: string;
  enabledKinds: string[];
  includePreview: boolean;
  /** Team channel only; the admin channel must send null. */
  departmentFilter: { excludedDepartmentIds: number[] } | null;
};

export type SlackTestResult = { ok: true } | { ok: false; code: string; hint?: string };

const BASE = '/api/notifications/slack';

export const slackNotificationsService = {
  async getStatus(): Promise<SlackStatus> {
    const res = await apiClient.get<ApiResponse<SlackStatus>>(BASE);
    return res.data.data ?? { connection: null, routes: [] };
  },

  /** The Slack authorize URL; the browser goes there and Slack sends it back to this page. */
  async getConnectUrl(): Promise<string> {
    const res = await apiClient.get<ApiResponse<{ url: string }>>(`${BASE}/connect-url`);
    return res.data.data?.url ?? '';
  },

  /** Self-hosted fallback: a bot token (xoxb-…) from the admin's own Slack app. */
  async connectWithToken(botToken: string): Promise<SlackConnection | null> {
    const res = await apiClient.post<ApiResponse<{ connection: SlackConnection }>>(
      `${BASE}/token`,
      {
        botToken,
      }
    );
    return res.data.data?.connection ?? null;
  },

  async listChannels(): Promise<SlackChannelList> {
    const res = await apiClient.get<ApiResponse<SlackChannelList>>(`${BASE}/channels`);
    return res.data.data ?? { channels: [], truncated: false };
  },

  async saveRoute(channel: SlackRouteChannel, body: SlackRouteInput): Promise<SlackRoute | null> {
    const res = await apiClient.put<ApiResponse<{ route: SlackRoute }>>(
      `${BASE}/routes/${channel}`,
      body
    );
    return res.data.data?.route ?? null;
  },

  async sendTest(channel: SlackRouteChannel): Promise<SlackTestResult> {
    const res = await apiClient.post<ApiResponse<SlackTestResult>>(`${BASE}/test/${channel}`);
    return res.data.data ?? { ok: false, code: 'unknown' };
  },

  async disconnect(): Promise<void> {
    await apiClient.delete(BASE);
  },
};
