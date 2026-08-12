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

/** Format a telemetry timestamp (ISO or null) as a locale string, or "Never". */
const formatTelemetryTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : 'Never';

export const ScimTelemetryCard = ({ telemetry }: { telemetry: AllianceScimTelemetry }) => (
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
            <strong>{telemetry.groups.total}</strong> mapped
            <span className="text-muted-foreground">
              {' '}
              · {telemetry.groups.memberships} memberships
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Last synced: {formatTelemetryTime(telemetry.groups.lastSyncedAt)}
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
      </div>

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
