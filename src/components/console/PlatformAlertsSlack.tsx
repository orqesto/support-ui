import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { SecretField } from '@/components/console/platformDefaults/SecretField';
import { ThresholdsCard } from '@/components/console/PlatformAlertsThresholds';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import {
  useClearPlatformSecret,
  usePlatformSettings,
  useSetPlatformSecret,
} from '@/hooks/usePlatformSettings';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import type { PlatformSecretKey, SecretStatus } from '@/services/platformSettings.service';
import {
  fillPlatformThresholds,
  PLATFORM_SLACK_SIGNALS,
  platformSlackAlertsService,
  SLACK_BOT_SCOPES,
  type PlatformSlackConnection,
  type PlatformSlackSignal,
  type PlatformSlackStatus,
  type SlackChannelList,
  type SlackTestResult,
} from '@/services/slackNotifications.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Admin console › Platform › Alerts (global admins only): this deployment's own health alerts in
 * one Slack channel. The Slack app credentials (client id and secret, stored as platform secrets
 * and shown only by their last four characters), the connection, the channel, a switch per signal
 * and the thresholds. Each card saves on its own, one save at a time, and afterwards shows what
 * the server holds: the returned settings on success, a fresh read on failure.
 */

const SIGNAL_LABELS: Record<PlatformSlackSignal, string> = {
  cpu: 'Container CPU sustained high',
  memory: 'Memory near its budget',
  db_pool: 'Database connection pool saturated',
  db_health: 'Database unreachable or slow',
  event_loop: 'Event-loop lag',
  rate_429: 'Requests rejected by the rate limiter',
  queue_stall: 'Queue stalled',
  queue_backlog: 'Queue backlog growing',
  disk: 'Disk usage',
  platform_ai_key: 'Platform shared AI key failing',
  process_start: 'API or worker process started or unhealthy',
};

const UNSET_SECRET: SecretStatus = { configured: false, source: 'none', last4: null };

/** Used when the backend sends a code without its own hint. */
const TEST_HINTS: Record<string, string> = {
  not_in_channel:
    'The Odly bot is not in that channel. In Slack, open the channel and type /invite @Odly, then try again.',
  channel_not_found:
    'That channel no longer exists, or the bot cannot see it. Pick another channel.',
  is_archived: 'That channel is archived. Pick another channel.',
};

/**
 * Ruling S: why platform posts stopped, in words (other codes shown raw). The delivery marks the
 * platform connection broken on ANY permanent code, so the channel codes appear here too.
 */
const BROKEN_REASONS: Record<string, string> = {
  token_revoked: 'the Slack app was removed from your Slack workspace',
  account_inactive: 'the Slack app was removed from your Slack workspace',
  invalid_auth: 'Slack no longer accepts the token',
  missing_scope: 'the Slack app is missing a permission',
};

/**
 * A refusal by the CHANNEL, not the token: the token still lists channels and posts a test, so the
 * fix is the channel card (re-pick or test), never a reconnect — a reconnect only clears the mark
 * until the next alert breaks it again.
 */
const CHANNEL_REASONS: Record<string, string> = {
  not_in_channel:
    'Odly was removed from the alert channel — type /invite @Odly in Slack, then send a test message',
  channel_not_found: 'The alert channel no longer exists or was archived — pick another channel',
  is_archived: 'The alert channel no longer exists or was archived — pick another channel',
};

// ─── Channel and signals ─────────────────────────────────────────────────────

