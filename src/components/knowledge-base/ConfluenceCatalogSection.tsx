import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { documentationService } from '@/services/documentation.service';
import {
  integrationsService,
  type ConfluenceIntegration,
  type ConfluencePageNode,
} from '@/services/integrations.service';

const POLL_MS = 2500;
const MAX_POLLS = 48; // ~2 min ceiling so a stuck job can't poll forever

// KB-state label shown to the right of a processed page's title.
const StatusLabel = ({ status }: { status: string | null | undefined }) => {
  if (status === 'failed') return <span className="text-xs text-red-600">Failed — retry</span>;
  return <span className="text-xs font-medium text-green-600">In Knowledge Base</span>;
};

// One connected Confluence integration: its live pages, each independently Process/Remove-able.
const IntegrationCatalog = ({ integration }: { integration: ConfluenceIntegration }) => {
  const [pages, setPages] = useState<ConfluencePageNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-page transient state — Sets so many pages can be in flight at once.
  const [pending, setPending] = useState<Set<string>>(new Set()); // queued/optimistic-processing
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const pollCount = useRef(0);

  // Fetch the catalog and merge in place (no top-level loading flash). Drops a page from
  // `pending` once the server confirms it's processed — server status takes over from there.
  const refresh = useCallback(async () => {
    try {
      const res = await integrationsService.listConfluencePages({ integrationId: integration.id });
      const fresh = [...(res.data?.pages ?? [])].sort((first, second) =>
        first.title.localeCompare(second.title)
      );
      setPages(fresh);
      setPending((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const page of fresh) if (page.processed) next.delete(page.id);
        return next;
      });
      setError(null);
    } catch {
      setError('Could not load pages from Confluence — check the connection and space keys.');
    }
  }, [integration.id]);

  // Initial load (the only time we show the section spinner).
  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Live updates: while anything is optimistically pending OR the server reports a page
  // mid-embed ('processing'), poll and merge — updating only the rows that change.
  const anyProcessing =
    pending.size > 0 || (pages?.some((page) => page.status === 'processing') ?? false);
  useEffect(() => {
    if (!anyProcessing) {
      pollCount.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        window.clearInterval(timer);
        return;
      }
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyProcessing, refresh]);

  const process = (page: ConfluencePageNode) => {
    setError(null);
    setPending((prev) => new Set(prev).add(page.id)); // optimistic — show immediately
    integrationsService.processConfluencePage(integration.id, page.id).catch(() => {
      setError(`Could not queue “${page.title}” for the Knowledge Base.`);
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(page.id);
        return next;
      });
    });
  };

  const remove = (page: ConfluencePageNode) => {
    if (!page.docId) return;
    const docId = page.docId;
    setError(null);
    setRemoving((prev) => new Set(prev).add(page.id));
    documentationService
      .deleteDocumentation(docId)
      .then(() => {
        // Targeted in-place update: flip just this row back to unprocessed.
        setPages(
          (prev) =>
            prev?.map((item) =>
              item.id === page.id ? { ...item, processed: false, docId: null, status: null } : item
            ) ?? prev
        );
      })
      .catch(() => setError(`Could not remove “${page.title}” from the Knowledge Base.`))
      .finally(() =>
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(page.id);
          return next;
        })
      );
  };

  const processedCount = pages?.filter((page) => page.processed).length ?? 0;
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? (pages ?? []).filter((page) => page.title.toLowerCase().includes(needle))
    : (pages ?? []);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex gap-3 justify-between items-center px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{integration.name}</p>
          <p className="text-xs text-muted-foreground">
            {integration.config.spaceKeys.join(', ') || 'No space keys'}
            {pages ? ` · ${processedCount}/${pages.length} in Knowledge Base` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} title="Refresh pages">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {pages && pages.length > 0 && (
        <div className="px-4 pt-3">
          <input
            type="text"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
            placeholder="Search pages…"
            aria-label="Search Confluence pages"
            className="px-3 py-1.5 w-full text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
      )}

      {loading && !pages && (
        <div className="flex gap-2 items-center px-4 py-6 text-sm text-muted-foreground">
          <Spinner /> Loading pages…
        </div>
      )}

      {error && (
        <div className="px-4 py-3">
          <p className="mb-2 text-xs text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      {pages && pages.length === 0 && !loading && (
        <p className="px-4 py-6 text-sm text-muted-foreground">No pages found in this space.</p>
      )}

      {pages && pages.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {visible.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No pages match “{filter}”.</li>
          )}
          {visible.map((page) => {
            const isRemoving = removing.has(page.id);
            const isProcessing = pending.has(page.id) || page.status === 'processing';
            return (
              <li key={page.id} className="flex gap-3 justify-between items-center px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{page.title}</p>
                  {isProcessing ? (
                    <span className="text-xs text-blue-600">Processing…</span>
                  ) : (
                    page.processed && <StatusLabel status={page.status} />
                  )}
                </div>
                {isProcessing ? (
                  <span className="flex gap-1.5 items-center text-xs shrink-0 text-muted-foreground">
                    <Spinner /> Queued
                  </span>
                ) : page.processed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 shrink-0 hover:text-red-700"
                    disabled={isRemoving}
                    onClick={() => remove(page)}
                  >
                    {isRemoving ? <Spinner /> : 'Remove from KB'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => process(page)}
                  >
                    Process as KB
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
 * pages (live — connecting a space makes pages VISIBLE, not ingested). Each page can be
 * Processed into the KB (queued: download + chunk + embed) or Removed (drops the content +
 * chunks) while staying visible here for re-processing. Processing/removal update per-row
 * in place; nothing reloads the whole list.
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
