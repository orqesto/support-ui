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
  commands: TelegramBotCommand[];
};

export type ConsoleQuietHours = {
  value: number;
  source: 'db' | 'default';
  min: number;
  max: number;
};

export type TelegramBotSettingsResponse = {
  settings: TelegramBotSettings;
  consoleQuietHours: ConsoleQuietHours;
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
export const botSettingsProblem = (settings: TelegramBotSettings, max = 30): string | null => {
  // Whole hours only: the API refuses 1.5 (release audit of 1.1.326, item 6).
  if (
    settings.quietHours !== null &&
    (!Number.isInteger(settings.quietHours) || settings.quietHours < 1 || settings.quietHours > 720)
  ) {
    return 'Quiet hours must be a whole number from 1 to 720, or empty for the console default.';
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
