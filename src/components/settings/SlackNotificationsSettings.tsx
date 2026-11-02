import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { useDepartments } from '@/hooks/useDepartments';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import {
  defaultKindsForChannel,
  kindsForChannel,
  SLACK_BOT_SCOPES,
  slackNotificationsService,
  type SlackChannelList,
  type SlackRoute,
  type SlackRouteChannel,
  type SlackRouteInput,
  type SlackStatus,
  type SlackTestResult,
} from '@/services/slackNotifications.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Settings › Notifications › Slack (workspace admins and global admins).
 *
 * Connect Slack ("Add to Slack", or a pasted bot token on a self-hosted install), then pick two
 * channels: the team channel (work that needs a person) and the admin channel (problems with the
 * app in this workspace). Each channel has per-alert switches and a test button. Every change
 * saves the channel's whole route at once (`PUT /api/notifications/slack/routes/:channel`).
 */

const KIND_LABELS: Record<string, string> = {
  new_unassigned_message: 'New customer message on an unassigned conversation',
  customer_message_on_assigned: 'New customer message on an assigned conversation',
  conversation_reopened: 'Conversation reopened by the customer',
  sla_message_breach: 'Conversation SLA about to breach or breached',
  sla_ticket_first_response: 'Ticket first-response SLA about to breach or breached',
  sla_ticket_resolution: 'Ticket resolution SLA about to breach or breached',
  hold_recheck_due: 'Hold recheck due',
  conversation_assigned: 'Conversation assigned to someone',
  ingestion_dark: 'Mailbox stopped receiving mail',
  ingestion_gap: 'Gap in imported mail',
  customer_reply_in_spam: 'Customer reply landed in the spam folder',
  ai_provider_down: "Workspace's own AI key failing",
  ai_token_limit_reached: 'AI token limit reached',
  mailbox_address_undeclared: 'Mailbox address not declared',
  one_sided_outbound: 'Mail sent but no replies received',
  suspicious_arrival: 'Suspicious mail arrived',
  spam_arrival: 'Spam arrived',
  kb_review_pending: 'Knowledge base capture waiting for review',
  kb_consolidation_pending: 'Knowledge base merge waiting for review',
  kb_document_stale: 'Knowledge base document out of date',
};

/** Why Slack stopped accepting the connection, in words (the code is kept for anything else). */
const BROKEN_REASONS: Record<string, string> = {
  token_revoked: 'the Slack app was removed from your Slack workspace',
  account_inactive: 'the Slack app was removed from your Slack workspace',
  invalid_auth: 'Slack no longer accepts the token',
  missing_scope: 'the Slack app is missing a permission',
};

/** Used when the backend sends a code without its own hint. */
const TEST_HINTS: Record<string, string> = {
  not_in_channel:
    'The Odly bot is not in that channel. In Slack, open the channel and type /invite @Odly, then try again.',
  channel_not_found:
    'That channel no longer exists, or the bot cannot see it. Pick another channel.',
  is_archived: 'That channel is archived. Pick another channel.',
};

/** Ruling S: why Slack stopped taking posts to one channel, in words (other codes shown raw). */
const ROUTE_BROKEN_REASONS: Record<string, string> = {
  not_in_channel:
    'Odly was removed from this channel — type /invite @Odly in Slack, then send a test message',
  channel_not_found: 'This channel no longer exists or was archived — pick another channel',
  is_archived: 'This channel no longer exists or was archived — pick another channel',
};

const routeBrokenText = (code: string): string =>
  ROUTE_BROKEN_REASONS[code] ?? `Slack stopped accepting posts to this channel (${code})`;

/** The channel's health as the server reports it; null = working (or an older backend). */
const brokenFrom = (route: SlackRoute | undefined): string | null =>
  route?.status === 'broken' ? (route.brokenReason ?? 'broken') : null;

const INVITE_HINT = 'Private channel? Type /invite @Odly in Slack.';

const CHANNEL_TITLES: Record<SlackRouteChannel, { title: string; description: string }> = {
  team: {
    title: 'Team channel',
    description: 'Work that needs a person: new mail, reopened conversations, SLA timers.',
  },
  admin: {
    title: 'Admin channel',
    description: 'Problems with the app in this workspace: mailboxes, AI, spam.',
  },
};

type Draft = SlackRouteInput;

const draftFrom = (channel: SlackRouteChannel, route: SlackRoute | undefined): Draft => ({
  slackChannelId: route?.slackChannelId ?? '',
  slackChannelName: route?.slackChannelName,
  enabledKinds: route ? [...route.enabledKinds] : [...defaultKindsForChannel(channel)],
  includePreview: route?.includePreview ?? false,
  departmentFilter: channel === 'team' ? (route?.departmentFilter ?? null) : null,
});

