/**
 * Settings › Notifications › Slack. Pins what an admin must be able to see and do: connect, see
 * a broken connection with its reason, switch an alert type (which saves the channel's kinds),
 * read the admin-channel warning, and get the invite hint when the bot is not in the channel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import {
  slackNotificationsService,
  DEFAULT_TEAM_ON,
  type SlackRoute,
  type SlackStatus,
} from '@/services/slackNotifications.service';

type MockUser = { id: number; role: string; organizationRole?: string } | null;
let mockUser: MockUser = null;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: MockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 1, name: 'Sales', isActive: true },
      { id: 2, name: 'Billing', isActive: true },
    ],
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

const renderPage = (url = '/settings?tab=notifications') =>
  render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <SlackNotificationsSettings />
    </MemoryRouter>
  );

beforeEach(() => {
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
    const enabled = buttons.filter((button) => !(button as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(1);
    fireEvent.click(enabled[0]);
    await waitFor(() => expect(sendTest).toHaveBeenCalledWith('admin'));
    expect(await screen.findByText(/\/invite @Odly/)).toBeInTheDocument();
  });

  it('members without admin role do not see the section', () => {
    mockUser = { id: 8, role: 'user', organizationRole: 'member' };
    const getStatus = vi.spyOn(slackNotificationsService, 'getStatus');
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
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
