/**
 * What the dashboard says after "Start" about the workspace's Telegram bots (Black Friday freeze,
 * owner 2026-11-10). The API reports each bot's state (support-service #1483); before, a bot that
 * failed to start showed nothing at all, or "started" while it received nothing.
 */
export type TelegramBotView = {
  integrationId: number;
  name: string;
  state: 'running' | 'retrying' | 'failed';
  problem: 'invalid_token' | 'conflict' | 'network' | 'other' | null;
  /** What to do, in the operator's words; null while running. */
  message: string | null;
  /** Telegram's own words. */
  detail: string | null;
  retryAt: string | null;
  since: string;
};

export type TelegramStartReport = {
  statusKnown: boolean;
  activeBots: number;
  bots: TelegramBotView[];
  message: string;
};

export type TelegramStartNotice = {
  title: string;
  description: string;
  variant: 'success' | 'warning' | 'info';
};

const botLine = (bot: TelegramBotView): string => {
  const state = bot.state === 'retrying' ? 'retrying' : 'not running';
  const retry =
    bot.state === 'retrying' && bot.retryAt
      ? ` Next try at ${new Date(bot.retryAt).toLocaleTimeString()}.`
      : '';
  const said = bot.detail ? ` Telegram said: "${bot.detail}"` : '';
  return `${bot.name} (${state}): ${bot.message ?? ''}${retry}${said}`;
};

/**
 * The dialog to show, or null for none. A bot that is down is always shown; an all-good start is
 * shown only for the Telegram button itself ("Start all" has its own feedback).
 */
export const telegramStartNotice = (
  report: TelegramStartReport | undefined,
  pressed: 'telegram' | 'all'
): TelegramStartNotice | null => {
  if (!report) return null;
  if (!report.statusKnown) {
    return {
      title: 'Telegram bot status unknown',
      description: report.message,
      variant: 'warning',
    };
  }
  const down = report.bots.filter((bot) => bot.state !== 'running');
  if (down.length > 0) {
    const running =
      report.activeBots > 0 ? `${report.activeBots} of ${report.bots.length} running. ` : '';
    return {
      title: down.length === 1 ? 'A Telegram bot is not running' : 'Telegram bots are not running',
      description: `${running}${down.map(botLine).join('\n')}`,
      variant: 'warning',
    };
  }
  if (pressed !== 'telegram') return null;
  return {
    title: report.bots.length > 0 ? 'Telegram bot running' : 'No Telegram bot running',
    description: report.message,
    variant: report.bots.length > 0 ? 'success' : 'info',
  };
};
