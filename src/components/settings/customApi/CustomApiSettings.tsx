import { useCallback, useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
    </div>
  );
};
