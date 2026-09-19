import { useCallback, useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { customApiService, type CustomApiConnection } from '@/services/customApi.service';
import { getApiErrorMessage } from '@/lib/errorMessages';

/**
 * Settings → Integrations → Custom APIs (CA-5 Task 1).
 *
 * ⛔ THIS EXISTS SO A CLIENT CAN DO THIS THEMSELVES. CA-1 to CA-3 are merged and an admin still
 * cannot add a vendor without hand-POSTing JSON, which means the feature does not work for the
 * person who asked for it, whatever the test suites say.
 *
 * ⛔ NO CREDENTIAL IS RENDERED ANYWHERE — not masked, not partially. The API returns
 * `hasCredential: boolean` and no key, so the UI shows whether one is set and nothing more.
 */

interface Props {
  /** Whether this viewer may create or delete a VENDOR (D40: org_admin, not merely moderator). */
  canManageVendors: boolean;
  onAddVendor?: () => void;
  onOpenVendor?: (connection: CustomApiConnection) => void;
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

export const CustomApiSettings = ({ canManageVendors, onAddVendor, onOpenVendor }: Props) => {
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
              <p className="text-xs text-muted-foreground mt-1">
                {/* ⛔ Whether a key is SET — never the key, and never a masked stand-in for it. */}
                {connection.hasCredential ? 'API key set' : 'No API key'}
                {connection.scopeMode === 'departments' &&
                  ` · ${connection.departmentIds.length} department${connection.departmentIds.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onOpenVendor?.(connection)}>
              {canManageVendors ? 'Manage' : 'View lookups'}
            </Button>
          </div>

          {connection.endpoints.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No lookups yet — add one to choose what agents can find here.
            </p>
          ) : (
            <ul className="space-y-1">
              {connection.endpoints.map((endpoint) => {
                const state = lookupState(endpoint);
                return (
                  <li key={endpoint.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground truncate">{endpoint.label}</span>
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
};
