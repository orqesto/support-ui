/**
 * Admin console › Platform › Alerts. Pins what a global admin must be able to do: see the default
 * thresholds (with units) when none are stored and save them as one FULL object (the backend
 * replaces the stored thresholds wholesale), enter the Slack app credentials without ever seeing
 * a stored value back (only its last four characters), and that nobody else sees the page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { chooseOption } from '@/test/chooseOption';
import { apiError } from '@/test/apiError';
import { apiClient } from '@/lib/api-client';
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

/** A promise the test settles by hand, to hold a save in flight. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** The Save button that belongs to this secret field (the nearest one up the tree). */
const saveButtonOf = (field: HTMLElement): HTMLElement => {
  let node: HTMLElement | null = field.parentElement;
  while (node && !within(node).queryByRole('button', { name: /^save$/i })) {
    node = node.parentElement;
  }
  if (!node) throw new Error('no Save button near the field');
  return within(node).getByRole('button', { name: /^save$/i });
};

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
    // Through the real service: its normalisation is the one place the defaults are filled.
    const stored = connected();
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        data: { ...stored, settings: { ...stored.settings, thresholds: {} } },
      },
    } as never);
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

  it('a failed thresholds save keeps what the admin typed (no revert, no re-read over it)', async () => {
    // A re-read would show 60, a revert 85: only the typed 70 proves the edit was kept.
    vi.spyOn(platformSlackAlertsService, 'getStatus')
      .mockResolvedValueOnce(connected())
      .mockResolvedValue(
        connected({
          thresholds: { ...DEFAULT_PLATFORM_THRESHOLDS, cpu: { percent: 60, sustainedMinutes: 5 } },
        })
      );
    const failure = await apiError(400, {
      success: false,
      error: 'dbPool: the warning level must be below the critical level',
    });
    vi.spyOn(platformSlackAlertsService, 'saveSettings').mockRejectedValue(failure);
    renderPage();
    const cpu = await screen.findByLabelText(/^CPU above \(%\)$/i);
    fireEvent.change(cpu, { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
    // The backend's own words, inline on the card.
    expect(
      await screen.findByText(/dbPool: the warning level must be below the critical level/)
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^CPU above \(%\)$/i)).not.toBeInactive());
    expect(screen.getByLabelText(/^CPU above \(%\)$/i)).toHaveValue(70);
  });

  it.each([
    ['dbPool', /^Pool use warning \(%\)$/i, '95', /^Pool use critical \(%\)$/i],
    ['eventLoop', /^Event-loop lag warning \(ms\)$/i, '500', /^Event-loop lag critical \(ms\)$/i],
    [
      'rate429',
      /^Rejected requests warning \(per sample window\)$/i,
      '300',
      /^Rejected requests critical \(per sample window\)$/i,
    ],
  ])(
    'a %s warning level at or above its critical level is refused inline, without saving',
    async (_group, warnLabel, warnValue, critLabel) => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
      const save = vi.spyOn(platformSlackAlertsService, 'saveSettings');
      renderPage();
      const warn = await screen.findByLabelText(warnLabel);
      fireEvent.change(warn, { target: { value: warnValue } });
      fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
      expect(await screen.findByText(/must be below the critical level/i)).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
      // CONTROL: raising the critical level above the warning lets the save go.
      fireEvent.change(screen.getByLabelText(critLabel), {
        target: { value: String(Number(warnValue) + 1) },
      });
      vi.mocked(save).mockResolvedValue(connected());
      fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    }
  );

  it('the thresholds form is disabled while its save is in flight', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
    const pending = deferred<PlatformSlackStatus>();
    const save = vi
      .spyOn(platformSlackAlertsService, 'saveSettings')
      .mockReturnValue(pending.promise);
    renderPage();
    const cpu = await screen.findByLabelText(/^CPU above \(%\)$/i);
    const saveButton = screen.getByRole('button', { name: /save thresholds/i });
    fireEvent.click(saveButton);
    await waitFor(() => expect(cpu).toBeInactive());
    expect(saveButton).toBeInactive();
    // A second press while it is out of use sends nothing.
    fireEvent.click(saveButton);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve(connected());
    await waitFor(() => expect(cpu).not.toBeInactive());
    expect(saveButton).not.toBeInactive();
  });

  it('a signal save waits for a thresholds save in flight (the PUTs never overlap)', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
    const thresholdsSave = deferred<PlatformSlackStatus>();
    const save = vi
      .spyOn(platformSlackAlertsService, 'saveSettings')
      .mockImplementationOnce(() => thresholdsSave.promise)
      .mockImplementation((body) =>
        Promise.resolve(connected({ enabledSignals: body.enabledSignals }))
      );
    renderPage();
    await screen.findByLabelText(/^CPU above \(%\)$/i);
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('switch', { name: /^disk usage$/i }));
    // Give a would-be overlapping PUT every chance to start.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(save).toHaveBeenCalledTimes(1);
    thresholdsSave.resolve(connected());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toEqual({
      enabledSignals: PLATFORM_SLACK_SIGNALS.filter((signal) => signal !== 'disk'),
    });
  });

  it('Disconnect is blocked while a channel save is in flight', async () => {
    vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
    vi.spyOn(platformSlackAlertsService, 'listChannels').mockResolvedValue({
      channels: [
        { id: 'C1', name: 'platform-alerts', isPrivate: false, isMember: true },
        { id: 'C9', name: 'ops-alerts', isPrivate: false, isMember: true },
      ],
      truncated: false,
    });
    const pending = deferred<PlatformSlackStatus>();
    vi.spyOn(platformSlackAlertsService, 'saveSettings').mockReturnValue(pending.promise);
    const disconnect = vi.spyOn(platformSlackAlertsService, 'disconnect').mockResolvedValue();
    renderPage();
    const disconnectButton = await screen.findByRole('button', { name: /^disconnect$/i });
    expect(disconnectButton).not.toBeInactive();
    await chooseOption(await screen.findByLabelText('Slack channel'), '#ops-alerts');
    await waitFor(() => expect(disconnectButton).toBeInactive());
    fireEvent.click(disconnectButton);
    expect(screen.queryByText('Disconnect Slack?')).not.toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
    pending.resolve(connected({ slackChannelId: 'C9', slackChannelName: 'ops-alerts' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^disconnect$/i })).not.toBeInactive()
    );
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

  describe('Slack post retention (round 2)', () => {
    const RETENTION = { days: 30, chunkSize: 500, maxChunksPerWorkspace: 20 };
    const withRetention = (over: Partial<typeof RETENTION> = {}) =>
      connected({ postRetention: { ...RETENTION, ...over } });

    it('shows the stored values and saves only the retention group', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(withRetention());
      const save = vi
        .spyOn(platformSlackAlertsService, 'saveSettings')
        .mockImplementation((body) =>
          Promise.resolve(connected({ postRetention: { ...RETENTION, ...body.postRetention } }))
        );
      renderPage();
      const days = await screen.findByLabelText(/^Delete ended Slack posts after \(days\)$/i);
      expect(days).toHaveValue(30);
      expect(screen.getByLabelText(/^Posts deleted per step$/i)).toHaveValue(500);
      expect(screen.getByLabelText(/^Steps per workspace per daily run$/i)).toHaveValue(20);
      fireEvent.change(days, { target: { value: '45' } });
      fireEvent.click(screen.getByRole('button', { name: /save retention/i }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save).toHaveBeenCalledWith({ postRetention: { ...RETENTION, days: 45 } });
      expect(toastMock.success).toHaveBeenCalledWith('Retention saved');
    });

    it('an older backend that sends no retention shows no retention fields', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(connected());
      renderPage();
      // CONTROL: the page itself rendered.
      await screen.findByLabelText(/^CPU above \(%\)$/i);
      expect(screen.queryByLabelText(/delete ended slack posts/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save retention/i })).not.toBeInTheDocument();
    });

    it.each([
      [/^Delete ended Slack posts after \(days\)$/i, '3', /between 7 and 3,650/],
      [/^Posts deleted per step$/i, '10', /between 50 and 5,000/],
      [/^Steps per workspace per daily run$/i, '2.5', /whole number/],
    ])(
      'refuses an out-of-bounds value inline without saving (%s)',
      async (label, value, message) => {
        vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(withRetention());
        const save = vi.spyOn(platformSlackAlertsService, 'saveSettings');
        renderPage();
        fireEvent.change(await screen.findByLabelText(label), { target: { value } });
        fireEvent.click(screen.getByRole('button', { name: /save retention/i }));
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(save).not.toHaveBeenCalled();
      }
    );

    it('a refused save shows the backend message inline and keeps the typed value', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(withRetention());
      vi.spyOn(platformSlackAlertsService, 'saveSettings').mockRejectedValue(
        await apiError(400, { success: false, error: 'Number must be less than or equal to 3650' })
      );
      renderPage();
      const days = await screen.findByLabelText(/^Delete ended Slack posts after \(days\)$/i);
      fireEvent.change(days, { target: { value: '60' } });
      fireEvent.click(screen.getByRole('button', { name: /save retention/i }));
      expect(
        await screen.findByText(/Number must be less than or equal to 3650/)
      ).toBeInTheDocument();
      await waitFor(() => expect(days).not.toBeInactive());
      expect(days).toHaveValue(60);
    });

    it('a retention save waits for a thresholds save in flight (one save queue)', async () => {
      vi.spyOn(platformSlackAlertsService, 'getStatus').mockResolvedValue(withRetention());
      const thresholdsSave = deferred<PlatformSlackStatus>();
      const save = vi
        .spyOn(platformSlackAlertsService, 'saveSettings')
        .mockImplementationOnce(() => thresholdsSave.promise)
        .mockImplementation(() => Promise.resolve(withRetention({ days: 45 })));
      renderPage();
      const days = await screen.findByLabelText(/^Delete ended Slack posts after \(days\)$/i);
      fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      fireEvent.change(days, { target: { value: '45' } });
      fireEvent.click(screen.getByRole('button', { name: /save retention/i }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(save).toHaveBeenCalledTimes(1);
      thresholdsSave.resolve(withRetention());
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1][0]).toEqual({ postRetention: { ...RETENTION, days: 45 } });
    });
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
    fireEvent.click(saveButtonOf(field));

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
