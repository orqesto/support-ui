import { useCallback, useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { customApiService, type CustomApiConnection } from '@/services/customApi.service';
import { getApiErrorMessage } from '@/lib/errorMessages';

/**
 * Settings → Integrations → Custom APIs — the vendor list (CA-5 Task 1).
 *
 * ⛔ THIS EXISTS SO A CLIENT CAN DO THIS THEMSELVES. CA-1 to CA-3 shipped a working feature that
 * no admin could configure without hand-POSTing JSON, which is what "merged but unusable" meant.
 * ⚠️ That sentence used to say an admin STILL cannot — true when this file was written, false
 * since Task 2 mounted the section and added the forms. A comment describing the world before
 * the change is one the next reader believes. (Audit pass 16.)
 *
 * ⛔ NO CREDENTIAL IS RENDERED ANYWHERE — not masked, not partially. The API returns
 * `hasCredential: boolean` and no key, so the UI shows whether one is set and nothing more.
 */

interface Props {
  /** Whether this viewer may create or delete a VENDOR (D40: org_admin, not merely moderator). */
  canManageVendors: boolean;
  onAddVendor?: () => void;
  onOpenVendor?: (connection: CustomApiConnection) => void;
  /**
   * ⛔ NOT gated on `canManageVendors` (D40). The LOOKUPS are the half a moderator owns — anyone
   * who can see this section may add and edit them under a vendor that already exists.
   */
  onAddLookup?: (connection: CustomApiConnection) => void;
  onEditLookup?: (
    connection: CustomApiConnection,
    endpoint: CustomApiConnection['endpoints'][number]
  ) => void;
}

/**
 * What the admin is about to remove, held while the confirm dialog is open.
 *
 * ⛔ The ENTIRE object, not an id. A list that refreshes under an open dialog would otherwise
 * leave the id pointing at a different row, and this dialog names what it is about to delete —
 * naming the wrong thing is worse than naming nothing.
 */
type PendingRemoval =
  | { kind: 'vendor'; connection: CustomApiConnection }
  | {
      kind: 'lookup';
      connection: CustomApiConnection;
      endpoint: CustomApiConnection['endpoints'][number];
    };

/**
 * What state a lookup is really in.
 *
 * ⛔ THE CONNECTION'S FLAG WINS (S4). An endpoint enabled under a disabled connection is inert, and
 * the backend already says so in `effectivelyEnabled` — rendering the endpoint's own `enabled`
 * would put a green badge on a dead lookup, which is worse than showing nothing.
 */
const lookupState = (
  endpoint: CustomApiConnection['endpoints'][number]
): { label: string; variant: 'success' | 'warning' | 'secondary' | 'danger' } => {
  if (endpoint.chainBroken) return { label: 'Needs attention', variant: 'danger' };
  if (!endpoint.effectivelyEnabled) return { label: 'Off', variant: 'secondary' };
  // Never tested means we have never seen this vendor's response, so no fields can have been
  // picked from it — a distinct state from "on and working", and the one an admin must act on.
  if (!endpoint.hasResponseSkeleton) return { label: 'Not tested yet', variant: 'warning' };
  if (!endpoint.fieldPaths?.length) return { label: 'No fields chosen', variant: 'warning' };
  // ⛔ A PASTED SAMPLE PROVES THE SHAPE, NOT THE CALL. Both routes fill the skeleton, so badging
  // "Ready" off `hasResponseSkeleton` alone told an admin a lookup was working when its live call
  // returned no_match — seen on staging during the CA-5 acceptance run, 2026-09-19.
  // ⚠️ `null` means the skeleton predates the column: unknown, so it keeps the plain badge rather
  // than being accused of being a paste.
  if (endpoint.skeletonSource === 'sample') {
    return { label: 'Ready — not tested live', variant: 'warning' };
  }
  return { label: 'Ready', variant: 'success' };
};

export const CustomApiSettings = ({
  canManageVendors,
  onAddVendor,
  onOpenVendor,
  onAddLookup,
  onEditLookup,
}: Props) => {
  const [connections, setConnections] = useState<CustomApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  /**
   * WHICH row is being removed, not merely THAT one is.
   *
   * ⛔ A single boolean relabelled EVERY Disconnect and EVERY Remove on the page "Removing…" while
   * any one removal was in flight — a row saying it is being deleted when it is not. Same defect
   * class as the "Ready" badge this feature shipped with: the words outran what the data said.
   * Disabling stays global (one removal at a time is the safe rule); only the LABEL is targeted.
   */
  const [inFlight, setInFlight] = useState<PendingRemoval | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConnections(await customApiService.list());
    } catch (err) {
      // Show what the backend said — a hardcoded string throws away a reason the admin can act on.
      setError(getApiErrorMessage(err) ?? 'Could not load your connected systems.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Remove a vendor or a lookup, then RELOAD rather than splicing local state — the backend
   * refuses some deletions (a lookup another one checks ownership against answers 409), so the
   * list must come back from the server rather than from an assumption about what happened.
   */
  const confirmRemoval = async () => {
    if (!pending) return;
    setInFlight(pending);
    setError(null);
    try {
      if (pending.kind === 'vendor') {
        await customApiService.remove(pending.connection.id);
      } else {
        await customApiService.removeEndpoint(pending.connection.id, pending.endpoint.id);
      }
      setPending(null);
      await load();
    } catch (err) {
      /**
       * ⛔ SHOW WHAT THE BACKEND SAID. Deleting a lookup that another one uses for its ownership
       * check is refused with a 409 naming the dependants — an admin can act on that sentence,
       * and cannot act on "could not remove".
       */
      setError(getApiErrorMessage(err) ?? 'Could not remove that.');
      setPending(null);
    } finally {
      setInFlight(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Your systems</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect the system where your orders, shipments or bookings live, so agents can answer
            without leaving Odly.
          </p>
        </div>
        {canManageVendors && (
          <Button size="sm" onClick={onAddVendor}>
            Connect a system
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite">
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {connections.length === 0 && !error && (
        /*
         * The empty state explains what this IS in the client's terms. "No custom APIs configured"
         * describes our data model back at someone who came here to solve a support problem.
         */
        <Card padding="md" className="text-center space-y-2">
          <Plug className="h-5 w-5 mx-auto text-muted-foreground" aria-hidden />
          <p className="text-sm text-foreground">Nothing connected yet</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            When a customer asks “where is my order?”, an agent has to go and look it up somewhere
            else. Connect that system here and the answer appears in the conversation.
          </p>
          {canManageVendors ? (
            <Button size="sm" onClick={onAddVendor}>
              Connect a system
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              An organisation admin can connect one for your workspace.
            </p>
          )}
        </Card>
      )}

      {connections.map((connection) => (
        <Card key={connection.id} padding="md" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{connection.name}</p>
                {!connection.enabled && <Badge variant="secondary">Off</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">{connection.baseUrl}</p>
              {/*
               * D42, and the reason it is SHOWN rather than only stored: a workspace has to be
               * able to tell which of its vendors a person actually accepted. Audit pass 3 — the
               * column existed, the API returned it, and nothing rendered it, so a connection
               * created before the column looked identical to one a client had signed off.
               * ⛔ NULL is never dressed up as consent. It says what is true: nobody recorded one.
               */}
              <p className="text-xs text-muted-foreground mt-1">
                {connection.piiAcknowledgedAt
                  ? `Third-party data accepted ${new Date(connection.piiAcknowledgedAt).toLocaleDateString()}`
                  : // ⛔ STATE, NOT HISTORY (audit pass 6). This used to read "set up before we
                    // started recording…", which is a claim about WHEN — and it is false in the
                    // skew case this repo ships by design: a frontend deployed ahead of its
                    // backend sends `piiAcknowledged`, an older backend STRIPS the unknown key,
                    // and a vendor accepted ten seconds ago comes back with nothing recorded.
                    // Saying what is true now covers both that vendor and the genuinely old ones.
                    'No recorded acceptance of third-party data'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {/* ⛔ Whether a key is SET — never the key, and never a masked stand-in for it. */}
                {connection.hasCredential ? 'API key set' : 'No API key'}
                {connection.scopeMode === 'departments' &&
                  ` · ${connection.departmentIds.length} department${connection.departmentIds.length === 1 ? '' : 's'}`}
              </p>
            </div>
            {/*
             * ⛔ ONLY WHEN THERE IS SOMEWHERE TO GO. This button used to render unconditionally
             * with an optional handler behind it, which was invisible while nothing mounted this
             * component — and would have shipped as a button that does nothing for a moderator
             * the moment it was mounted (CA-5 Task 2).
             */}
            {onOpenVendor && (
              <Button size="sm" variant="outline" onClick={() => onOpenVendor(connection)}>
                {canManageVendors ? 'Manage' : 'View lookups'}
              </Button>
            )}
            {/*
             * ⛔ D40: removing a VENDOR is an org_admin action, like creating one — a moderator owns
             * the lookups, not the connection that holds the credential. ⚠️ The real guard is the
             * request (`requireOrgAdmin`); this only decides whether to offer the action.
             */}
            {canManageVendors && (
              <Button
                size="sm"
                variant="ghost"
                /*
                 * ⛔ DISABLED WHILE ANY REMOVAL IS IN FLIGHT. The confirm dialog closes the instant
                 * it is pressed, so without this the row still looks idle and a second press fires
                 * a second DELETE — the first succeeds, the second 404s, and the admin is told
                 * "could not remove" about something that was removed.
                 */
                disabled={inFlight !== null}
                onClick={() => setPending({ kind: 'vendor', connection })}
              >
                {inFlight?.kind === 'vendor' && inFlight.connection.id === connection.id
                  ? 'Removing…'
                  : 'Disconnect'}
              </Button>
            )}
          </div>

          {connection.endpoints.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No lookups yet — add one to choose what agents can find here.
              </p>
              {onAddLookup && (
                <Button size="sm" variant="outline" onClick={() => onAddLookup(connection)}>
                  Add a lookup
                </Button>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {connection.endpoints.map((endpoint) => {
                const state = lookupState(endpoint);
                return (
                  <li key={endpoint.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground truncate">{endpoint.label}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={state.variant}>{state.label}</Badge>
                      {onEditLookup && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEditLookup(connection, endpoint)}
                        >
                          Edit
                        </Button>
                      )}
                      {/* ⛔ NOT gated on canManageVendors (D40): the lookups are a moderator's half. */}
                      {onEditLookup && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={inFlight !== null}
                          onClick={() => setPending({ kind: 'lookup', connection, endpoint })}
                        >
                          {inFlight?.kind === 'lookup' && inFlight.endpoint.id === endpoint.id
                            ? 'Removing…'
                            : 'Remove'}
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {connection.endpoints.length > 0 && onAddLookup && (
            <Button size="sm" variant="outline" onClick={() => onAddLookup(connection)}>
              Add a lookup
            </Button>
          )}
        </Card>
      ))}

      {/*
       * ⛔ NAME WHAT GOES, AND WHAT GOES WITH IT. Disconnecting a vendor takes its lookups and its
       * stored key with it; "are you sure?" leaves an admin to discover that afterwards. The
       * lookup count is read from the connection being removed, so the sentence is true of THIS
       * vendor rather than a general warning.
       */}
      <ConfirmDialog
        open={pending !== null}
        /*
         * ⛔ NO IN-FLIGHT GUARD HERE, and the absence is deliberate. `ConfirmDialog.handleConfirm`
         * calls `onConfirm()` and then `onOpenChange(false)` SYNCHRONOUSLY, so this runs before
         * React has applied `setRemoving(true)` — the guard read a stale `false` every time and
         * never once fired. Dead code that reads as protection is worse than no protection: it
         * tells the next person the dialog cannot be dismissed mid-request when it always can.
         * The in-flight state is shown and defended on the ROW instead, where the admin is looking
         * once this closes. (Audit pass 1 over #414, proven with a never-resolving delete.)
         */
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={() => void confirmRemoval()}
        variant="danger"
        /*
         * ⛔ The confirm button NAMES THE ACT, and differs from the row button that opened it.
         * Both read "Remove" at first, which put two identically-named buttons on screen at once —
         * ambiguous to a screen reader, and to anyone deciding what they are about to agree to.
         * ⚠️ NOT an in-flight ternary: the dialog is already gone by then, so that
         * branch never rendered — see the note on `onOpenChange`.
         */
        confirmText={pending?.kind === 'vendor' ? 'Disconnect it' : 'Remove lookup'}
        title={
          pending?.kind === 'vendor'
            ? `Disconnect ${pending.connection.name}?`
            : `Remove ${pending?.endpoint.label ?? 'this lookup'}?`
        }
        description={
          pending?.kind === 'vendor'
            ? /*
               * ⛔ The ZERO case gets its own sentence. "Its lookups (0) … go with it" names a loss
               * that does not exist, and a vendor with no lookups is the state EVERY vendor is in
               * the moment it is created — the likeliest one an admin will see this dialog for.
               * (Audit pass 4; the corner case, as the rule says, every time.)
               */
              `Agents will stop seeing anything from ${pending.connection.name}.${
                pending.connection.endpoints.length > 0
                  ? ` Its ${pending.connection.endpoints.length === 1 ? 'lookup' : `${pending.connection.endpoints.length} lookups`} and its stored key go with it.`
                  : ' Its stored key goes with it.'
              } Nothing is deleted in ${pending.connection.name} itself.`
            : 'Agents will stop seeing this on their threads. The system it reads from is not changed.'
        }
      />
    </div>
  );
};
