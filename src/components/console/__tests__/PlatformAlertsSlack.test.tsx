/**
 * Admin console › Platform › Alerts. Pins what a global admin must be able to do: see the default
 * thresholds (with units) when none are stored and save them as one FULL object (the backend
 * replaces the stored thresholds wholesale), enter the Slack app credentials without ever seeing
 * a stored value back (only its last four characters), and that nobody else sees the page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { chooseOption } from '@/test/chooseOption';
import {
  platformSlackAlertsService,
  PLATFORM_SLACK_SIGNALS,
  DEFAULT_PLATFORM_THRESHOLDS,
  type PlatformSlackStatus,
} from '@/services/slackNotifications.service';
import {
  platformSettingsService,
  type PlatformSettings,
  type SecretStatus,
} from '@/services/platformSettings.service';

type MockUser = { id: number; role: string; organizationRole?: string } | null;
let mockUser: MockUser = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: MockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  failure: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

const { PlatformAlertsSlack } = await import('@/components/console/PlatformAlertsSlack');
const { PLATFORM_SECTIONS } = await import('@/components/console/consoleSections');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

/** Only `secrets` is read by this page; the rest of the platform settings is irrelevant here. */
const settingsWith = (secrets: Partial<Record<string, SecretStatus>>) =>
  ({
    secrets: {
      'slack.client_id': UNSET,
      'slack.client_secret': UNSET,
      'slack.platform_bot_token': UNSET,
      ...secrets,
    },
  }) as unknown as PlatformSettings;