const SwitchRow = ({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex gap-4 justify-between items-center py-2 border-b border-border last:border-0">
    <p className="text-sm">{label}</p>
    <Toggle checked={checked} onChange={onChange} ariaLabel={label} disabled={disabled} />
  </div>
);

const ChannelCard = ({
  channel,
  route,
  channelList,
  readOnly,
}: {
  channel: SlackRouteChannel;
  route: SlackRoute | undefined;
  channelList: SlackChannelList | null;
  readOnly: boolean;
}) => {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(channel, route));
  const [saving, setSaving] = useState(false);
  // The lock as of now, not as of the last render: a second event in the same tick must see it.
  const savingRef = useRef(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SlackTestResult | null>(null);
  // Ruling S: the server's word on whether Slack still takes posts to this channel.
  const [brokenReason, setBrokenReason] = useState<string | null>(() => brokenFrom(route));
  const routeBroken = brokenFrom(route);
  useEffect(() => setBrokenReason(routeBroken), [routeBroken]);
  const { data: departments } = useDepartments();
  const isTeam = channel === 'team';
  const hasChannel = draft.slackChannelId !== '';

  // One save at a time per card: every control on the card is locked while a PUT is in flight,
  // so two full-route PUTs can never overlap or land out of order. Afterwards the screen shows
  // what the server holds: the returned route on success, a fresh read on failure.
  const locked = readOnly || saving;

  const resyncFromServer = () =>
    slackNotificationsService
      .getStatus()
      .then((status) => {
        const saved = (status.routes ?? []).find((each) => each.channel === channel);
        setDraft(draftFrom(channel, saved));
        setBrokenReason(brokenFrom(saved));
      })
      .catch((err: unknown) => {
        toast.failure('read the saved Slack settings — reload the page', err);
      });

  const persist = (next: Draft) => {
    if (savingRef.current) return;
    setDraft(next);
    setTestResult(null);
    // No channel picked yet: keep the choice on the page; it is saved with the channel.
    if (!next.slackChannelId) return;
    savingRef.current = true;
    setSaving(true);
    slackNotificationsService
      .saveRoute(channel, next)
      .then((saved) => {
        if (!saved) return;
        setDraft(draftFrom(channel, saved));
        // The backend retires the channel's broken episode on every save (the PUT answer carries
        // no status), so a saved route is working until Slack refuses it again.
        setBrokenReason(saved.status === 'broken' ? (saved.brokenReason ?? 'broken') : null);
      })
      .catch(async (err: unknown) => {
        toast.failure(`save the ${channel} channel`, err);
        await resyncFromServer();
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  };

  const options = (channelList?.channels ?? []).map((chan) => ({
    value: chan.id,
    label: `#${chan.name}${chan.isPrivate ? ' (private)' : ''}`,
  }));
  if (hasChannel && !options.some((option) => option.value === draft.slackChannelId)) {
    options.unshift({
      value: draft.slackChannelId,
      label: `#${draft.slackChannelName ?? draft.slackChannelId}`,
    });
  }
  const picked = channelList?.channels.find((chan) => chan.id === draft.slackChannelId);

  const onPick = (slackChannelId: string) => {
    if (!slackChannelId) return;
    const found = channelList?.channels.find((chan) => chan.id === slackChannelId);
    persist({ ...draft, slackChannelId, slackChannelName: found?.name ?? draft.slackChannelName });
  };

  const setKind = (kind: string, on: boolean) => {
    const enabled = new Set(draft.enabledKinds);
    if (on) enabled.add(kind);
    else enabled.delete(kind);
    persist({
      ...draft,
      enabledKinds: kindsForChannel(channel).filter((each) => enabled.has(each)),
    });
  };

  const excluded = new Set(draft.departmentFilter?.excludedDepartmentIds ?? []);
  const setDepartment = (departmentId: number, on: boolean) => {
    const next = new Set(excluded);
    if (on) next.delete(departmentId);
    else next.add(departmentId);
    persist({ ...draft, departmentFilter: { excludedDepartmentIds: [...next] } });
  };

  const sendTest = () => {
    setTesting(true);
    setTestResult(null);
    slackNotificationsService
      .sendTest(channel)
      .then((result) => {
        setTestResult(result);
        // A test post Slack took clears the broken channel on the server, one it refused may mark
        // it: show what the server now holds. Only the health is taken — a save may be in flight.
        return slackNotificationsService.getStatus().then(
          (status) =>
            setBrokenReason(
              brokenFrom((status.routes ?? []).find((each) => each.channel === channel))
            ),
          () => {}
        );
      })
      .catch((err: unknown) => toast.failure('send the test message', err))
      .finally(() => setTesting(false));
  };

  // The red line already says why when the refusal and the server's reason match.
  const failedHint =
    testResult && !testResult.ok && testResult.code !== brokenReason
      ? (testResult.hint ??
        TEST_HINTS[testResult.code] ??
        `Slack refused the message (${testResult.code}).`)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CHANNEL_TITLES[channel].title}</CardTitle>
        <CardDescription>{CHANNEL_TITLES[channel].description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isTeam && (
          <Alert variant="warning">
            <AlertDescription>
              Everyone in this Slack channel sees customer names and subjects from every team.
            </AlertDescription>
          </Alert>
        )}
        {brokenReason && (
          <p
            data-testid="slack-route-broken"
            role="alert"
            className="text-sm font-medium text-destructive"
          >
            {routeBrokenText(brokenReason)}
          </p>
        )}
        <div>
          <Select
            label="Slack channel"
            options={options}
            value={draft.slackChannelId}
            onChange={onPick}
            placeholder="Pick a channel"
            disabled={locked}
          />
          {picked && !picked.isMember && (
            <p className="mt-1 text-xs text-muted-foreground">{INVITE_HINT}</p>
          )}
          {!hasChannel && (
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a channel to start posting; the switches below are saved with it.
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-1 text-sm font-semibold">Alerts</h4>
          <div className="px-4 rounded-lg border border-border bg-card">
            {kindsForChannel(channel).map((kind) => (
              <SwitchRow
                key={kind}
                label={KIND_LABELS[kind] ?? kind}
                checked={draft.enabledKinds.includes(kind)}
                onChange={(on) => setKind(kind, on)}
                disabled={locked}
              />
            ))}
          </div>
        </div>

        {isTeam && (
          <div className="px-4 rounded-lg border border-border bg-card">
            <SwitchRow
              label="Include a short message preview (first 200 characters)"
              checked={draft.includePreview}
              onChange={(on) => persist({ ...draft, includePreview: on })}
              disabled={locked}
            />
          </div>
        )}

        {isTeam && departments && departments.length > 0 && (
          <div>
            <h4 className="mb-1 text-sm font-semibold">Teams posted here</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              This is one channel for the whole workspace: everyone in it sees the posts of every
              team switched on here.
            </p>
            <div className="px-4 rounded-lg border border-border bg-card">
              {departments.map((department) => (
                <SwitchRow
                  key={department.id}
                  label={department.name}
                  checked={!excluded.has(department.id)}
                  onChange={(on) => setDepartment(department.id, on)}
                  disabled={locked}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={sendTest}
            isLoading={testing}
            disabled={locked || !hasChannel}
          >
            Send test message
          </Button>
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
        {testResult?.ok && (
          <Alert variant="success">
            <AlertDescription>Test message sent. Check the channel in Slack.</AlertDescription>
          </Alert>
        )}
        {failedHint && (
          <Alert variant="danger">
            <AlertDescription>{failedHint}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

const PasteTokenForm = ({ onConnected }: { onConnected: () => void }) => {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    setBusy(true);
    setError(undefined);
    slackNotificationsService
      .connectWithToken(token.trim())
      .then(() => {
        setToken('');
        onConnected();
      })
      .catch((err: unknown) => setError(getApiErrorMessage(err) ?? 'Slack refused the token.'))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        Self-hosted? Paste a bot token
      </Button>
      {open && (
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-muted-foreground">
            Use this when your install&apos;s address is not registered with the Odly Slack app.
            Create a Slack app in your Slack workspace, add these bot token scopes:{' '}
            <code>{SLACK_BOT_SCOPES.join(', ')}</code>, install it, and paste its Bot User OAuth
            Token (it starts with xoxb-).
          </p>
          <Input
            type="password"
            label="Bot token"
            placeholder="xoxb-…"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            error={error}
            autoComplete="new-password"
          />
          <Button
            size="sm"
            onClick={submit}
            isLoading={busy}
            disabled={!token.trim().startsWith('xoxb-')}
          >
            Connect with this token
          </Button>
        </div>
      )}
    </div>
  );
};

const SlackNotificationsPanel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [channelList, setChannelList] = useState<SlackChannelList | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = () => {
    setLoadError(false);
    slackNotificationsService
      .getStatus()
      .then((next) => setStatus({ connection: next.connection ?? null, routes: next.routes ?? [] }))
      .catch(() => setLoadError(true));
  };

  useEffect(load, []);

  // Back from Slack: `?slack=connected` or `?slack=error&reason=<code>` (the BE callback).
  useEffect(() => {
    const outcome = searchParams.get('slack');
    if (!outcome) return;
    setReturnNotice(
      outcome === 'connected'
        ? { ok: true }
        : { ok: false, reason: searchParams.get('reason') ?? 'unknown' }
    );
    const next = new URLSearchParams(searchParams);
    next.delete('slack');
    next.delete('reason');
    setSearchParams(next, { replace: true });
    // Read once on arrival; the cleanup above changes searchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = status?.connection?.status === 'connected';
  useEffect(() => {
    if (!isConnected) return;
    setChannelsError(null);
    slackNotificationsService
      .listChannels()
      .then(setChannelList)
      .catch((err: unknown) =>
        setChannelsError(getApiErrorMessage(err) ?? 'The Slack channel list could not be loaded.')
      );
  }, [isConnected]);

  const connect = () => {
    setConnecting(true);
    slackNotificationsService
      .getConnectUrl()
      .then((url) => {
        if (url) {
          window.location.assign(url);
          return;
        }
        setConnecting(false);
        toast.error('Slack did not return a connect link. Try again.');
      })
      .catch((err: unknown) => {
        setConnecting(false);
        toast.failure('start the Slack connection', err);
      });
  };

  const disconnect = () => {
    slackNotificationsService
      .disconnect()
      .then(() => {
        setStatus({ connection: null, routes: [] });
        setChannelList(null);
        toast.success('Slack disconnected');
      })
      .catch((err: unknown) => toast.failure('disconnect Slack', err));
  };

  const connection = status?.connection ?? null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Slack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Post new work and workspace problems to two Slack channels: one for the team, one for
          admins.
        </p>
      </div>

      {returnNotice?.ok && (
        <Alert variant="success">
          <AlertDescription>
            Slack is connected. Pick a channel for each card below.
          </AlertDescription>
        </Alert>
      )}
      {returnNotice && !returnNotice.ok && (
        <Alert variant="danger">
          <AlertDescription>
            Slack did not connect ({returnNotice.reason}). Try again, or ask your Slack admin to
            allow the Odly app.
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="danger">
          <AlertDescription>The Slack settings could not be loaded.</AlertDescription>
          <Button variant="outline" size="sm" className="mt-2" onClick={load}>
            Retry
          </Button>
        </Alert>
      )}
      {!status && !loadError && <Spinner />}

      {status && !connection && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">Slack is not connected to this workspace.</p>
            <Button onClick={connect} isLoading={connecting}>
              Add to Slack
            </Button>
            <PasteTokenForm onConnected={load} />
          </CardContent>
        </Card>
      )}

      {connection && (
        <>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium">{connection.teamName}</span>
                  <Badge variant={isConnected ? 'success' : 'danger'}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                  Disconnect
                </Button>
              </div>
              {!isConnected && (
                <Alert variant="danger">
                  <AlertTitle>
                    Disconnected —{' '}
                    {BROKEN_REASONS[connection.brokenReason ?? ''] ??
                      connection.brokenReason ??
                      'Slack stopped accepting the connection'}
                    , reconnect
                  </AlertTitle>
                  <AlertDescription>
                    Nothing is posted to Slack until you connect again. Your channels and switches
                    are kept.
                  </AlertDescription>
                  <div className="mt-3 space-y-2">
                    <Button size="sm" onClick={connect} isLoading={connecting}>
                      Reconnect
                    </Button>
                    <PasteTokenForm onConnected={load} />
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>

          {channelsError && (
            <Alert variant="danger">
              <AlertDescription>{channelsError}</AlertDescription>
            </Alert>
          )}
          {channelList?.truncated && (
            <Alert variant="info">
              <AlertDescription>
                Only the first 2,000 channels are listed. If yours is missing, invite the Odly bot
                to it in Slack and reload this page.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {(['team', 'admin'] as const).map((channel) => (
              <ChannelCard
                key={channel}
                channel={channel}
                route={status?.routes.find((each) => each.channel === channel)}
                channelList={channelList}
                readOnly={!isConnected}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        onConfirm={() => {
          setConfirmDisconnect(false);
          disconnect();
        }}
        title="Disconnect Slack?"
        description="Odly stops posting to Slack and forgets the two channels and their switches. Messages already posted stay in Slack."
        confirmText="Disconnect"
      />
    </section>
  );
};

/** Workspace admins and global admins only; the backend's `requireOrgAdmin` is the authority. */
export const SlackNotificationsSettings = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';
  if (!isAdmin) return null;
  return <SlackNotificationsPanel />;
};
