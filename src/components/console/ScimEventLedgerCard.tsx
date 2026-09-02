import { Activity, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAllianceScimEvents } from '@/hooks/useAllianceProvisioning';
import type { AllianceScimEvent, AllianceScimTelemetry } from '@/services/alliance-scim.service';

/**
 * Connector event ledger card for the alliance Provisioning section — the read-only
 * "Activity" feed backed by GET .../scim/events (provision / deprovision / role change /
 * group wire / resync / last-admin warning), newest-first with a "Load more" cursor.
 *
 * 404-TOLERANT: the events query resolves a pre-ledger backend to `available:false`, and
 * this card then renders NOTHING — so the FE is safe to ship ahead of the BE reaching an
 * environment. The last-admin lockout banner is driven by OPTIONAL telemetry fields, so it
 * simply doesn't appear on an older backend either.
 */

const EVENT_LABEL: Record<string, string> = {
  user_provisioned: 'User provisioned',
  user_deprovisioned: 'User deprovisioned',
  user_reactivated: 'User reactivated',
  role_elevated: 'Role elevated',
  role_de_elevated: 'Role lowered',
  group_wired: 'Group access wired',
  group_pruned: 'IdP group dropped (provider stopped pushing it)',
  resync: 'Re-synced',
  provision_rejected: 'Provisioning rejected',
  seat_cap_rejected: 'Seat cap reached',
  last_admin_removed: 'Last admin removed',
};

const ACTOR_LABEL: Record<string, string> = { idp: 'IdP', admin: 'Admin', system: 'System' };

const eventLabel = (type: string): string => EVENT_LABEL[type] ?? type;
const actorLabel = (actor: string): string => ACTOR_LABEL[actor] ?? actor;
const roleShort = (role: string | null): string | null =>
  role === 'alliance_admin' ? 'admin' : role === 'alliance_agent' ? 'agent' : role;
const formatTime = (iso: string): string => new Date(iso).toLocaleString();

/** The identity a row is about — the affected user's email, else the IdP group. */
const eventTarget = (event: AllianceScimEvent): string | null =>
  event.targetEmail ?? event.idpGroupExternalId ?? null;

/** A human reason string the backend attached (e.g. why a provision was rejected). */
const eventReason = (event: AllianceScimEvent): string | null => {
  const reason = event.detail?.reason;
  return typeof reason === 'string' ? reason : null;
};

const EventRow = ({ event }: { event: AllianceScimEvent }) => {
  const warn = event.severity === 'warning';
  const before = roleShort(event.beforeRole);
  const after = roleShort(event.afterRole);
  const showTransition = before !== null && after !== null && before !== after;
  const target = eventTarget(event);
  const reason = eventReason(event);
  return (
    <li className="px-3 py-2 text-sm border-t border-border">
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
        <Badge variant={warn ? 'warning' : 'secondary'}>{eventLabel(event.eventType)}</Badge>
        {target && <span className="font-mono text-xs text-muted-foreground">{target}</span>}
        {showTransition && (
          <span className="inline-flex gap-1 items-center text-xs text-muted-foreground">
            {before}
            <ArrowRight className="w-3 h-3" />
            <strong className="text-foreground">{after}</strong>
          </span>
        )}
        {event.outcome !== 'success' && !reason && (
          <span className="text-xs capitalize text-muted-foreground">{event.outcome}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {actorLabel(event.actorType)} · {formatTime(event.createdAt)}
        </span>
      </div>
      {reason && <p className="mt-1 text-xs text-muted-foreground">{reason}</p>}
    </li>
  );
};

export const ScimEventLedgerCard = ({
  allianceId,
  telemetry,
}: {
  allianceId: number | null;
  telemetry?: AllianceScimTelemetry;
}) => {
  const query = useAllianceScimEvents(allianceId);
  const pages = query.data?.pages ?? [];
  const available = pages.length === 0 ? true : pages[0].available;
  const events = pages.flatMap((page) => page.events);

  // 404-tolerant: a backend without the ledger endpoint → hide the card entirely.
  if (!query.isLoading && !available) {
    return null;
  }

  const orphaned = telemetry?.admins?.hasActiveAdmin === false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Activity className="w-5 h-5 text-primary" />
          Activity
        </CardTitle>
        <CardDescription>
          A log of what the SCIM connector did — provisioning, role changes, group wiring and
          re-syncs — newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {orphaned && (
          <Alert variant="danger">
            <div className="flex gap-2 items-start">
              <ShieldAlert className="mt-0.5 w-4 h-4 shrink-0" />
              <span className="text-sm">
                <strong>No active alliance admin.</strong> The identity provider deprovisioned the
                last admin, so no one can administer this alliance until an admin is restored — add
                one to the mapped admin group in your IdP, or promote a member here.
              </span>
            </div>
          </Alert>
        )}

        {query.isError ? (
          <Alert variant="danger">
            <div className="flex gap-3 justify-between items-center">
              <span className="text-sm">Couldn&apos;t load connector activity.</span>
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : query.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading activity…</p>
        ) : events.length === 0 ? (
          <div className="flex gap-2 items-center py-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No connector activity yet. Provisioning events will appear here once your IdP syncs.
          </div>
        ) : (
          <>
            <ul className="rounded-md border border-border">
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
            {query.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void query.fetchNextPage()}
                  isLoading={query.isFetchingNextPage}
                  disabled={query.isFetchingNextPage}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
