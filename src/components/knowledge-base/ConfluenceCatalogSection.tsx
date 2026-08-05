import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { documentationService } from '@/services/documentation.service';
import {
  integrationsService,
  type ConfluenceIntegration,
  type ConfluencePageNode,
} from '@/services/integrations.service';

// Per-page KB state label (right of the title) for a processed page.
const StatusLabel = ({ status }: { status: string | null | undefined }) => {
  if (status === 'ready')
    return <span className="text-xs font-medium text-green-600">In Knowledge Base</span>;
  if (status === 'processing')
    return <span className="text-xs text-blue-600">Processing…</span>;
  if (status === 'failed') return <span className="text-xs text-red-600">Failed</span>;
  return <span className="text-xs text-muted-foreground">In Knowledge Base</span>;
};

// One connected Confluence integration: its live page list, each with Process / Remove.
const IntegrationCatalog = ({ integration }: { integration: ConfluenceIntegration }) => {
  const [pages, setPages] = useState<ConfluencePageNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await integrationsService.listConfluencePages({ integrationId: integration.id });
      const list = res.data?.pages ?? [];
      setPages([...list].sort((first, second) => first.title.localeCompare(second.title)));
    } catch {
      setError('Could not load pages from Confluence — check the connection and space keys.');
    } finally {
      setLoading(false);
    }
  }, [integration.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const process = async (page: ConfluencePageNode) => {
    setBusyId(page.id);
    setError(null);
    try {
      await integrationsService.processConfluencePage(integration.id, page.id);
      await load();
    } catch {
      setError(`Could not add “${page.title}” to the Knowledge Base.`);
      setBusyId(null);
    }
  };

  const remove = async (page: ConfluencePageNode) => {
    if (!page.docId) return;
    setBusyId(page.id);
    setError(null);
    try {
      await documentationService.deleteDocumentation(page.docId);
      await load();
    } catch {
      setError(`Could not remove “${page.title}” from the Knowledge Base.`);
      setBusyId(null);
    }
  };

  const processedCount = pages?.filter((page) => page.processed).length ?? 0;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium">{integration.name}</p>
          <p className="text-xs text-muted-foreground">
            {integration.config.spaceKeys.join(', ') || 'No space keys'}
            {pages ? ` · ${processedCount}/${pages.length} in Knowledge Base` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading && !pages && (
        <div className="flex gap-2 items-center px-4 py-6 text-sm text-muted-foreground">
          <Spinner /> Loading pages…
        </div>
      )}

      {error && (
        <div className="px-4 py-3">
          <p className="mb-2 text-xs text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {pages && pages.length === 0 && !loading && (
        <p className="px-4 py-6 text-sm text-muted-foreground">No pages found in this space.</p>
      )}

      {pages && pages.length > 0 && (
        <ul className="divide-y divide-border">
          {pages.map((page) => {
            const busy = busyId === page.id;
            return (
              <li key={page.id} className="flex gap-3 justify-between items-center px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{page.title}</p>
                  {page.processed && <StatusLabel status={page.status} />}
                </div>
                {page.processed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 shrink-0 hover:text-red-700"
                    disabled={busy}
                    onClick={() => void remove(page)}
                  >
                    {busy ? <Spinner /> : 'Remove from KB'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={busy}
                    onClick={() => void process(page)}
                  >
                    {busy ? <Spinner /> : 'Process as KB'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * Confluence catalog on the Knowledge Base page. Lists every connected Confluence space's
 * pages (live from Confluence — connecting a space makes pages VISIBLE, not ingested).
 * Each page can be Processed into the KB (download + chunk + embed) or Removed (drops the
 * downloaded content + chunks) while staying visible here for re-processing.
 */
export const ConfluenceCatalogSection = () => {
  const [integrations, setIntegrations] = useState<ConfluenceIntegration[] | null>(null);

  useEffect(() => {
    integrationsService
      .getAll()
      .then((res) =>
        setIntegrations(
          res.data?.filter(
            (integration): integration is ConfluenceIntegration =>
              integration.type === 'confluence'
          ) ?? []
        )
      )
      .catch(() => setIntegrations([]));
  }, []);

  // Nothing to show until we know there's at least one Confluence connection.
  if (!integrations || integrations.length === 0) return null;

  return (
    <section className="mb-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Confluence</h2>
        <p className="text-sm text-muted-foreground">
          Pages from your connected spaces. Add the ones you want answered from — remove any
          time; the page stays here to re-add later.
        </p>
      </div>
      {integrations.map((integration) => (
        <IntegrationCatalog key={integration.id} integration={integration} />
      ))}
    </section>
  );
};
