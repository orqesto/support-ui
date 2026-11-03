/**
 * Settings › Slack notifications. Pins what an admin must be able to see and do: connect, see
 * a broken connection with its reason, switch an alert type (which saves the channel's kinds),
 * read the admin-channel warning, and get the invite hint when the bot is not in the channel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import {
  slackNotificationsService,
  DEFAULT_TEAM_ON,
  type SlackRoute,
  type SlackStatus,
} from '@/services/slackNotifications.service';
import { isInactive } from '@/test/inactive';

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

/** `teamsEnabled` as the backend sends it (undefined = older backend: derived from the count). */
const teamsState = vi.hoisted(() => ({ teamsEnabled: undefined as boolean | undefined }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 1, name: 'Sales', isActive: true },
      { id: 2, name: 'Billing', isActive: true },
    ],
    teamsEnabled: teamsState.teamsEnabled,
    isLoading: false,
  }),
}));

const { SlackNotificationsSettings } = await import(
  '@/components/settings/SlackNotificationsSettings'
);

const route = (over: Partial<SlackRoute>): SlackRoute => ({
  channel: 'team',
  slackChannelId: 'C1',
  slackChannelName: 'support',
  enabledKinds: [...DEFAULT_TEAM_ON],
  includePreview: false,
  departmentFilter: null,
  updatedAt: new Date().toISOString(),
  ...over,
});

const connected = (routes: SlackRoute[] = []): SlackStatus => ({
  connection: { teamName: 'Example Co', status: 'connected', brokenReason: null },
  routes,
});

/** Shows the router's current query string, to prove the ?slack= params were removed. */
const LocationProbe = () => <output data-testid="search">{useLocation().search}</output>;

const renderPage = (url = '/settings?tab=notifications') =>
  render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <SlackNotificationsSettings />
      <LocationProbe />
    </MemoryRouter>
  );

const switchNamed = (name: RegExp) => screen.findByRole('switch', { name });

