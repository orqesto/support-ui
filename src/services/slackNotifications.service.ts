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
  /**
   * Ruling S (GET /slack only; absent on an older backend and on the PUT answer): `broken` while
   * Slack refuses posts to this channel. Saving the route or a test post Slack accepts clears it.
   */
  status?: 'ok' | 'broken';
  /** The Slack code (`not_in_channel`, `channel_not_found`, `is_archived`, …) when broken. */
  brokenReason?: string | null;
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

// ─── Platform alert channel (Admin console › Platform › Alerts, global admins only) ───────────
//
// Shapes mirror support-service `src/routes/adminRoutes.ts` (`/api/admin/platform/alerts/slack*`),
// `slackConnectionService.ts` (getPlatformSlack, updatePlatformSlackSettings) and
// `src/shared/platformSettings/platformSlackAlertsSetting.ts` (signals, thresholds, defaults).

/** Copied from `platformSlackAlertsSetting.ts` (PLATFORM_SLACK_SIGNALS); every one is on by default. */
export const PLATFORM_SLACK_SIGNALS = [
  'cpu',
  'memory',
  'db_pool',
  'db_health',
  'event_loop',
  'rate_429',
  'queue_stall',
  'queue_backlog',
  'disk',
  'platform_ai_key',
  'process_start',
] as const;
export type PlatformSlackSignal = (typeof PLATFORM_SLACK_SIGNALS)[number];

export type PlatformSlackThresholds = {
  cpu: { percent: number; sustainedMinutes: number };
  memory: { percentOfBudget: number; sustainedMinutes: number };
  dbPool: { warnPercent: number; critPercent: number };
  dbHealth: { unreachableMinutes: number; p95Ms: number; p95SustainedMinutes: number };
  eventLoop: { warnMs: number; critMs: number };
  rate429: { warnPerWindow: number; critPerWindow: number };
  disk: { percent: number };
  queueBacklog: { waiting: number; sustainedMinutes: number };
  quietMinutes: number;
};

/** The backend schema's defaults (the design's "Platform admin channel" table). */
export const DEFAULT_PLATFORM_THRESHOLDS: PlatformSlackThresholds = {
  cpu: { percent: 85, sustainedMinutes: 5 },
  memory: { percentOfBudget: 90, sustainedMinutes: 2 },
  dbPool: { warnPercent: 80, critPercent: 90 },
  dbHealth: { unreachableMinutes: 1, p95Ms: 2000, p95SustainedMinutes: 5 },
  eventLoop: { warnMs: 100, critMs: 500 },
  rate429: { warnPerWindow: 50, critPerWindow: 200 },
  disk: { percent: 85 },
  queueBacklog: { waiting: 1000, sustainedMinutes: 10 },
  quietMinutes: 60,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every threshold, with the default for anything missing or not a number. The settings PUT
 * replaces the stored thresholds wholesale, so the page always works on (and sends) a full object.
 */
export const fillPlatformThresholds = (raw: unknown): PlatformSlackThresholds => {
  const source = isRecord(raw) ? raw : {};
  const group = <K extends Exclude<keyof PlatformSlackThresholds, 'quietMinutes'>>(key: K) => {
    const defaults = DEFAULT_PLATFORM_THRESHOLDS[key];
    const raw = source[key];
    const given = isRecord(raw) ? raw : {};
    return Object.fromEntries(
      Object.entries(defaults).map(([field, fallback]) => {
        const value = given[field];
        return [field, typeof value === 'number' && Number.isFinite(value) ? value : fallback];
      })
    ) as PlatformSlackThresholds[K];
  };
  const quiet = source.quietMinutes;
  return {
    cpu: group('cpu'),
    memory: group('memory'),
    dbPool: group('dbPool'),
    dbHealth: group('dbHealth'),
    eventLoop: group('eventLoop'),
    rate429: group('rate429'),
    disk: group('disk'),
    queueBacklog: group('queueBacklog'),
    quietMinutes:
      typeof quiet === 'number' && Number.isFinite(quiet)
        ? quiet
        : DEFAULT_PLATFORM_THRESHOLDS.quietMinutes,
  };
};

export type PlatformSlackConnection = {
  teamName: string | null;
  status: 'connected';
  /** `env`: SLACK_PLATFORM_BOT_TOKEN in the server's environment; Disconnect cannot remove it. */
  source: 'db' | 'env' | 'none';
};

export type PlatformSlackSettings = {
  teamName?: string;
  slackChannelId?: string;
  slackChannelName?: string;
  enabledSignals: PlatformSlackSignal[];
  thresholds: PlatformSlackThresholds;
};

export type PlatformSlackStatus = {
  connection: PlatformSlackConnection | null;
  settings: PlatformSlackSettings;
};

export type PlatformSlackSettingsInput = {
  slackChannelId?: string;
  slackChannelName?: string;
  enabledSignals?: PlatformSlackSignal[];
  /** Always the full object: the backend replaces the stored thresholds with it. */
  thresholds?: PlatformSlackThresholds;
};

const normalizePlatformStatus = (raw: unknown): PlatformSlackStatus => {
  const source = isRecord(raw) ? raw : {};
  const settings = isRecord(source.settings) ? source.settings : {};
  const signals = Array.isArray(settings.enabledSignals)
    ? PLATFORM_SLACK_SIGNALS.filter((signal) =>
        (settings.enabledSignals as unknown[]).includes(signal)
      )
    : [...PLATFORM_SLACK_SIGNALS];
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  return {
    connection: isRecord(source.connection) ? (source.connection as PlatformSlackConnection) : null,
    settings: {
      teamName: text(settings.teamName),
      slackChannelId: text(settings.slackChannelId),
      slackChannelName: text(settings.slackChannelName),
      enabledSignals: signals,
      thresholds: fillPlatformThresholds(settings.thresholds),
    },
  };
};

const PLATFORM_BASE = '/api/admin/platform/alerts/slack';

export const platformSlackAlertsService = {
  async getStatus(): Promise<PlatformSlackStatus> {
    const res = await apiClient.get<ApiResponse<unknown>>(PLATFORM_BASE);
    return normalizePlatformStatus(res.data.data);
  },

  async getConnectUrl(): Promise<string> {
    const res = await apiClient.get<ApiResponse<{ url: string }>>(`${PLATFORM_BASE}/connect-url`);
    return res.data.data?.url ?? '';
  },

  async connectWithToken(botToken: string): Promise<PlatformSlackStatus> {
    const res = await apiClient.post<ApiResponse<unknown>>(`${PLATFORM_BASE}/token`, { botToken });
    return normalizePlatformStatus(res.data.data);
  },

  async listChannels(): Promise<SlackChannelList> {
    const res = await apiClient.get<ApiResponse<SlackChannelList>>(`${PLATFORM_BASE}/channels`);
    return res.data.data ?? { channels: [], truncated: false };
  },

  /** Each given field replaces the stored one; returns the whole status as now stored. */
  async saveSettings(body: PlatformSlackSettingsInput): Promise<PlatformSlackStatus> {
    const res = await apiClient.put<ApiResponse<unknown>>(`${PLATFORM_BASE}/settings`, body);
    return normalizePlatformStatus(res.data.data);
  },

  async sendTest(): Promise<SlackTestResult> {
    const res = await apiClient.post<ApiResponse<SlackTestResult>>(`${PLATFORM_BASE}/test`);
    return res.data.data ?? { ok: false, code: 'unknown' };
  },

  async disconnect(): Promise<void> {
    await apiClient.delete(PLATFORM_BASE);
  },
};