const ChannelAndSignalsCard = ({
  status,
  channelList,
  connected,
  onConnection,
}: {
  status: PlatformSlackStatus;
  channelList: SlackChannelList | null;
  connected: boolean;
  /** The connection as the server now reports it (a channel save or a test post may clear it). */
  onConnection: (connection: PlatformSlackConnection | null) => void;
}) => {
  const [channel, setChannel] = useState({
    id: status.settings.slackChannelId ?? '',
    name: status.settings.slackChannelName,
  });
  const [signals, setSignals] = useState<PlatformSlackSignal[]>(status.settings.enabledSignals);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SlackTestResult | null>(null);
  const hasChannel = channel.id !== '';

  const apply = (next: PlatformSlackStatus) => {
    setChannel({ id: next.settings.slackChannelId ?? '', name: next.settings.slackChannelName });
    setSignals(next.settings.enabledSignals);
    onConnection(next.connection);
  };

  const persist = (body: Parameters<typeof platformSlackAlertsService.saveSettings>[0]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setTestResult(null);
    platformSlackAlertsService
      .saveSettings(body)
      .then(apply)
      .catch(async (err: unknown) => {
        toast.failure('save the platform alert settings', err);
        await platformSlackAlertsService
          .getStatus()
          .then(apply)
          .catch((readErr: unknown) =>
            toast.failure('read the saved settings — reload the page', readErr)
          );
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
  if (hasChannel && !options.some((option) => option.value === channel.id)) {
    options.unshift({ value: channel.id, label: `#${channel.name ?? channel.id}` });
  }
  const picked = channelList?.channels.find((chan) => chan.id === channel.id);

  const onPick = (slackChannelId: string) => {
    if (!slackChannelId || savingRef.current) return;
    const found = channelList?.channels.find((chan) => chan.id === slackChannelId);
    setChannel({ id: slackChannelId, name: found?.name });
    persist({ slackChannelId, slackChannelName: found?.name ?? slackChannelId });
  };

  const setSignal = (signal: PlatformSlackSignal, on: boolean) => {
    if (savingRef.current) return;
    const enabled = new Set(signals);
    if (on) enabled.add(signal);
    else enabled.delete(signal);
    const next = PLATFORM_SLACK_SIGNALS.filter((each) => enabled.has(each));
    setSignals(next);
    persist({ enabledSignals: next });
  };

  const sendTest = () => {
    setTesting(true);
    setTestResult(null);
    platformSlackAlertsService
      .sendTest()
      .then((result) => {
        setTestResult(result);
        // A test post Slack took clears a broken platform connection on the server: show that.
        return platformSlackAlertsService.getStatus().then(
          (next) => onConnection(next.connection),
          () => {}
        );
      })
      .catch((err: unknown) => toast.failure('send the test message', err))
      .finally(() => setTesting(false));
  };

  const failedHint =
    testResult && !testResult.ok
      ? (testResult.hint ??
        TEST_HINTS[testResult.code] ??
        `Slack refused the message (${testResult.code}).`)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Channel and signals</CardTitle>
        <CardDescription>
          Each signal is checked by every API and worker process; a post names the host and the
          role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && (
          <div>
            <Select
              label="Slack channel"
              options={options}
              value={channel.id}
              onChange={onPick}
              placeholder="Pick a channel"
              disabled={saving}
            />
            {picked && !picked.isMember && (
              <p className="mt-1 text-xs text-muted-foreground">
                Private channel? Type /invite @Odly in Slack.
              </p>
            )}
            {!hasChannel && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing is posted to Slack until a channel is picked.
              </p>
            )}
          </div>
        )}

        <div className="px-4 rounded-lg border border-border bg-card">
          {PLATFORM_SLACK_SIGNALS.map((signal) => (
            <div
              key={signal}
              className="flex gap-4 justify-between items-center py-2 border-b border-border last:border-0"
            >
              <p className="text-sm">{SIGNAL_LABELS[signal]}</p>
              <Toggle
                checked={signals.includes(signal)}
                onChange={(on) => setSignal(signal, on)}
                ariaLabel={SIGNAL_LABELS[signal]}
                disabled={saving}
              />
            </div>
          ))}
        </div>

        {connected && (
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={sendTest}
              isLoading={testing}
              disabled={saving || !hasChannel}
            >
              Send test message
            </Button>
            {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          </div>
        )}
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

// ─── Slack app credentials ───────────────────────────────────────────────────

const CredentialsCard = () => {
  const { data: settings, isError } = usePlatformSettings();
  const setSecret = useSetPlatformSecret();
  const clearSecret = useClearPlatformSecret();
  const statusOf = (key: PlatformSecretKey) => settings?.secrets[key] ?? UNSET_SECRET;

  const field = (key: PlatformSecretKey, label: string) => (
    <SecretField
      label={label}
      status={statusOf(key)}
      onSave={(value, options) => setSecret.mutateAsync({ key, value, force: options?.force })}
      onClear={() => clearSecret.mutate(key)}
      saving={setSecret.isPending}
      clearing={clearSecret.isPending}
      disabled={!settings}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slack app credentials</CardTitle>
        <CardDescription>
          The client ID and client secret of the Odly notifications Slack app (Slack › Your apps ›
          Basic Information). &quot;Add to Slack&quot; on this page and in every workspace&apos;s
          settings uses them. A saved value is never shown again, only its last four characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <Alert variant="danger">
            <AlertDescription>The stored credentials could not be read.</AlertDescription>
          </Alert>
        )}
        {field('slack.client_id', 'Client ID')}
        {field('slack.client_secret', 'Client secret')}
      </CardContent>
    </Card>
  );
};

// ─── Connection ──────────────────────────────────────────────────────────────

const PasteTokenForm = ({ onConnected }: { onConnected: (next: PlatformSlackStatus) => void }) => {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    setBusy(true);
    setError(undefined);
    platformSlackAlertsService
      .connectWithToken(token.trim())
      .then((next) => {
        setToken('');
        onConnected(next);
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
            Use this when this server&apos;s address is not registered with the Slack app. Create a
            Slack app in your Slack workspace, add these bot token scopes:{' '}
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

const PlatformAlertsPanel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<PlatformSlackStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [channelList, setChannelList] = useState<SlackChannelList | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = () => {
    setLoadError(false);
    platformSlackAlertsService
      .getStatus()
      .then(setStatus)
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

  const connection = status?.connection ?? null;
  const isConnected = connection?.status === 'connected';
  const isBroken = connection?.status === 'broken';
  const brokenReason = isBroken ? (connection.brokenReason ?? null) : null;
  // A channel refusal leaves the token working: the channel can be re-picked or tested to clear it.
  const channelBroken = brokenReason !== null && brokenReason in CHANNEL_REASONS;
  const tokenWorks = isConnected || channelBroken;
  const setConnection = (next: PlatformSlackConnection | null) =>
    setStatus((current) => (current ? { ...current, connection: next } : current));
  useEffect(() => {
    if (!tokenWorks) return;
    setChannelsError(null);
    platformSlackAlertsService
      .listChannels()
      .then(setChannelList)
      .catch((err: unknown) =>
        setChannelsError(getApiErrorMessage(err) ?? 'The Slack channel list could not be loaded.')
      );
  }, [tokenWorks]);

  const connect = () => {
    setConnecting(true);
    platformSlackAlertsService
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
    platformSlackAlertsService
      .disconnect()
      .then(() => {
        setChannelList(null);
        toast.success('Slack disconnected');
        load();
      })
      .catch((err: unknown) => toast.failure('disconnect Slack', err));
  };

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Alerts"
        description="This server's health alerts in one Slack channel: CPU, memory, database, queues, disk, rate limiting and process restarts."
      />

      {returnNotice?.ok && (
        <Alert variant="success">
          <AlertDescription>Slack is connected. Pick a channel below.</AlertDescription>
        </Alert>
      )}
      {returnNotice && !returnNotice.ok && (
        <Alert variant="danger">
          <AlertDescription>
            Slack did not connect ({returnNotice.reason}). Check the client ID and secret, then try
            again.
          </AlertDescription>
        </Alert>
      )}

      <CredentialsCard />

      {loadError && (
        <Alert variant="danger">
          <AlertDescription>The alert settings could not be loaded.</AlertDescription>
          <Button variant="outline" size="sm" className="mt-2" onClick={load}>
            Retry
          </Button>
        </Alert>
      )}
      {!status && !loadError && <Spinner />}

      {status && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Slack connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {connection ? (
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex gap-2 items-center">
                    <span className="text-sm font-medium">
                      {connection.teamName ?? 'Slack workspace'}
                    </span>
                    <Badge variant={isBroken ? 'danger' : 'success'}>
                      {channelBroken
                        ? 'Channel not reachable'
                        : isBroken
                          ? 'Disconnected'
                          : 'Connected'}
                    </Badge>
                    {connection.source === 'env' && (
                      <Badge variant="secondary">Set in the server environment</Badge>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </Button>
                </div>
              ) : null}
              {connection && channelBroken && (
                <Alert variant="danger">
                  <AlertTitle>
                    <span data-testid="platform-slack-broken">{CHANNEL_REASONS[brokenReason]}</span>
                  </AlertTitle>
                  <AlertDescription>
                    Nothing is posted to Slack until the channel works again; the alert email
                    address set on the server still receives the alerts. Fix it in Channel and
                    signals below.
                  </AlertDescription>
                </Alert>
              )}
              {connection && isBroken && !channelBroken && (
                <Alert variant="danger">
                  <AlertTitle>
                    <span data-testid="platform-slack-broken">
                      Disconnected —{' '}
                      {BROKEN_REASONS[brokenReason ?? ''] ??
                        brokenReason ??
                        'Slack stopped accepting the connection'}
                      , reconnect
                    </span>
                  </AlertTitle>
                  <AlertDescription>
                    Nothing is posted to Slack until this is fixed; the alert email address set on
                    the server still receives the alerts. Signals and thresholds are kept.
                  </AlertDescription>
                  <div className="mt-3 space-y-2">
                    <Button size="sm" onClick={connect} isLoading={connecting}>
                      Reconnect
                    </Button>
                    <PasteTokenForm onConnected={setStatus} />
                  </div>
                </Alert>
              )}
              {!connection && (
                <>
                  <p className="text-sm">
                    Slack is not connected, so nothing is posted to Slack. The alert email address
                    set on the server still receives the alerts it always did.
                  </p>
                  <Button onClick={connect} isLoading={connecting}>
                    Add to Slack
                  </Button>
                  <PasteTokenForm onConnected={setStatus} />
                </>
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

          {/* Keyed on the connection so a reconnect starts the cards from the server again. */}
          <ChannelAndSignalsCard
            key={`${connection?.teamName ?? 'none'}-${status.settings.slackChannelId ?? ''}`}
            status={status}
            channelList={channelList}
            connected={tokenWorks}
            onConnection={setConnection}
          />
          <ThresholdsCard thresholds={fillPlatformThresholds(status.settings.thresholds)} />
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
        description={
          connection?.source === 'env'
            ? 'The token set in the server environment stays in effect; only a token saved here is removed, with the channel. Signals and thresholds are kept.'
            : 'Platform alerts stop posting to Slack and the channel is forgotten. Signals and thresholds are kept. Messages already posted stay in Slack.'
        }
        confirmText="Disconnect"
      />
    </div>
  );
};

/** Global admins only (user role `admin`); the backend's `requireGlobalAdmin` is the authority. */
export const PlatformAlertsSlack = () => {
  const user = useAuthStore((state) => state.user);
  if (user?.role !== 'admin') return null;
  return <PlatformAlertsPanel />;
};
