import { Activity } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import type { AllianceScimTelemetry } from '@/services/alliance-scim.service';

/**
 * Read-only SCIM provisioning telemetry card (GET .../scim/telemetry) for the alliance
 * Provisioning section: token + group counts, last-activity timestamps, config flags, and
 * the BE's informational `notes`. Extracted from ConsoleProvisioning so that page stays
 * under the max-lines lint budget.
 */

/**
 * How the connector's liveness reads on the card. `stale` and `no_token` are the two
 * that mean "provisioning has stopped and nothing else on this page would tell you".
 */
const CONNECTOR_COPY: Record<string, { label: string; warn: boolean; detail: string }> = {
  disabled: { label: 'SCIM disabled', warn: false, detail: 'SCIM is off for this alliance.' },
  no_token: {
    label: 'No active token',
    warn: true,
    detail: 'SCIM is on but no active token exists, so the IdP cannot authenticate. Mint one.',
  },
  never_used: {
    label: 'Never connected',
    warn: true,
    detail: 'A token exists but has never been used — the IdP has not been pointed at it yet.',
  },
  active: { label: 'Connector active', warn: false, detail: '' },
  stale: {
    label: 'Connector silent',
    warn: true,
    detail: 'The IdP has not authenticated recently. Provisioning may have stopped: check the connector in your IdP.',
  },
};

/** Format a telemetry timestamp (ISO or null) as a locale string, or "Never". */
const formatTelemetryTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : 'Never';

export const ScimTelemetryCard = ({ telemetry }: { telemetry: AllianceScimTelemetry }) => {
  // A BE without this field (older than the FE) simply renders no connector row.
  const connector = telemetry.connector ? CONNECTOR_COPY[telemetry.connector.state] : undefined;

  return (
  <Card>
    <CardHeader>
      <CardTitle className="flex gap-2 items-center">
        <Activity className="w-5 h-5 text-primary" />
        Provisioning status
      </CardTitle>
      <CardDescription>
        A read-only snapshot of this alliance&apos;s SCIM tokens, group mappings and last activity.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="p-3 space-y-1 rounded-md border border-border">
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            Tokens
          </p>
          <p className="text-sm text-foreground">
            <strong>{telemetry.tokens.active}</strong> active
            <span className="text-muted-foreground">
              {' '}
              · {telemetry.tokens.total} total · {telemetry.tokens.revoked} revoked
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Last used: {formatTelemetryTime(telemetry.tokens.lastUsedAt)}
          </p>
        </div>
        <div className="p-3 space-y-1 rounded-md border border-border">
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            Groups
          </p>
          <p className="text-sm text-foreground">
            {/* ⛔ This said "mapped". It counts rows in `alliance_scim_groups` — every group
                the IdP has PUSHED — and says nothing about how many are wired to a role.
                On taco it read "10 mapped" while exactly one was wired, so the card
                reported the wiring as finished. */}
            <strong>{telemetry.groups.total}</strong> synced from IdP
            <span className="text-muted-foreground">
              {' '}
              · {telemetry.groups.memberships} memberships
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Last group push: {formatTelemetryTime(telemetry.groups.lastSyncedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant={telemetry.config.enabled ? 'success' : 'secondary'}>
          {telemetry.config.enabled ? 'SCIM enabled' : 'SCIM disabled'}
        </Badge>
        <Badge variant={telemetry.config.allowScimAccountLinking ? 'default' : 'secondary'}>
          Account linking {telemetry.config.allowScimAccountLinking ? 'on' : 'off'}
        </Badge>
        {connector && (
          <Badge variant={connector.warn ? 'secondary' : 'success'}>{connector.label}</Badge>
        )}
      </div>

      {(telemetry.skippedMembers?.total ?? 0) > 0 && (
        <Alert variant="warning">
          <p className="text-sm">
            <strong>
              {telemetry.skippedMembers?.total} member
              {telemetry.skippedMembers?.total === 1 ? '' : 's'} left out of a group.
            </strong>{' '}
            Your IdP added them to a group here, but they have no account in this alliance, so
            they were not added and have no access. Provision them first, then re-push the
            group. A failed user push shows as &quot;Provisioning rejected&quot; in Activity.
          </p>
          {telemetry.skippedMembers?.emails.length ? (
            <p className="mt-1 text-sm break-words">{telemetry.skippedMembers.emails.join(', ')}</p>
          ) : null}
        </Alert>
      )}

      {connector?.warn && (
        <Alert variant="warning">
          <p className="text-sm">
            <strong>{connector.label}.</strong> {connector.detail}
            {typeof telemetry.connector?.hoursSinceLastUse === 'number' && (
              <>
                {' '}
                Last authenticated {telemetry.connector.hoursSinceLastUse}h ago; the console
                calls it silent after {telemetry.connector.staleAfterHours}h.
              </>
            )}
          </p>
        </Alert>
      )}

      {telemetry.notes.length > 0 && (
        <Alert variant="info">
          <ul className="space-y-1 text-sm list-disc list-inside">
            {telemetry.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Alert>
      )}
    </CardContent>
  </Card>
);
};