const connected = (over: Partial<PlatformSlackStatus['settings']> = {}): PlatformSlackStatus => ({
  connection: { teamName: 'Odly Ops', status: 'connected', source: 'db' },
  settings: {
    teamName: 'Odly Ops',
    slackChannelId: 'C1',
    slackChannelName: 'platform-alerts',
    enabledSignals: [...PLATFORM_SLACK_SIGNALS],
    thresholds: DEFAULT_PLATFORM_THRESHOLDS,
    ...over,
  },
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/console/platform/alerts']} future={ROUTER_FUTURE}>
        <PlatformAlertsSlack />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  Object.values(toastMock).forEach((fn) => fn.mockReset());
  mockUser = { id: 1, role: 'admin' };
  vi.spyOn(platformSlackAlertsService, 'listChannels').mockResolvedValue({
    channels: [{ id: 'C1', name: 'platform-alerts', isPrivate: false, isMember: true }],
    truncated: false,
  });
  vi.spyOn(platformSettingsService, 'get').mockResolvedValue(settingsWith({}));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlatformAlertsSlack', () => {
  it('thresholds form saves and shows defaults when unset', async () => {
    // A stored row with no thresholds at all: every field must still show the design default.
    const stored = connected();
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue({
      ...stored,
      settings: { ...stored.settings, thresholds: {} as never },
    });
    const save = vi
      .spyOn(platformSlackAlertsService, 'saveSettings')
      .mockImplementation((body) =>
        Promise.resolve(connected({ thresholds: body.thresholds ?? DEFAULT_PLATFORM_THRESHOLDS }))
      );
    renderPage();

    const cpu = await screen.findByLabelText(/^CPU above \(%\)$/i);
    expect(cpu).toHaveValue(85);
    expect(screen.getByLabelText(/^CPU for at least \(minutes\)$/i)).toHaveValue(5);
    expect(screen.getByLabelText(/^Memory above \(% of budget\)$/i)).toHaveValue(90);
    expect(screen.getByLabelText(/^Disk usage above \(%\)$/i)).toHaveValue(85);
    expect(screen.getByLabelText(/^Event-loop lag critical \(ms\)$/i)).toHaveValue(500);
    expect(screen.getByLabelText(/^Health query p95 above \(ms\)$/i)).toHaveValue(2000);
    expect(screen.getByLabelText(/^Repeat a still-open alert after \(minutes\)$/i)).toHaveValue(60);

    fireEvent.change(cpu, { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    // Ruling I: the PUT replaces stored thresholds wholesale, so every field goes, defaults filled.
    expect(save).toHaveBeenCalledWith({
      thresholds: {
        ...DEFAULT_PLATFORM_THRESHOLDS,
        cpu: { percent: 70, sustainedMinutes: 5 },
      },
    });
    // The screen shows what the server returned.
    await waitFor(() => expect(screen.getByLabelText(/^CPU above \(%\)$/i)).toHaveValue(70));
  });

  it('refuses an out-of-range threshold without saving', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
    const save = vi.spyOn(platformSlackAlertsService, 'saveSettings');
    renderPage();
    const disk = await screen.findByLabelText(/^Disk usage above \(%\)$/i);
    fireEvent.change(disk, { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
    expect(await screen.findByText(/between 1 and 100/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('a failed thresholds save re-reads the server instead of keeping the edit', async () => {
    const getStatus = vi
      .spyOn(platformSlackAlertsService, 'getStatus')
      .mockResolvedValue(connected());
    vi.spyOn(platformSlackAlertsService, 'saveSettings').mockRejectedValue(new Error('boom'));
    renderPage();
    const cpu = await screen.findByLabelText(/^CPU above \(%\)$/i);
    fireEvent.change(cpu, { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
    await waitFor(() => expect(toastMock.failure).toHaveBeenCalled());
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText(/^CPU above \(%\)$/i)).toHaveValue(85));
  });

  it('switching a signal saves the whole signal list from the server answer', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
    const save = vi
      .spyOn(platformSlackAlertsService, 'saveSettings')
      .mockImplementation((body) =>
        Promise.resolve(connected({ enabledSignals: body.enabledSignals }))
      );
    renderPage();
    const disk = await screen.findByRole('switch', { name: /^disk usage$/i });
    fireEvent.click(disk);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      enabledSignals: PLATFORM_SLACK_SIGNALS.filter((signal) => signal !== 'disk'),
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /^disk usage$/i })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    );
  });

  it('client secret is never displayed, only last4', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue({
      connection: null,
      settings: connected().settings,
    });
    const secretValue = 'f00dfeedc0ffee1234abcd';
    const setSecret = vi.spyOn(platformSettingsService, 'setSecret').mockResolvedValue({
      configured: true,
      source: 'db',
      last4: 'abcd',
      verification: { checked: false, ok: false },
    });
    const get = vi.spyOn(platformSettingsService, 'get');
    get
      .mockResolvedValueOnce(settingsWith({}))
      .mockResolvedValue(
        settingsWith({ 'slack.client_secret': { configured: true, source: 'db', last4: 'abcd' } })
      );
    const { container } = renderPage();

    const field = await screen.findByLabelText(/^client secret$/i, { selector: 'input' });
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(field, { target: { value: secretValue } });
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i });
    fireEvent.click(saveButtons[1]);

    await waitFor(() =>
      expect(setSecret).toHaveBeenCalledWith('slack.client_secret', secretValue, {
        force: undefined,
      })
    );
    expect(await screen.findByText(/····abcd/)).toBeInTheDocument();
    // The value itself is nowhere: not in the input, not in the page text.
    expect(screen.getByLabelText(/^client secret$/i, { selector: 'input' })).toHaveValue('');
    expect(container.innerHTML).not.toContain(secretValue);
  });

  it('hidden for non-global-admins', () => {
    mockUser = { id: 2, role: 'user', organizationRole: 'org_admin' };
    const getStatus = vi.spyOn(platformSlackAlertsService, 'getStatus');
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
    expect(getStatus).not.toHaveBeenCalled();

    const section = PLATFORM_SECTIONS.find((each) => each.id === 'alerts');
    expect(section?.path).toBe('alerts');
    const ctx = { scope: 'platform' as const, allianceId: null, selfHostedDeployment: false };
    expect(section?.visible?.({ ...ctx, isGlobalAdmin: false })).toBe(false);
    expect(section?.visible?.({ ...ctx, isGlobalAdmin: true })).toBe(true);
  });

  describe('a broken platform connection (Ruling S)', () => {
    const broken = (reason: string): PlatformSlackStatus => {
      const base = connected();
      return {
        ...base,
        connection: { teamName: 'Odly Ops', status: 'broken', brokenReason: reason, source: 'db' },
      };
    };

    it('a dead token reads "Disconnected — <reason>" with Reconnect; the channel controls wait', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(broken('token_revoked'));
      const listChannels = vi.spyOn(platformSlackAlertsService, 'listChannels');
      renderPage();
      expect(await screen.findByText(/^Disconnected —/)).toHaveTextContent(
        'Disconnected — the Slack app was removed from your Slack workspace, reconnect'
      );
      expect(screen.getByRole('button', { name: /^reconnect$/i })).toBeInTheDocument();
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
      // A dead token cannot list channels or post a test.
      expect(screen.queryByRole('button', { name: /send test message/i })).not.toBeInTheDocument();
      expect(listChannels).not.toHaveBeenCalled();
    });

    it('CONTROL: a working connection shows no broken line', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
      renderPage();
      expect(await screen.findByText('Connected')).toBeInTheDocument();
      expect(screen.queryByText(/^Disconnected —/)).not.toBeInTheDocument();
    });

    it('an unknown code is shown as it came', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(broken('odd_code'));
      renderPage();
      expect(await screen.findByText(/^Disconnected —/)).toHaveTextContent(
        'Disconnected — odd_code, reconnect'
      );
    });

    it('a channel refusal keeps the channel usable; a test post Slack takes re-reads and clears it', async () => {
      const getStatus = vi
        .spyOn(platformSlackAlertsService, 'getStatus')
        .mockResolvedValueOnce(broken('not_in_channel'))
        .mockResolvedValue(connected());
      vi.spyOn(platformSlackAlertsService, 'sendTest').mockResolvedValue({ ok: true });
      renderPage();
      expect(await screen.findByTestId('platform-slack-broken')).toHaveTextContent(
        'Odly was removed from the alert channel — type /invite @Odly in Slack, then send a test message'
      );
      fireEvent.click(await screen.findByRole('button', { name: /send test message/i }));
      await screen.findByText(/Test message sent/);
      await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByTestId('platform-slack-broken')).not.toBeInTheDocument()
      );
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('picking another channel takes the cleared state from the save answer', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(
        broken('channel_not_found')
      );
      const listChannels = vi.spyOn(platformSlackAlertsService, 'listChannels').mockResolvedValue({
        channels: [
          { id: 'C1', name: 'platform-alerts', isPrivate: false, isMember: true },
          { id: 'C9', name: 'ops-alerts', isPrivate: false, isMember: true },
        ],
        truncated: false,
      });
      const save = vi
        .spyOn(platformSlackAlertsService, 'saveSettings')
        .mockResolvedValue(connected({ slackChannelId: 'C9', slackChannelName: 'ops-alerts' }));
      renderPage();
      expect(await screen.findByTestId('platform-slack-broken')).toHaveTextContent(
        'The alert channel no longer exists or was archived — pick another channel'
      );
      // Wait for the channel list, then pick the new channel.
      await waitFor(() => expect(listChannels).toHaveBeenCalled());
      await chooseOption(await screen.findByLabelText('Slack channel'), '#ops-alerts');
      await waitFor(() =>
        expect(save).toHaveBeenCalledWith({ slackChannelId: 'C9', slackChannelName: 'ops-alerts' })
      );
      await waitFor(() =>
        expect(screen.queryByTestId('platform-slack-broken')).not.toBeInTheDocument()
      );
    });

    it.each([
      [
        'not_in_channel',
        'Odly was removed from the alert channel — type /invite @Odly in Slack, then send a test message',
      ],
      [
        'channel_not_found',
        'The alert channel no longer exists or was archived — pick another channel',
      ],
      ['is_archived', 'The alert channel no longer exists or was archived — pick another channel'],
    ])(
      'a channel problem (%s) does not ask for a reconnect: the token works, the channel is the fix',
      async (code, words) => {
        vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(broken(code));
        renderPage();
        const title = await screen.findByTestId('platform-slack-broken');
        expect(title).toHaveTextContent(words);
        expect(title.textContent).toBe(words);
        expect(screen.getByText('Channel not reachable')).toBeInTheDocument();
        expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^reconnect$/i })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /paste a bot token/i })
        ).not.toBeInTheDocument();
        // The fix is on the channel card, which stays usable.
        expect(
          await screen.findByRole('button', { name: /send test message/i })
        ).toBeInTheDocument();
      }
    );

    it('CONTROL: a token problem still asks for a reconnect, with the paste-token fallback', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(broken('invalid_auth'));
      renderPage();
      expect(await screen.findByTestId('platform-slack-broken')).toHaveTextContent(
        'Disconnected — Slack no longer accepts the token, reconnect'
      );
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^reconnect$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /paste a bot token/i })).toBeInTheDocument();
    });
  });
});
