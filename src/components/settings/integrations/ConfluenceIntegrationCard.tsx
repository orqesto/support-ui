import { BookOpen, Plus, Power, RefreshCw, Save, TestTube2, Trash2, Edit } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';
import {
  integrationsService,
  type BaseIntegration,
  type ConfluenceConfig,
  type ConfluencePageNode,
} from '@/services/integrations.service';

// One checkbox row in the page picker (indented by tree depth). Memoized on a boolean
// `checked` (not the whole Set) so toggling one page doesn't re-render every row.
const PageRow = memo(
  ({
    node,
    depth,
    checked,
    onToggle,
  }: {
    node: ConfluencePageNode;
    depth: number;
    checked: boolean;
    onToggle: (id: string) => void;
  }) => (
    <label
      className="flex gap-2 items-center py-0.5 text-sm cursor-pointer"
      style={{ paddingLeft: `${depth * 16}px` }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(node.id)}
        className="flex-shrink-0"
      />
      <span className="truncate">{node.title}</span>
    </label>
  )
);
PageRow.displayName = 'PageRow';

// Renders the page list as a hierarchy (or a flat filtered list while searching).
// Hardened against duplicate ids and parent cycles via dedupe + a `visited` set.
const PageTree = ({
  pages,
  selected,
  onToggle,
  filter,
}: {
  pages: ConfluencePageNode[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  filter: string;
}) => {
  // Build the (deduped) tree structure once per page list, not on every render/toggle.
  const { deduped, byParent } = useMemo(() => {
    const seen = new Set<string>();
    const dd: ConfluencePageNode[] = [];
    for (const p of pages) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        dd.push(p);
      }
    }
    const ids = new Set(dd.map((p) => p.id));
    const bp = new Map<string | null, ConfluencePageNode[]>();
    for (const p of dd) {
      const key = p.parentId && ids.has(p.parentId) ? p.parentId : null; // orphan → root
      const arr = bp.get(key);
      if (arr) arr.push(p);
      else bp.set(key, [p]);
    }
    for (const arr of bp.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    return { deduped: dd, byParent: bp };
  }, [pages]);

  const f = filter.trim().toLowerCase();
  if (f) {
    const matches = deduped.filter((p) => p.title.toLowerCase().includes(f));
    if (matches.length === 0) {
      return <p className="py-2 text-xs text-muted-foreground">No pages match “{filter}”.</p>;
    }
    return (
      <div>
        {matches.map((p) => (
          <PageRow key={p.id} node={p} depth={0} checked={selected.has(p.id)} onToggle={onToggle} />
        ))}
      </div>
    );
  }

  const rows: ReactNode[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      if (visited.has(node.id)) continue; // guard cycles / duplicate parents
      visited.add(node.id);
      rows.push(
        <PageRow
          key={node.id}
          node={node}
          depth={depth}
          checked={selected.has(node.id)}
          onToggle={onToggle}
        />
      );
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  // Surface any node not reached from a root (e.g. a member of a parent cycle) so it's
  // never silently hidden.
  for (const node of deduped) {
    if (!visited.has(node.id)) {
      rows.push(
        <PageRow
          key={node.id}
          node={node}
          depth={0}
          checked={selected.has(node.id)}
          onToggle={onToggle}
        />
      );
    }
  }
  return <div>{rows}</div>;
};

// Parse a raw "SUP, DOCS ENG" input into a clean string[] of space keys. The saved
// config MUST carry spaceKeys as an array (the backend sync expects string[]).
const parseSpaceKeys = (raw: string): string[] =>
  raw
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

const timeAgo = (iso: string): string => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Last-sync summary line shown under each saved space.
const syncMeta = (
  i: Pick<
    BaseIntegration,
    'lastSyncStatus' | 'lastSyncedAt' | 'lastSyncedPageCount' | 'lastSyncError'
  >
): { text: string; cls: string } => {
  if (i.lastSyncStatus === 'syncing') return { text: 'Syncing…', cls: 'text-blue-600' };
  if (i.lastSyncStatus === 'failed') {
    const detail = i.lastSyncError ? `: ${i.lastSyncError.slice(0, 90)}` : '';
    return { text: `Sync failed${detail}`, cls: 'text-red-600' };
  }
  if (i.lastSyncStatus === 'success') {
    const n = i.lastSyncedPageCount ?? 0;
    const when = i.lastSyncedAt ? ` · ${timeAgo(i.lastSyncedAt)}` : '';
    return { text: `Synced ${n} page${n === 1 ? '' : 's'}${when}`, cls: 'text-green-600' };
  }
  return { text: 'Not synced yet', cls: 'text-muted-foreground' };
};

export const ConfluenceIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const {
    showForm,
    saving,
    testing,
    deleting,
    deleteConfirm,
    editingId,
    config,
    setShowForm,
    setConfig,
    setDeleteConfirm,
    resetForm,
    loadForEdit,
    saveIntegration: saveIntegrationBase,
    testConnection,
    deleteIntegration,
  } = useIntegrationCard<ConfluenceConfig>({
    integrationType: 'confluence',
    integrationDisplayName: 'Confluence Integration',
    initialConfig: {
      baseUrl: '',
      email: '',
      apiToken: '',
      spaceKeys: [],
      syncIntervalMinutes: undefined,
    },
    onRefresh,
    onShowAlert,
  });

  const confluenceIntegrations = integrations.filter((integ) => integ.type === 'confluence');

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  // Page-tree picker state.
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [pages, setPages] = useState<ConfluencePageNode[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pageFilter, setPageFilter] = useState('');
  // A one-shot timer to re-check status shortly after "Sync now": the worker sets
  // lastSyncStatus='syncing' asynchronously, so an immediate refresh can miss it and the
  // poll effect never engages. Cleared on unmount (no leak).
  const kickTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (kickTimerRef.current) window.clearTimeout(kickTimerRef.current);
    },
    []
  );
  // Raw text mirror of the Space Keys field. A controlled input bound to
  // config.spaceKeys.join(', ') re-parses every keystroke and eats the separator, making
  // multi-key entry by typing impossible. Keep the raw string here and parse into the
  // config array in parallel, so the field renders exactly what the user types.
  const [spaceKeysRaw, setSpaceKeysRaw] = useState('');

  // "Sync now" — enqueue an immediate re-sync instead of waiting for the poller.
  const handleSyncNow = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await integrationsService.syncNow(id);
      onShowAlert({
        open: true,
        title: res.success ? 'Sync started' : 'Sync failed',
        description:
          res.data?.message ??
          (res.success
            ? 'Pages will appear in the Knowledge Base shortly.'
            : 'Could not start the sync.'),
        variant: res.success ? 'success' : 'error',
      });
      // Surface 'syncing' immediately; the poll effect below refreshes until it resolves.
      void onRefresh();
      // Re-check ~1.5s later to catch the worker flipping the row to 'syncing' (the
      // immediate refresh can land first), which engages the poll effect.
      if (kickTimerRef.current) window.clearTimeout(kickTimerRef.current);
      kickTimerRef.current = window.setTimeout(() => void onRefresh(), 1500);
    } catch {
      onShowAlert({
        open: true,
        title: 'Sync failed',
        description: 'Could not start the sync. Check the connection and try again.',
        variant: 'error',
      });
    } finally {
      setSyncingId(null);
    }
  };

  // While any space is mid-sync, poll so the status line resolves to Synced/Failed without
  // a manual reload — capped and cleaned up (no unmount leak). The deadline lives in a ref
  // (not a local counter) so the cap survives effect re-runs when onRefresh isn't memoized.
  const anySyncing = confluenceIntegrations.some((i) => i.lastSyncStatus === 'syncing');
  const pollDeadlineRef = useRef(0);
  useEffect(() => {
    if (!anySyncing) {
      pollDeadlineRef.current = 0;
      return;
    }
    if (pollDeadlineRef.current === 0) pollDeadlineRef.current = Date.now() + 2 * 60 * 1000; // 2 min cap
    const id = window.setInterval(() => {
      if (Date.now() >= pollDeadlineRef.current) {
        window.clearInterval(id);
        return;
      }
      void onRefresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [anySyncing, onRefresh]);

  const selectedPageIds = new Set(config.selectedPageIds ?? []);

  // Stable identity (functional setConfig) so React.memo(PageRow) can skip untouched rows.
  const togglePage = useCallback(
    (id: string) => {
      setConfig((prev) => {
        const next = new Set(prev.selectedPageIds ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...prev, selectedPageIds: Array.from(next) };
      });
    },
    [setConfig]
  );

  // Load the space's pages for the picker. Uses stored creds by id when editing (so the
  // masked token isn't needed); otherwise the config the user just typed.
  const loadPages = async () => {
    setPagesLoading(true);
    setPagesError(null);
    try {
      const payload = editingId
        ? { integrationId: editingId }
        : {
            config: {
              baseUrl: config.baseUrl,
              email: config.email,
              apiToken: config.apiToken,
              spaceKeys: config.spaceKeys,
            },
          };
      const res = await integrationsService.listConfluencePages(payload);
      if (res.success && res.data) setPages(res.data.pages);
      else setPagesError('Could not load pages. Check the connection.');
    } catch {
      setPagesError('Could not load pages. Check the base URL, credentials and space key.');
    } finally {
      setPagesLoading(false);
    }
  };

  // Pause/resume a source. Disabling stops syncing and (via the PATCH handler) soft-deletes
  // its docs so they leave AI answers; re-enabling re-syncs and restores them.
  const handleToggleEnabled = async (id: number, currentlyEnabled: boolean, name: string) => {
    setTogglingId(id);
    try {
      // `type` is REQUIRED by the PATCH handler (guards against cross-table id-collision);
      // without it the request 400s before the enable/disable KB branch runs.
      const res = await integrationsService.update(id, {
        enabled: !currentlyEnabled,
        type: 'confluence',
      });
      onShowAlert({
        open: true,
        title: res.success
          ? currentlyEnabled
            ? 'Source paused'
            : 'Source enabled'
          : 'Update failed',
        description: res.success
          ? currentlyEnabled
            ? `“${name}” paused — its pages are excluded from AI answers.`
            : `“${name}” enabled — syncing its pages back into the Knowledge Base.`
          : 'Could not update the source. Try again.',
        variant: res.success ? 'success' : 'error',
      });
      void onRefresh();
    } catch {
      onShowAlert({
        open: true,
        title: 'Update failed',
        description: 'Could not update the source. Try again.',
        variant: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // No project key like Jira — name the connection after its first space (or a fixed label).
  // On EDIT, reuse the EXISTING name: the upsert matches by (org,type,name), so a name that
  // shifts when the first space key changes would miss → create a DUPLICATE (via the
  // restore-less CREATE branch, corrupting the masked token too). A stable name → UPDATE.
  const saveIntegration = () => {
    const existingName = editingId
      ? confluenceIntegrations.find((i) => i.id === editingId)?.name
      : undefined;
    const name =
      existingName ?? (config.spaceKeys[0] ? `Confluence-${config.spaceKeys[0]}` : 'Confluence');
    saveIntegrationBase(name);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      void deleteIntegration(deleteConfirm.id, deleteConfirm.name);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <BookOpen className="w-5 h-5 text-blue-700" />
              Confluence Spaces
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setSpaceKeysRaw('');
                setShowPagePicker(false);
                setPages(null);
                setPageFilter('');
                setShowForm(!showForm);
              }}
            >
              <Plus className="hidden mr-1 w-4 h-4 sm:block" />
              Add Confluence
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {confluenceIntegrations.length > 0 && (
            <div className="space-y-2">
              {confluenceIntegrations.map((integration) => {
                const cfg = integration.config;
                return (
                  <div
                    key={integration.id}
                    className="flex justify-between items-center p-3 rounded-lg border"
                  >
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">
                          {cfg.spaceKeys?.length ? cfg.spaceKeys.join(', ') : integration.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cfg.baseUrl ?? 'Not configured'}
                        </p>
                        {(() => {
                          const meta = syncMeta(integration);
                          return <p className={`text-xs mt-0.5 ${meta.cls}`}>{meta.text}</p>;
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadForEdit(integration.id, cfg);
                          setSpaceKeysRaw((cfg.spaceKeys ?? []).join(', '));
                          setShowPagePicker(false);
                          setPages(null);
                          setPageFilter('');
                        }}
                        aria-label="Edit Confluence source"
                        title="Edit"
                        disabled={editingId === integration.id}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(integration.id, integration.name)}
                        isLoading={testing === integration.id}
                        disabled={!integration.hasCredentials || testing === integration.id}
                        aria-label="Test Confluence connection"
                        title={
                          integration.hasCredentials
                            ? 'Test the connection'
                            : 'Add credentials first'
                        }
                      >
                        <TestTube2 className="w-4 h-4" />
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleSyncNow(integration.id)}
                        isLoading={syncingId === integration.id}
                        disabled={
                          !integration.enabled ||
                          !integration.hasCredentials ||
                          syncingId === integration.id
                        }
                        aria-label="Sync now"
                        title={
                          !integration.enabled
                            ? 'Enable this source first'
                            : !integration.hasCredentials
                              ? 'Add credentials to sync'
                              : 'Sync pages from Confluence into the Knowledge Base now'
                        }
                      >
                        <RefreshCw className="w-4 h-4" />
                        Sync now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleToggleEnabled(
                            integration.id,
                            integration.enabled,
                            integration.name
                          )
                        }
                        isLoading={togglingId === integration.id}
                        disabled={togglingId === integration.id}
                        aria-label={integration.enabled ? 'Pause source' : 'Enable source'}
                        title={
                          integration.enabled
                            ? 'Pause — stop syncing and exclude its pages from AI answers'
                            : 'Enable — resume syncing its pages'
                        }
                        className={integration.enabled ? 'text-green-600' : 'text-gray-400'}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDeleteConfirm({ id: integration.id, name: integration.name })
                        }
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Confluence Space' : 'Add Confluence Space'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL
                  </label>
                  <input
                    id="baseUrl"
                    type="url"
                    value={config.baseUrl}
                    onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://your-domain.atlassian.net"
                  />
                </div>
                <div>
                  <label htmlFor="spaceKeys" className="text-sm font-medium">
                    Space Keys
                  </label>
                  <input
                    id="spaceKeys"
                    type="text"
                    value={spaceKeysRaw}
                    onChange={(event) => {
                      setSpaceKeysRaw(event.target.value);
                      setConfig({ ...config, spaceKeys: parseSpaceKeys(event.target.value) });
                    }}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="SUP, DOCS"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={config.email}
                    onChange={(event) => setConfig({ ...config, email: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="apiToken" className="text-sm font-medium">
                    API Token
                  </label>
                  <input
                    id="apiToken"
                    type="password"
                    value={config.apiToken}
                    onChange={(event) => setConfig({ ...config, apiToken: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>

              {/* Page-tree picker — choose which pages sync (empty = whole space) */}
              <div>
                <label className="text-sm font-medium">Pages to sync</label>
                <p className="mt-0.5 mb-1 text-xs text-muted-foreground">
                  {selectedPageIds.size === 0
                    ? 'Syncing every page in the space(s). Choose specific pages to narrow it down.'
                    : `${selectedPageIds.size} page${selectedPageIds.size === 1 ? '' : 's'} selected — only the exact pages you tick sync (child pages aren’t included automatically).`}
                  {editingId
                    ? ' Pages reflect the saved configuration — save changes to pick from newly-added spaces.'
                    : ''}
                </p>
                {!showPagePicker ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowPagePicker(true);
                      void loadPages(); // always refetch — creds/space keys may have changed
                    }}
                    disabled={
                      config.spaceKeys.length === 0 ||
                      (!editingId && (!config.baseUrl || !config.email || !config.apiToken))
                    }
                    title={
                      config.spaceKeys.length === 0
                        ? 'Enter a space key first'
                        : 'Choose which pages to sync'
                    }
                  >
                    Choose pages
                  </Button>
                ) : (
                  <div className="p-2 space-y-2 rounded-md border">
                    {pagesLoading && (
                      <p className="text-xs text-muted-foreground">Loading pages…</p>
                    )}
                    {pagesError && !pagesLoading && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-600">{pagesError}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => void loadPages()}>
                            Retry
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPagePicker(false)}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    )}
                    {pages && !pagesLoading && !pagesError && (
                      <>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={pageFilter}
                            onChange={(e) => setPageFilter(e.target.value)}
                            placeholder="Filter pages…"
                            aria-label="Filter pages"
                            className="flex-1 px-2 py-1 text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            title={
                              pageFilter.trim()
                                ? 'Select all pages matching the filter'
                                : 'Select all pages'
                            }
                            onClick={() => {
                              const f = pageFilter.trim().toLowerCase();
                              const pool = f
                                ? pages.filter((p) => p.title.toLowerCase().includes(f))
                                : pages;
                              const merged = new Set(config.selectedPageIds ?? []);
                              pool.forEach((p) => merged.add(p.id));
                              setConfig({ ...config, selectedPageIds: Array.from(merged) });
                            }}
                          >
                            All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfig({ ...config, selectedPageIds: [] })}
                          >
                            Clear
                          </Button>
                        </div>
                        {pages.length > 500 && (
                          <p className="text-xs text-amber-600">
                            {pages.length} pages — use the filter to find pages faster.
                          </p>
                        )}
                        {pages.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            No pages found in the configured space(s).
                          </p>
                        ) : (
                          <div className="overflow-y-auto max-h-64">
                            <PageTree
                              pages={pages}
                              selected={selectedPageIds}
                              onToggle={togglePage}
                              filter={pageFilter}
                            />
                          </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setShowPagePicker(false)}>
                          Done
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={saveIntegration}
                  isLoading={saving}
                  disabled={
                    saving ||
                    !config.baseUrl ||
                    !config.email ||
                    !config.apiToken ||
                    config.spaceKeys.length === 0
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Confluence
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {confluenceIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Confluence spaces configured
            </p>
          )}
        </CardContent>
      </Card>

      {deleteConfirm && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Delete Integration?</h3>
            <p className="mb-4 text-muted-foreground">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="mb-6 text-sm text-red-600">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting === deleteConfirm.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                isLoading={deleting === deleteConfirm.id}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
