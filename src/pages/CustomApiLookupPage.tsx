import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { EndpointWizard } from '@/components/settings/customApi/EndpointWizard';
import {
  CUSTOM_APIS_SETTINGS_PATH,
  customApiLookupPath,
} from '@/components/settings/customApi/lookupPaths';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  customApiService,
  type CustomApiConnection,
  type CustomApiEndpoint,
} from '@/services/customApi.service';
import { Permission } from '@/types/roles';

type Loaded =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; connection: CustomApiConnection; endpoint?: CustomApiEndpoint };

/**
 * The custom-API lookup editor as a page (it was a dialog inside Settings until 2026-09-29).
 *
 * ⛔ Gated on MANAGE_INTEGRATIONS, the same permission that shows the Custom APIs tab — NOT on
 * org_admin. D40: a moderator owns the lookups, and the backend keeps the endpoint routes on that
 * permission. A URL is reachable by anyone who types it, so the tab's gate has to be repeated here.
 */
export const CustomApiLookupPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_INTEGRATIONS);
  const params = useParams<{ connectionId: string; lookupId: string }>();
  const connectionId = Number(params.connectionId);
  const urlLookupId = params.lookupId ?? 'new';
  /**
   * ⛔ The lookup being edited follows the URL — EXCEPT the one move this page makes itself.
   * Creating a lookup moves the URL from `new` to its id (so a reload keeps editing it);
   * re-resolving on THAT change would remount the editor and throw away the response tree the
   * admin just tested. Any other change (back/forward between two lookups, a link) must load the
   * lookup the address names, or the page edits one lookup under another's URL.
   */
  const createdHere = useRef<string | null>(null);
  const [lookupParam, setLookupParam] = useState(urlLookupId);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    if (urlLookupId === lookupParam) return;
    if (urlLookupId === createdHere.current) {
      // Consumed: a LATER visit to this id (away to another lookup and back) must load it.
      createdHere.current = null;
      return;
    }
    setLoaded({ state: 'loading' });
    setLookupParam(urlLookupId);
  }, [urlLookupId, lookupParam]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    const load = async () => {
      if (!Number.isInteger(connectionId) || connectionId <= 0) {
        setLoaded({
          state: 'failed',
          message: 'This address does not point at a connected system.',
        });
        return;
      }
      try {
        const connections = await customApiService.list();
        if (cancelled) return;
        const connection = connections.find((one) => one.id === connectionId);
        if (!connection) {
          setLoaded({
            state: 'failed',
            message: 'That connected system no longer exists, or it is not in this workspace.',
          });
          return;
        }
        if (lookupParam === 'new') {
          setLoaded({ state: 'ready', connection });
          return;
        }
        const endpoint = connection.endpoints.find((one) => String(one.id) === lookupParam);
        if (!endpoint) {
          setLoaded({
            state: 'failed',
            message: `That lookup no longer exists under ${connection.name}. It may have been deleted.`,
          });
          return;
        }
        setLoaded({ state: 'ready', connection, endpoint });
      } catch (err) {
        if (!cancelled) {
          setLoaded({
            state: 'failed',
            message: getApiErrorMessage(err) ?? 'Could not load this lookup.',
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, connectionId, lookupParam]);

  const back = () => navigate(CUSTOM_APIS_SETTINGS_PATH);

  return (
    <Layout>
      <div className="px-2 mx-auto space-y-4 w-full max-w-7xl">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="mr-1 w-4 h-4" />
          Custom APIs
        </Button>

        {!canManage ? (
          <Alert variant="warning">
            <AlertDescription>
              You need permission to manage integrations to edit lookups. Ask a workspace admin.
            </AlertDescription>
          </Alert>
        ) : loaded.state === 'loading' ? (
          <Spinner />
        ) : loaded.state === 'failed' ? (
          <Alert variant="warning">
            <AlertDescription>{loaded.message}</AlertDescription>
          </Alert>
        ) : (
          <EndpointWizard
            // A different lookup is a different form: its fields are `useState` initialisers.
            key={`${loaded.connection.id}-${lookupParam}`}
            connection={loaded.connection}
            endpoint={loaded.endpoint}
            onClose={back}
            // The list re-reads from the API when Settings mounts, so there is nothing to patch.
            onSaved={() => {}}
            onCreated={(id) => {
              createdHere.current = String(id);
              navigate(customApiLookupPath(loaded.connection.id, id), { replace: true });
            }}
          />
        )}
      </div>
    </Layout>
  );
};
