import { apiClient } from '@/lib/api-client';

/**
 * A Telegram connection's bot settings (support-service #1485): its menu commands with a reply
 * per language, and the quiet hours after which the bot answers a chat it handed to a person.
 * Shapes mirror `src/modules/inbox/ingestion/telegram/telegramBotSettings.ts`.
 */
export type TelegramBotCommand = {
  command: string;
  enabled: boolean;
  /** The line beside the command in the bot's menu. */
  description: string;
  /** Reply per language code (`en`, `ru` …). */
  replies: Record<string, string>;
};

export type TelegramBotSettings = {
  /** null = the console default. */
  quietHours: number | null;
  /**
   * Flood limit: messages that may wait in one chat before its next ones are saved for a person
   * with no bot answer. null = the console default; absent = a backend without the setting (then
   * it is not sent either, the backend keeps what it stored).
   */
  floodWaitingLimit?: number | null;
  /** Hang limit (seconds) of a started bot turn. null = console default; absent as above. */
  turnHangSeconds?: number | null;
  commands: TelegramBotCommand[];
};

export type ConsoleQuietHours = {
  value: number;
  source: 'db' | 'default';
  min: number;
  max: number;
};

/** The console values the per-bot flood and hang limits fall back to (same shape as quiet hours). */
export type ConsoleTurnLimits = {
  telegramFloodWaitingLimit: ConsoleQuietHours;
  telegramTurnHangSeconds: ConsoleQuietHours;
};

/** Fallback bounds for the per-bot limits, used only when the backend sends none. */
export const FLOOD_WAITING_BOUNDS = { min: 2, max: 100 } as const;
export const TURN_HANG_BOUNDS = { min: 60, max: 600 } as const;

type Bounds = { min: number; max: number };

/** The bounds the backend sent with its console values (one source), else the fallback. */
export const turnLimitBounds = (
  consoleLimits: ConsoleTurnLimits | null | undefined
): { flood: Bounds; hang: Bounds } => ({
  flood: consoleLimits?.telegramFloodWaitingLimit ?? FLOOD_WAITING_BOUNDS,
  hang: consoleLimits?.telegramTurnHangSeconds ?? TURN_HANG_BOUNDS,
});

export type TelegramBotSettingsResponse = {
  settings: TelegramBotSettings;
  consoleQuietHours: ConsoleQuietHours;
  /** Absent on a backend without the flood / hang limits. */
  consoleTurnLimits?: ConsoleTurnLimits;
  builtInCommands?: string[];
  maxCommands?: number;
  /** After a save: whether the bot's menu was set in Telegram. */
  menu?: { updated: boolean; error: string | null };
};

const path = (integrationId: number) => `/api/integrations/telegram/${integrationId}/bot-settings`;

export const telegramBotSettingsService = {
  get: async (integrationId: number) =>
    (
      await apiClient.get<{ success: boolean; data: TelegramBotSettingsResponse }>(
        path(integrationId)
      )
    ).data.data,
  save: async (integrationId: number, settings: TelegramBotSettings) =>
    (
      await apiClient.put<{ success: boolean; data: TelegramBotSettingsResponse }>(
        path(integrationId),
        settings
      )
    ).data.data,
};

export const BUILT_IN_COMMANDS = ['start', 'faq', 'newrequest', 'cancel'];
export const COMMAND_NAME = /^[a-z0-9_]{1,32}$/;
export const LANGUAGE_CODE = /^[a-z]{2}$/;

/** What is wrong with the settings before they are sent, or null. Mirrors the backend's checks. */
export const botSettingsProblem = (
  settings: TelegramBotSettings,
  max = 30,
  bounds: { flood: Bounds; hang: Bounds } = turnLimitBounds(null)
): string | null => {
  // Whole hours only: the API refuses 1.5 (release audit of 1.1.326, item 6).
  if (
    settings.quietHours !== null &&
    (!Number.isInteger(settings.quietHours) || settings.quietHours < 1 || settings.quietHours > 720)
  ) {
    return 'Quiet hours must be a whole number from 1 to 720, or empty for the console default.';
  }
  const outside = (value: number | null | undefined, bounds: { min: number; max: number }) =>
    value !== null &&
    value !== undefined &&
    (!Number.isInteger(value) || value < bounds.min || value > bounds.max);
  if (outside(settings.floodWaitingLimit, bounds.flood)) {
    return `Flood limit must be a whole number from ${bounds.flood.min} to ${bounds.flood.max}, or empty for the console default.`;
  }
  if (outside(settings.turnHangSeconds, bounds.hang)) {
    return `Hang limit must be a whole number from ${bounds.hang.min} to ${bounds.hang.max} seconds, or empty for the console default.`;
  }
  if (settings.commands.length > max) return `At most ${max} commands.`;
  const seen = new Set<string>();
  for (const entry of settings.commands) {
    if (!COMMAND_NAME.test(entry.command)) {
      return `/${entry.command || '…'}: use a-z, 0-9 and _ only (1-32 characters).`;
    }
    if (seen.has(entry.command)) return `/${entry.command} is listed twice.`;
    seen.add(entry.command);
    if (!entry.description.trim()) return `/${entry.command} needs a menu text.`;
    // A custom command that is on shows in the menu; with no reply a customer tapping it gets
    // nothing. Built-ins answer with their own text. The API refuses it too.
    if (
      entry.enabled &&
      !BUILT_IN_COMMANDS.includes(entry.command) &&
      !Object.values(entry.replies).some((reply) => reply.trim() !== '')
    ) {
      return `/${entry.command} is on but has no reply — write one, or switch it off.`;
    }
    for (const code of Object.keys(entry.replies)) {
      if (!LANGUAGE_CODE.test(code))
        return `/${entry.command}: "${code}" is not a two-letter language code.`;
    }
  }
  return null;
};
