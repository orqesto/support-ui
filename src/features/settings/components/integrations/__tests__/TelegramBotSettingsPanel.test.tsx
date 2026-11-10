import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type * as BotSettingsService from '@/features/settings/services/telegramBotSettings.service';

const get = vi.fn<(id: number) => Promise<BotSettingsService.TelegramBotSettingsResponse>>();
const save =
  vi.fn<(id: number, body: unknown) => Promise<BotSettingsService.TelegramBotSettingsResponse>>();
vi.mock('@/features/settings/services/telegramBotSettings.service', async (importOriginal) => ({
  ...(await importOriginal<typeof BotSettingsService>()),
  telegramBotSettingsService: {
    get: (id: number) => get(id),
    save: (id: number, body: unknown) => save(id, body),
  },
}));

import { TelegramBotSettingsPanel } from '../TelegramBotSettingsPanel';
import { botSettingsProblem } from '@/features/settings/services/telegramBotSettings.service';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const loaded = (): BotSettingsService.TelegramBotSettingsResponse => ({
  settings: {
    quietHours: null,
    commands: [
      { command: 'start', enabled: true, description: 'Start', replies: { en: 'Hi there' } },
      { command: 'faq', enabled: true, description: 'What I can do', replies: { en: 'Help' } },
    ],
  },
  consoleQuietHours: { value: 24, source: 'default', min: 1, max: 720 },
  maxCommands: 30,
});

const onShowAlert = vi.fn();
const panel = () =>
  render(
    <TelegramBotSettingsPanel
      integrationId={7}
      onClose={() => undefined}
      onShowAlert={onShowAlert}
    />
  );

beforeEach(() => {
  get.mockReset().mockResolvedValue(loaded());
  save.mockReset();
  onShowAlert.mockReset();
});

describe('TelegramBotSettingsPanel', () => {
  it('shows the console default as the quiet-hours hint and each command with its reply', async () => {
    panel();
    expect(await screen.findByPlaceholderText('Console default: 24')).toBeInTheDocument();
    expect(screen.getByText('/start')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hi there')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(7);
  });

  it('saves a switched-off command, a new reply language and quiet hours', async () => {
    save.mockImplementation((_id, body) =>
      Promise.resolve({
        ...loaded(),
        settings: body as BotSettingsService.TelegramBotSettingsResponse['settings'],
        menu: { updated: true, error: null },
      })
    );
    panel();
    await screen.findByText('/faq');
    fireEvent.click(screen.getByRole('switch', { name: '/faq on' }));
    fireEvent.change(screen.getAllByLabelText('New reply language')[0], {
      target: { value: 'DE' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Language/ })[0]);
    fireEvent.change(screen.getByLabelText('Reply in de'), { target: { value: 'Hallo' } });
    fireEvent.change(screen.getByLabelText('Answer again after quiet (hours)'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toEqual({
      quietHours: 6,
      commands: [
        {
          command: 'start',
          enabled: true,
          description: 'Start',
          replies: { en: 'Hi there', de: 'Hallo' },
        },
        { command: 'faq', enabled: false, description: 'What I can do', replies: { en: 'Help' } },
      ],
    });
    await waitFor(() =>
      expect(onShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    );
  });

  it('a menu Telegram refused is said, the save still counts', async () => {
    save.mockResolvedValue({ ...loaded(), menu: { updated: false, error: 'Unauthorized' } });
    panel();
    await screen.findByText('/start');
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls[0][0] as { variant: string; description: string };
    expect(alert.variant).toBe('warning');
    expect(alert.description).toContain('Unauthorized');
  });

  it('a new command with a bad name blocks Save and says why', async () => {
    panel();
    await screen.findByText('/start');
    fireEvent.click(screen.getByRole('button', { name: /Add command/ }));
    fireEvent.change(screen.getByLabelText('Command name'), { target: { value: 'Ship-It' } });
    expect(screen.getByRole('alert')).toHaveTextContent('use a-z, 0-9 and _ only');
    expect(screen.getByRole('button', { name: /Save/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('an API that does not know the endpoint yet shows an error, not a broken page', async () => {
    get.mockRejectedValue(new Error('404'));
    panel();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('botSettingsProblem', () => {
  const ok = {
    command: 'shipping',
    enabled: true,
    description: 'Shipping',
    replies: { en: 'Daily' },
  };
  it('accepts valid settings and names each problem (controls)', () => {
    expect(botSettingsProblem({ quietHours: null, commands: [ok] })).toBeNull();
    expect(botSettingsProblem({ quietHours: 0, commands: [] })).toContain('between 1 and 720');
    expect(botSettingsProblem({ quietHours: null, commands: [ok, ok] })).toContain('listed twice');
    expect(
      botSettingsProblem({ quietHours: null, commands: [{ ...ok, description: ' ' }] })
    ).toContain('needs a menu text');
    expect(
      botSettingsProblem({ quietHours: null, commands: [{ ...ok, replies: { eng: 'x' } }] })
    ).toContain('two-letter');
  });
});
