import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { TemplateGuide } from '@/components/settings/customApi/TemplateGuide';
import { CUSTOM_APIS_SETTINGS_PATH } from '@/components/settings/customApi/lookupPaths';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { customApiService, type CustomApiConnection } from '@/services/customApi.service';
import {
  customApiTemplateService,
  type CustomApiTemplate,
} from '@/services/customApiTemplates.service';
import { Permission } from '@/types/roles';

type Loaded =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; connection: CustomApiConnection; templates: CustomApiTemplate[] };

/**
 * Start a connected system's lookups from a custom API template (spec CUSTOM-API-TEMPLATES):
 * pick a published template, then TemplateGuide walks its lookups one form at a time.
 *
 * ⛔ Gated on MANAGE_INTEGRATIONS like the lookup editor page — a typed URL is not a way in.
 */
export const CustomApiTemplatePage = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_INTEGRATIONS);
  const connectionId = Number(useParams<{ connectionId: string }>().connectionId);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [chosen, setChosen] = useState<CustomApiTemplate | null>(null);

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
        const [connections, templates] = await Promise.all([
          customApiService.list(),
          customApiTemplateService.listPublished(),
        ]);
        if (cancelled) return;
        const connection = connections.find((one) => one.id === connectionId);
        setLoaded(
          connection
            ? { state: 'ready', connection, templates }
            : {
                state: 'failed',
                message: 'That connected system no longer exists, or it is not in this workspace.',
              }
        );
      } catch (err) {
        if (!cancelled) {
          setLoaded({
            state: 'failed',
            message: getApiErrorMessage(err) ?? 'Could not load the templates.',
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, connectionId]);

  /**
   * F4: a template applied in part hands its notice (what was kept, what was not) to the lookups
   * list, which shows it — leaving silently made a half-applied template look finished.
   */
  const back = (notice?: string) =>
    navigate(
      CUSTOM_APIS_SETTINGS_PATH,
      notice ? { state: { customApiNotice: notice } } : undefined
    );

  return (
    <Layout>
      <div className="px-2 mx-auto space-y-4 w-full max-w-7xl">
        <Button variant="ghost" size="sm" onClick={() => back()}>
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
        ) : chosen ? (
          <TemplateGuide
            connection={loaded.connection}
            template={chosen}
            onDone={back}
            // Nothing kept: back to the template list, as before. Something kept: to the lookups.
            onCancel={(notice) => (notice ? back(notice) : setChosen(null))}
          />
        ) : loaded.templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates are published yet.</p>
        ) : (
          <ul className="space-y-3">
            {loaded.templates.map((tpl) => (
              <li key={tpl.id} className="rounded-lg border border-border bg-card p-4">
                <p className="font-medium">{tpl.name}</p>
                {tpl.description && (
                  <p className="text-sm text-muted-foreground">{tpl.description}</p>
                )}
                <Button size="sm" className="mt-2" onClick={() => setChosen(tpl)}>
                  Use this template
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
};
