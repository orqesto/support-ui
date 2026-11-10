import { describe, expect, it } from 'vitest';
import { telegramStartNotice, type TelegramBotView } from '../telegramStartNotice';

const bot = (overrides: Partial<TelegramBotView>): TelegramBotView => ({
  integrationId: 1,
  name: 'Shop bot',
  state: 'running',
  problem: null,
  message: null,
  detail: null,
  retryAt: null,
  since: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('telegramStartNotice', () => {
  it('a bot that is down is shown with why and what to do, for either button', () => {
    const report = {
      statusKnown: true,
      activeBots: 1,
      message: '1 of 2 Telegram bot(s) running.',
      bots: [
        bot({ integrationId: 1 }),
        bot({
          integrationId: 2,
          name: 'Support bot',
          state: 'failed',
          problem: 'invalid_token',
          message: 'Telegram rejected the bot token (revoked or wrong).',
          detail: '401: Unauthorized',
        }),
      ],
    };
    for (const pressed of ['telegram', 'all'] as const) {
      const notice = telegramStartNotice(report, pressed);
      expect(notice?.variant).toBe('warning');
      expect(notice?.title).toBe('A Telegram bot is not running');
      expect(notice?.description).toContain('1 of 2 running.');
      expect(notice?.description).toContain(
        'Support bot (not running): Telegram rejected the bot token'
      );
      expect(notice?.description).toContain('Telegram said: "401: Unauthorized"');
    }
  });

  it('a retrying bot says so', () => {
    const notice = telegramStartNotice(
      {
        statusKnown: true,
        activeBots: 0,
        message: '',
        bots: [bot({ state: 'retrying', problem: 'conflict', message: 'Another program…' })],
      },
      'all'
    );
    expect(notice?.description).toContain('Shop bot (retrying): Another program…');
  });

  it('unknown status is a warning, never "no bots"', () => {
    const notice = telegramStartNotice(
      { statusKnown: false, activeBots: 0, bots: [], message: 'could not be read' },
      'all'
    );
    expect(notice).toEqual({
      title: 'Telegram bot status unknown',
      description: 'could not be read',
      variant: 'warning',
    });
  });

  it('all running: confirmed for the Telegram button, quiet for Start all (control)', () => {
    const report = {
      statusKnown: true,
      activeBots: 1,
      bots: [bot({})],
      message: '1 Telegram bot(s) running.',
    };
    expect(telegramStartNotice(report, 'telegram')).toMatchObject({ variant: 'success' });
    expect(telegramStartNotice(report, 'all')).toBeNull();
  });

  it('an API without the report (older backend) shows nothing', () => {
    expect(telegramStartNotice(undefined, 'telegram')).toBeNull();
  });
});