/** A promise the test settles by hand, to hold a save in flight. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (err: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  teamsState.teamsEnabled = undefined;
  Object.values(toastMock).forEach((fn) => fn.mockReset());
  mockUser = { id: 7, role: 'user', organizationRole: 'org_admin' };
  vi.spyOn(slackNotificationsService, 'listChannels').mockResolvedValue({
    channels: [
      { id: 'C1', name: 'support', isPrivate: false, isMember: true },
      { id: 'C2', name: 'ops', isPrivate: false, isMember: true },
    ],
    truncated: false,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SlackNotificationsSettings', () => {
  it('shows Add to Slack when not connected', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue({
      connection: null,
      routes: [],
    });
    renderPage();
    expect(await screen.findByRole('button', { name: /add to slack/i })).toBeInTheDocument();
    // The self-hosted fallback names the scopes a pasted token needs.
    fireEvent.click(screen.getByRole('button', { name: /self-hosted\? paste a bot token/i }));
    expect(
      screen.getByText(/chat:write, chat:write.public, channels:read, groups:read/)
    ).toBeInTheDocument();
  });

  it('broken connection shows reason and reconnect', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue({
      connection: { teamName: 'Example Co', status: 'broken', brokenReason: 'token_revoked' },
      routes: [],
    });
    renderPage();
    expect(await screen.findByText(/Disconnected —/)).toHaveTextContent(
      /removed from your Slack workspace/
    );
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
  });

  it('a kind switch PUTs enabledKinds', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([route({ channel: 'team' })])
    );
    const save = vi
      .spyOn(slackNotificationsService, 'saveRoute')
      .mockImplementation((_channel, body) => Promise.resolve(route({ ...body })));
    renderPage();
    const holdSwitch = await screen.findByRole('switch', { name: /hold recheck due/i });
    expect(holdSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(holdSwitch);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [channel, body] = save.mock.calls[0];
    expect(channel).toBe('team');
    expect(body.slackChannelId).toBe('C1');
    expect(body.enabledKinds).toEqual([...DEFAULT_TEAM_ON, 'hold_recheck_due']);
    // Control: the switch that was not touched kept its value.
    expect(body.enabledKinds).toContain('new_unassigned_message');
    expect(body.enabledKinds).not.toContain('conversation_assigned');
  });

  it('admin card shows the department warning', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected());
    renderPage();
    expect(
      await screen.findByText(
        'Everyone in this Slack channel sees customer names and subjects from every team.'
      )
    ).toBeInTheDocument();
  });

  it('test message failure not_in_channel shows the invite hint', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([
        route({
          channel: 'admin',
          enabledKinds: [],
          slackChannelId: 'C2',
          slackChannelName: 'ops',
        }),
      ])
    );
    const sendTest = vi.spyOn(slackNotificationsService, 'sendTest').mockResolvedValue({
      ok: false,
      code: 'not_in_channel',
    });
    renderPage();
    // Before the click the bot is a member of #ops, so no invite hint shows.
    await screen.findByText('Admin channel');
    expect(screen.queryByText(/\/invite @Odly/)).not.toBeInTheDocument();
    const buttons = await screen.findAllByRole('button', { name: /send test message/i });
    // The team card has no channel yet, so its button is disabled; the admin one is enabled.
    const enabled = buttons.filter((button) => !isInactive(button));
    expect(enabled).toHaveLength(1);
    fireEvent.click(enabled[0]);
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith('admin'));
    expect(await screen.findByText(/\/invite @Odly/)).toBeInTheDocument();
  });

  it('members without admin role do not see the section', () => {
    mockUser = { id: 8, role: 'user', organizationRole: 'member' };
    const getStatus = vi.spyOn(slackNotificationsService, 'getStatus');
    const { container } = renderPage();
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Slack' })).toBeNull();
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('a global admin sees the section', async () => {
    mockUser = { id: 9, role: 'admin', organizationRole: 'member' };
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue({
      connection: null,
      routes: [],
    });
    renderPage();
    expect(await screen.findByRole('button', { name: /add to slack/i })).toBeInTheDocument();
  });

  it('says so when Slack sends the admin back with an error', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue({
      connection: null,
      routes: [],
    });
    renderPage('/settings?tab=notifications&slack=error&reason=access_denied');
    expect(await screen.findByText(/Slack did not connect/)).toHaveTextContent(/access_denied/);
  });

  it('says so when the channel list was cut short', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected());
    vi.spyOn(slackNotificationsService, 'listChannels').mockResolvedValue({
      channels: [{ id: 'C1', name: 'support', isPrivate: false, isMember: true }],
      truncated: true,
    });
    renderPage();
    expect(await screen.findByText(/first 2,000 channels/)).toBeInTheDocument();
  });
});

describe('SlackNotificationsSettings — saves (fix round 1)', () => {
  it('a failed save shows what the server holds after a re-read, not an old snapshot', async () => {
    // The server already has `conversation_assigned` on (another save landed meanwhile).
    const serverRoute = route({ enabledKinds: [...DEFAULT_TEAM_ON, 'conversation_assigned'] });
    vi.spyOn(slackNotificationsService, 'getStatus')
      .mockResolvedValueOnce(connected([route({})]))
      .mockResolvedValueOnce(connected([serverRoute]));
    vi.spyOn(slackNotificationsService, 'saveRoute').mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await switchNamed(/hold recheck due/i));
    await waitFor(() => expect(toastMock.failure).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /conversation assigned/i })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    );
    expect(screen.getByRole('switch', { name: /hold recheck due/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('a second toggle during a pending save cannot send an overlapping, out-of-order PUT', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected([route({})]));
    const first = deferred<SlackRoute | null>();
    const save = vi
      .spyOn(slackNotificationsService, 'saveRoute')
      .mockImplementationOnce(() => first.promise)
      .mockImplementation((_channel, body) => Promise.resolve(route({ ...body })));
    renderPage();
    fireEvent.click(await switchNamed(/hold recheck due/i));
    const assigned = screen.getByRole('switch', { name: /conversation assigned/i });
    // While PUT #1 is in flight the card is locked: the second toggle sends nothing.
    expect(assigned).toBeInactive();
    fireEvent.click(assigned);
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve(route({ enabledKinds: [...DEFAULT_TEAM_ON, 'hold_recheck_due'] }));
    await waitFor(() => expect(assigned).not.toBeInactive());
    fireEvent.click(assigned);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    // PUT #2 starts after #1 finished and carries both changes.
    expect(save.mock.calls[1][1].enabledKinds).toEqual([
      ...DEFAULT_TEAM_ON,
      'hold_recheck_due',
      'conversation_assigned',
    ]);
  });

  it('Disconnect is blocked while a channel save is in flight', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected([route({})]));
    const pending = deferred<SlackRoute | null>();
    vi.spyOn(slackNotificationsService, 'saveRoute').mockReturnValue(pending.promise);
    const disconnect = vi.spyOn(slackNotificationsService, 'disconnect').mockResolvedValue();
    renderPage();
    const disconnectButton = await screen.findByRole('button', { name: /^disconnect$/i });
    expect(disconnectButton).not.toBeInactive();
    fireEvent.click(await switchNamed(/hold recheck due/i));
    await waitFor(() => expect(disconnectButton).toBeInactive());
    fireEvent.click(disconnectButton);
    expect(screen.queryByText('Disconnect Slack?')).not.toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
    pending.resolve(route({ enabledKinds: [...DEFAULT_TEAM_ON, 'hold_recheck_due'] }));
    await waitFor(() => expect(disconnectButton).not.toBeInactive());
  });

  it('the screen takes the route the server returns', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected([route({})]));
    // The server answer differs from what was sent (preview switched off server-side).
    vi.spyOn(slackNotificationsService, 'saveRoute').mockResolvedValue(
      route({ includePreview: false, enabledKinds: [...DEFAULT_TEAM_ON] })
    );
    renderPage();
    const preview = await switchNamed(/include a short message preview/i);
    fireEvent.click(preview);
    expect(preview).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(preview).toHaveAttribute('aria-checked', 'false'));
  });
});

describe('SlackNotificationsSettings — connect, load and return (fix round 1)', () => {
  it('an empty connect link says so instead of stopping silently', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue({
      connection: null,
      routes: [],
    });
    vi.spyOn(slackNotificationsService, 'getConnectUrl').mockResolvedValue('');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /add to slack/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toMatch(/connect link/);
  });

  it('a failed status load offers Retry, which loads again', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ connection: null, routes: [] });
    renderPage();
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('button', { name: /add to slack/i })).toBeInTheDocument();
  });

  const HINT = 'Private channel? Type /invite @Odly in Slack.';
  function renderWithChannel(isPrivate: boolean, isMember: boolean) {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([
        route({
          channel: 'admin',
          enabledKinds: [],
          slackChannelId: 'C3',
          slackChannelName: 'alerts',
        }),
      ])
    );
    vi.spyOn(slackNotificationsService, 'listChannels').mockResolvedValue({
      channels: [{ id: 'C3', name: 'alerts', isPrivate, isMember }],
      truncated: false,
    });
    const sendTest = vi.spyOn(slackNotificationsService, 'sendTest');
    renderPage();
    return sendTest;
  }

  it('shows the invite hint for a private channel the bot is not in, before any test post', async () => {
    const sendTest = renderWithChannel(true, false);
    expect(await screen.findByText(HINT)).toBeInTheDocument();
    expect(sendTest).not.toHaveBeenCalled();
  });

  it('shows no invite hint for a public channel the bot is not in', async () => {
    renderWithChannel(false, false);
    await screen.findByText(/#alerts/);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('shows no invite hint for a private channel the bot is in', async () => {
    renderWithChannel(true, true);
    await screen.findByText(/#alerts/);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('?slack=connected shows the success notice and removes the slack params', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(connected());
    renderPage('/settings?tab=notifications&slack=connected');
    expect(await screen.findByText(/Slack is connected/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?tab=notifications')
    );
    expect(screen.getByTestId('search').textContent).not.toMatch(/slack=/);
  });

  it('submits a pasted bot token and shows the connection', async () => {
    vi.spyOn(slackNotificationsService, 'getStatus')
      .mockResolvedValueOnce({ connection: null, routes: [] })
      .mockResolvedValueOnce(connected());
    const connectWithToken = vi
      .spyOn(slackNotificationsService, 'connectWithToken')
      .mockResolvedValue({ teamName: 'Example Co', status: 'connected', brokenReason: null });
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /self-hosted\? paste a bot token/i })
    );
    const submit = screen.getByRole('button', { name: /connect with this token/i });
    expect(submit).toBeInactive();
    fireEvent.change(screen.getByLabelText('Bot token'), { target: { value: ' xoxb-test-1 ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(connectWithToken).toHaveBeenCalledWith('xoxb-test-1'));
    expect(await screen.findByText('Example Co')).toBeInTheDocument();
  });

  it('teams turned off: no "Teams posted here" switches on the team card', async () => {
    teamsState.teamsEnabled = false;
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([route({ channel: 'team' })])
    );
    renderPage();
    await screen.findByText('Team channel');
    expect(screen.queryByText('Teams posted here')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Sales' })).not.toBeInTheDocument();
  });

  it('teams turned off: a saved team exclusion is not shown, and a save keeps it stored', async () => {
    teamsState.teamsEnabled = false;
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([route({ channel: 'team', departmentFilter: { excludedDepartmentIds: [2] } })])
    );
    const save = vi
      .spyOn(slackNotificationsService, 'saveRoute')
      .mockImplementation((_channel, body) => Promise.resolve(route({ ...body })));
    renderPage();
    fireEvent.click(await switchNamed(/hold recheck due/i));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('switch', { name: 'Billing' })).not.toBeInTheDocument();
    // Hidden, not deleted: switching teams back on brings the same exclusion back.
    expect(save.mock.calls[0][1].departmentFilter).toEqual({ excludedDepartmentIds: [2] });
  });

  it('CONTROL: teams turned on: the team card lists each team', async () => {
    teamsState.teamsEnabled = true;
    vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
      connected([route({ channel: 'team' })])
    );
    renderPage();
    expect(await screen.findByText('Teams posted here')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Sales' })).toBeInTheDocument();
  });

  describe('a token for ANOTHER Slack workspace', () => {
    const pasteToken = async (token: string) => {
      fireEvent.click(
        await screen.findByRole('button', { name: /self-hosted\? paste a bot token/i })
      );
      fireEvent.change(screen.getByLabelText('Bot token'), { target: { value: token } });
      fireEvent.click(screen.getByRole('button', { name: /connect with this token/i }));
    };

    it('the cards drop the old channel, and a switch does not PUT the old channel id', async () => {
      // The BE drops the routes when the token belongs to a different Slack workspace.
      vi.spyOn(slackNotificationsService, 'getStatus')
        .mockResolvedValueOnce({
          connection: { teamName: 'Example Co', status: 'broken', brokenReason: 'token_revoked' },
          routes: [route({ channel: 'team' })],
        })
        .mockResolvedValue({
          connection: { teamName: 'Other Co', status: 'connected', brokenReason: null },
          routes: [],
        });
      vi.spyOn(slackNotificationsService, 'connectWithToken').mockResolvedValue({
        teamName: 'Other Co',
        status: 'connected',
        brokenReason: null,
      });
      const save = vi.spyOn(slackNotificationsService, 'saveRoute');
      renderPage();
      // CONTROL: before the new token the team card holds the old channel.
      await screen.findByText('Team channel');
      expect(screen.getAllByText(/pick a channel to start posting/i)).toHaveLength(1);
      await pasteToken('xoxb-other-1');
      expect(await screen.findByText('Other Co')).toBeInTheDocument();
      // Both cards now start empty.
      await waitFor(() =>
        expect(screen.getAllByText(/pick a channel to start posting/i)).toHaveLength(2)
      );
      fireEvent.click(await switchNamed(/hold recheck due/i));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(save).not.toHaveBeenCalled();
    });

    it('CONTROL: a token for the SAME Slack workspace keeps the saved channel', async () => {
      vi.spyOn(slackNotificationsService, 'getStatus')
        .mockResolvedValueOnce({
          connection: { teamName: 'Example Co', status: 'broken', brokenReason: 'token_revoked' },
          routes: [route({ channel: 'team' })],
        })
        .mockResolvedValue(connected([route({ channel: 'team' })]));
      vi.spyOn(slackNotificationsService, 'connectWithToken').mockResolvedValue({
        teamName: 'Example Co',
        status: 'connected',
        brokenReason: null,
      });
      const save = vi
        .spyOn(slackNotificationsService, 'saveRoute')
        .mockImplementation((_channel, body) => Promise.resolve(route({ ...body })));
      renderPage();
      await screen.findByText('Team channel');
      await pasteToken('xoxb-same-1');
      await screen.findByText('Connected');
      fireEvent.click(await switchNamed(/hold recheck due/i));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0][1].slackChannelId).toBe('C1');
    });
  });

  describe('a broken channel (Ruling S)', () => {
    it('shows why in words on that card only, with the test action; unknown codes show raw', async () => {
      vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
        connected([
          route({ channel: 'team', status: 'broken', brokenReason: 'not_in_channel' }),
          route({
            channel: 'admin',
            enabledKinds: [],
            slackChannelId: 'C2',
            slackChannelName: 'ops',
            status: 'ok',
            brokenReason: null,
          }),
        ])
      );
      renderPage();
      const line = await screen.findByText(
        'Odly was removed from this channel — type /invite @Odly in Slack, then send a test message'
      );
      expect(line).toHaveClass('text-destructive');
      // CONTROL: the healthy admin card carries no broken line.
      expect(screen.getAllByTestId('slack-route-broken')).toHaveLength(1);
      const buttons = screen.getAllByRole('button', { name: /send test message/i });
      expect(buttons.every((button) => !isInactive(button))).toBe(true);
      cleanup();

      vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
        connected([
          route({ channel: 'team', status: 'broken', brokenReason: 'is_archived' }),
          route({
            channel: 'admin',
            enabledKinds: [],
            slackChannelId: 'C2',
            status: 'broken',
            brokenReason: 'weird_code',
          }),
        ])
      );
      renderPage();
      expect(
        await screen.findByText(
          'This channel no longer exists or was archived — pick another channel'
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/weird_code/)).toBeInTheDocument();
    });

    it('channel_not_found reads the same as archived', async () => {
      vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
        connected([route({ channel: 'team', status: 'broken', brokenReason: 'channel_not_found' })])
      );
      renderPage();
      expect(
        await screen.findByText(
          'This channel no longer exists or was archived — pick another channel'
        )
      ).toBeInTheDocument();
    });

    it('CONTROL: an older backend with no route status shows no broken line', async () => {
      vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
        connected([route({ channel: 'team' })])
      );
      renderPage();
      await screen.findByText('Team channel');
      expect(screen.queryByTestId('slack-route-broken')).not.toBeInTheDocument();
    });

    it('a successful test post re-reads the status, and the cleared channel loses its red line', async () => {
      const getStatus = vi
        .spyOn(slackNotificationsService, 'getStatus')
        .mockResolvedValueOnce(
          connected([route({ channel: 'team', status: 'broken', brokenReason: 'not_in_channel' })])
        )
        .mockResolvedValue(
          connected([route({ channel: 'team', status: 'ok', brokenReason: null })])
        );
      vi.spyOn(slackNotificationsService, 'sendTest').mockResolvedValue({ ok: true });
      renderPage();
      await screen.findByTestId('slack-route-broken');
      const [teamButton] = screen.getAllByRole('button', { name: /send test message/i });
      fireEvent.click(teamButton);
      await screen.findByText(/Test message sent/);
      await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByTestId('slack-route-broken')).not.toBeInTheDocument()
      );
    });

    it('CONTROL: a refused test post keeps the red line the server still reports', async () => {
      const getStatus = vi
        .spyOn(slackNotificationsService, 'getStatus')
        .mockResolvedValue(
          connected([route({ channel: 'team', status: 'broken', brokenReason: 'not_in_channel' })])
        );
      const sendTest = vi.spyOn(slackNotificationsService, 'sendTest').mockResolvedValue({
        ok: false,
        code: 'not_in_channel',
      });
      renderPage();
      await screen.findByTestId('slack-route-broken');
      fireEvent.click(screen.getAllByRole('button', { name: /send test message/i })[0]);
      await waitFor(() => expect(sendTest).toHaveBeenCalled());
      await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('slack-route-broken')).toBeInTheDocument();
    });

    it('a save the server accepts clears the red line (saving retires the broken episode)', async () => {
      vi.spyOn(slackNotificationsService, 'getStatus').mockResolvedValue(
        connected([route({ channel: 'team', status: 'broken', brokenReason: 'channel_not_found' })])
      );
      vi.spyOn(slackNotificationsService, 'saveRoute').mockImplementation((_channel, body) =>
        Promise.resolve(route({ ...body }))
      );
      renderPage();
      await screen.findByTestId('slack-route-broken');
      fireEvent.click(await switchNamed(/hold recheck due/i));
      await waitFor(() =>
        expect(screen.queryByTestId('slack-route-broken')).not.toBeInTheDocument()
      );
    });
  });
});
