import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, ArrowRight, ShieldAlert, UserCog } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAllianceScimEvents } from '@/hooks/useAllianceProvisioning';
import { usePermissions } from '@/hooks/usePermissions';
import { platformService } from '@/services/platform.service';
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
  // Members the IdP named in a group push that are not provisioned into this alliance,
  // so they were left out of the group. Without a label this renders as the raw event
  // type (`eventLabel` falls back to the string), so it ships with the BE that emits it.
  group_member_skipped: 'Group members skipped',
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

/**
 * Is this rejection the one a platform-admin role causes, and can it be acted on here?
 *
 * ⛔ Matched on the REASON the backend wrote, not on the event type: `provision_rejected`
 * covers every refusal (uniqueness, seat cap), and only this one is resolved by a role change.
 * The backend owns the sentence; this reads the two words it is keyed on.
 *
 * `targetUserId` is required because the remedy has to name an account — rejection rows
 * recorded before support-service#642 carry `null`, and those simply get no button rather than
 * a broken one.
 */
export const platformAdminBlock = (
  event: AllianceScimEvent
): { userId: number; email: string } | null => {
  if (event.eventType !== 'provision_rejected') return null;
  const reason = event.detail?.reason;
  if (typeof reason !== 'string' || !reason.includes('platform administrator')) return null;
  if (typeof event.targetUserId !== 'number' || event.targetUserId <= 0) return null;
  return { userId: event.targetUserId, email: event.targetEmail ?? `user #${event.targetUserId}` };
};

const EventRow = ({
  event,
  onResolveAdminBlock,
}: {
  event: AllianceScimEvent;
  onResolveAdminBlock: (target: { userId: number; email: string }) => void;
}) => {
  const { isAdmin } = usePermissions();
  const warn = event.severity === 'warning';
  // The remedy the message already names, offered where the failure is READ. Without it the
  // operator is told to go to another screen and find an account by hand — which is how one
  // customer's account stayed blocked for 17 days across 39 rejected pushes.
  const adminBlock = isAdmin ? platformAdminBlock(event) : null;
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
      {adminBlock && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => onResolveAdminBlock(adminBlock)}
        >
          <UserCog className="mr-1.5 w-3.5 h-3.5" />
          Change platform role to User
        </Button>
      )}
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
  const [adminBlockTarget, setAdminBlockTarget] = useState<{
    userId: number;
    email: string;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
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
                <EventRow key={event.id} event={event} onResolveAdminBlock={setAdminBlockTarget} />
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
      {/*
        Demoting a platform admin is a real change with a blast radius, so it is confirmed and
        the consequence is spelled out — including the part the button CANNOT do, which is
        re-run the IdP's push. Saying "now re-push" is what makes this a remedy rather than a
        half-step the operator has to guess the end of.
      */}
      <ConfirmDialog
        open={adminBlockTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAdminBlockTarget(null);
        }}
        title="Change platform role to User?"
        description={
          adminBlockTarget
            ? `${adminBlockTarget.email} is a platform administrator, which is why your identity provider cannot provision them. Changing their platform role to User lets SCIM manage the account. They keep their workspace access; they lose platform-wide administration. Re-push from your IdP afterwards — this does not retry it for you.`
            : ''
        }
        confirmText={resolving ? 'Changing…' : 'Change to User'}
        onConfirm={() => {
          if (!adminBlockTarget || resolving) return;
          setResolving(true);
          void (async () => {
            try {
              await platformService.updateUserRole(adminBlockTarget.userId, 'user');
              toast.success(
                `${adminBlockTarget.email} is now a User. Re-push them from your IdP to provision them.`
              );
              setAdminBlockTarget(null);
              await query.refetch();
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : 'Could not change the platform role.'
              );
            } finally {
              setResolving(false);
            }
          })();
        }}
      />
    </Card>
  );
};
