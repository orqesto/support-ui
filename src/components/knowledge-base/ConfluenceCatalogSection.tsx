import { ChevronDown, ChevronRight, Folder, FolderCheck, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { documentationService } from '@/services/documentation.service';
import {
  integrationsService,
  type ConfluenceFolderNode,
  type ConfluenceIntegration,
  type ConfluencePageNode,
  type ConfluenceSpace,
} from '@/services/integrations.service';

const POLL_MS = 2500;
const MAX_POLLS = 48; // ~2 min ceiling so a stuck job can't poll forever

// KB-state badge shown to the right of a processed page's title.
const StatusBadge = ({ status }: { status: string | null | undefined }) => {
  if (status === 'failed')
    return (
      <Badge variant="danger" size="sm">
        Failed — retry
      </Badge>
    );
  return (
    <Badge variant="success" size="sm">
      In Knowledge Base
    </Badge>
  );
};

// A node in the browse tree: a folder (with children) or a page (leaf).
type TreeNode =
  | { kind: 'folder'; id: string; title: string; folder: ConfluenceFolderNode; children: TreeNode[] }
  | { kind: 'page'; id: string; title: string; page: ConfluencePageNode };

// Build a folder/page tree from the flat lists using parentId. Anything whose parent isn't in
// the set (or is null) is a root (top-level under the space).
const buildTree = (folders: ConfluenceFolderNode[], pages: ConfluencePageNode[]): TreeNode[] => {
  const ids = new Set<string>([...folders.map((folder) => folder.id), ...pages.map((page) => page.id)]);
  const childrenOf = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];

  const place = (node: TreeNode, parentId: string | null) => {
    if (parentId && ids.has(parentId)) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(node);
      childrenOf.set(parentId, list);
    } else {
      roots.push(node);
    }
  };

  const folderNodes = new Map<string, Extract<TreeNode, { kind: 'folder' }>>();
  for (const folder of folders) {
    const node: Extract<TreeNode, { kind: 'folder' }> = {
      kind: 'folder',
      id: folder.id,
      title: folder.title || 'Untitled folder',
      folder,
      children: [],
    };
    folderNodes.set(folder.id, node);
  }
  for (const folder of folders) place(folderNodes.get(folder.id)!, folder.parentId);
  for (const page of pages)
    place({ kind: 'page', id: page.id, title: page.title, page }, page.parentId);

  // Attach collected children to folder nodes, sorted (folders first, then pages, A→Z).
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes].sort((first, second) =>
      first.kind !== second.kind
        ? first.kind === 'folder'
          ? -1
          : 1
        : first.title.localeCompare(second.title)
    );
  for (const [id, list] of childrenOf) {
    const parent = folderNodes.get(id);
    if (parent) parent.children = sortNodes(list);
  }
  return sortNodes(roots);
};

// One connected Confluence integration: a browse-and-select tree of its folders + pages.
const IntegrationCatalog = ({
  integration,
  refreshSignal,
  onKbChange,
}: {
  integration: ConfluenceIntegration;
  refreshSignal: number;
  onKbChange?: () => void;
}) => {
  const configuredSpaceKeys = integration.config.spaceKeys ?? [];
  const [pages, setPages] = useState<ConfluencePageNode[] | null>(null);
  const [folders, setFolders] = useState<ConfluenceFolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set()); // page ids queued/processing
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [folderBusy, setFolderBusy] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  // Env/no-configured-space browsing: pick a space to list.
  const [spaces, setSpaces] = useState<ConfluenceSpace[] | null>(null);
  const [spaceKey, setSpaceKey] = useState<string>(configuredSpaceKeys[0] ?? '');
  const pollCount = useRef(0);
  const pendingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // When no space is configured, offer a space picker (self-hosted env service account).
  useEffect(() => {
    if (configuredSpaceKeys.length > 0) return;
    integrationsService
      .listConfluenceSpaces({ integrationId: integration.id })
      .then((res) => {
        const list = res.data?.spaces ?? [];
        setSpaces(list);
        setSpaceKey((prev) => prev || list[0]?.key || '');
      })
      .catch(() => setSpaces([]));
  }, [integration.id, configuredSpaceKeys.length]);

  const refresh = useCallback(async () => {
    // Nothing to list until we know which space(s) to browse.
    if (configuredSpaceKeys.length === 0 && !spaceKey) return;
    try {
      const res = await integrationsService.listConfluencePages({
        integrationId: integration.id,
        ...(configuredSpaceKeys.length === 0 ? { spaceKey } : {}),
      });
      const freshPages = res.data?.pages ?? [];
      const freshFolders = res.data?.folders ?? [];
      const completed = freshPages.some((page) => page.processed && pendingRef.current.has(page.id));
      setPages(freshPages);
      setFolders(freshFolders);
      setPending((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const page of freshPages) if (page.processed) next.delete(page.id);
        return next;
      });
      if (completed) onKbChange?.();
      setError(null);
    } catch {
      setError('Could not load content from Confluence — check the connection and access.');
    }
  }, [integration.id, spaceKey, configuredSpaceKeys.length, onKbChange]);

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (refreshSignal > 0) void refresh();
  }, [refreshSignal, refresh]);

  const anyProcessing =
    pending.size > 0 ||
    folderBusy.size > 0 ||
    (pages?.some((page) => page.status === 'processing') ?? false);
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

  const processPage = (page: ConfluencePageNode) => {
    setError(null);
    setPending((prev) => new Set(prev).add(page.id));
    integrationsService.processConfluencePage(integration.id, page.id).catch(() => {
      setError(`Could not queue “${page.title}” for the Knowledge Base.`);
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(page.id);
        return next;
      });
    });
  };

  const removePage = (page: ConfluencePageNode) => {
    if (!page.docId) return;
    const docId = page.docId;
    setError(null);
    setRemoving((prev) => new Set(prev).add(page.id));
    documentationService
      .deleteDocumentation(docId)
      .then(() => {
        setPages(
          (prev) =>
            prev?.map((item) =>
              item.id === page.id ? { ...item, processed: false, docId: null, status: null } : item
            ) ?? prev
        );
        onKbChange?.();
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

  const setFolderSelected = (folderId: string, selected: boolean) =>
    setFolders((prev) =>
      prev.map((folder) => (folder.id === folderId ? { ...folder, selected } : folder))
    );

  const withFolderBusy = (folderId: string, promise: Promise<unknown>) => {
    setFolderBusy((prev) => new Set(prev).add(folderId));
    void promise.finally(() =>
      setFolderBusy((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      })
    );
  };

  const processFolder = (folder: ConfluenceFolderNode) => {
    setError(null);
    setFolderSelected(folder.id, true); // optimistic
    withFolderBusy(
      folder.id,
      integrationsService
        .processConfluenceFolder(integration.id, folder.id)
        .then(() => refresh())
        .catch(() => {
          setError(`Could not add “${folder.title}” to the Knowledge Base.`);
          setFolderSelected(folder.id, false);
        })
    );
  };

  const removeFolder = (folder: ConfluenceFolderNode) => {
    setError(null);
    setFolderSelected(folder.id, false); // optimistic
    withFolderBusy(
      folder.id,
      integrationsService
        .removeConfluenceFolder(integration.id, folder.id)
        .catch(() => {
          setError(`Could not remove “${folder.title}” from the selection.`);
          setFolderSelected(folder.id, true);
        })
    );
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tree = useMemo(() => buildTree(folders, pages ?? []), [folders, pages]);
  const processedCount = pages?.filter((page) => page.processed).length ?? 0;
  const selectedFolderCount = folders.filter((folder) => folder.selected).length;
  const needle = filter.trim().toLowerCase();

  // Search mode: flat list of matching folders + pages (hierarchy ignored while searching).
  const searchMatches = useMemo(() => {
    if (!needle) return null;
    const folderHits = folders.filter((folder) => folder.title.toLowerCase().includes(needle));
    const pageHits = (pages ?? []).filter((page) => page.title.toLowerCase().includes(needle));
    return { folders: folderHits, pages: pageHits };
  }, [needle, folders, pages]);

  // Row renderers ---------------------------------------------------------------
  const renderPageRow = (page: ConfluencePageNode, depth = 0) => {
    const isRemoving = removing.has(page.id);
    const isProcessing = pending.has(page.id) || page.status === 'processing';
    return (
      <li
        key={`p-${page.id}`}
        className="flex gap-3 justify-between items-center px-4 py-2"
        style={{ paddingLeft: `${16 + depth * 18}px` }}
      >
        <div className="flex flex-wrap gap-2 items-center min-w-0">
          <span className="text-sm truncate">{page.title}</span>
          {isProcessing ? (
            <Badge variant="warning" size="sm">
              Processing…
            </Badge>
          ) : (
            page.processed && <StatusBadge status={page.status} />
          )}
        </div>
        {isProcessing ? (
          <span className="text-muted-foreground shrink-0">
            <Spinner />
          </span>
        ) : page.processed ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 shrink-0 hover:text-red-700"
            disabled={isRemoving}
            onClick={() => removePage(page)}
          >
            {isRemoving ? <Spinner /> : 'Remove from KB'}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => processPage(page)}>
            Process as KB
          </Button>
        )}
      </li>
    );
  };

  const renderFolderRow = (node: Extract<TreeNode, { kind: 'folder' }>, depth = 0) => {
    const isOpen = expanded.has(node.id);
    const busy = folderBusy.has(node.id);
    const selected = node.folder.selected;
    return (
      <li key={`f-${node.id}`}>
        <div
          className="flex gap-3 justify-between items-center px-4 py-2 bg-muted/30"
          style={{ paddingLeft: `${16 + depth * 18}px` }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpand(node.id)}
            className="flex gap-2 justify-start items-center px-0 min-w-0 font-normal hover:bg-transparent"
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            {selected ? (
              <FolderCheck className="w-4 h-4 shrink-0 text-green-600" />
            ) : (
              <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-medium truncate">{node.title}</span>
            {selected && (
              <Badge variant="success" size="sm">
                In Knowledge Base
              </Badge>
            )}
          </Button>
          {busy ? (
            <span className="text-muted-foreground shrink-0">
              <Spinner />
            </span>
          ) : selected ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 shrink-0 hover:text-red-700"
              onClick={() => removeFolder(node.folder)}
            >
              Remove folder
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => processFolder(node.folder)}
            >
              Add folder to KB
            </Button>
          )}
        </div>
        {isOpen && node.children.length > 0 && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const renderNode = (node: TreeNode, depth = 0) =>
    node.kind === 'folder' ? renderFolderRow(node, depth) : renderPageRow(node.page, depth);

  const hasContent = (pages?.length ?? 0) > 0 || folders.length > 0;
  const showSpacePicker = configuredSpaceKeys.length === 0;

  return (
    <Card padding="none">
      <div className="flex gap-3 justify-between items-center px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{integration.name}</p>
          <p className="text-xs text-muted-foreground">
            {configuredSpaceKeys.join(', ') || spaceKey || 'Pick a space'}
            {pages ? ` · ${processedCount} page(s), ${selectedFolderCount} folder(s) in KB` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {showSpacePicker && (
        <div className="px-4 pt-3">
          <Select
            value={spaceKey}
            onChange={(event) => setSpaceKey(event.target.value)}
            aria-label="Confluence space"
          >
            <option value="" disabled>
              {spaces === null ? 'Loading spaces…' : 'Select a space'}
            </option>
            {(spaces ?? []).map((space) => (
              <option key={space.id} value={space.key}>
                {space.name} ({space.key})
              </option>
            ))}
          </Select>
        </div>
      )}

      {hasContent && (
        <div className="px-4 pt-3">
          <SearchInput value={filter} onChange={setFilter} placeholder="Search folders and pages…" />
        </div>
      )}

      {loading && !pages && (
        <div className="flex gap-2 items-center px-4 py-6 text-sm text-muted-foreground">
          <Spinner /> Loading…
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

      {pages && !hasContent && !loading && (
        <p className="px-4 py-6 text-sm text-muted-foreground">No content found in this space.</p>
      )}

      {/* Search results (flat) */}
      {searchMatches && hasContent && (
        <ul className="mt-2 divide-y divide-border">
          {searchMatches.folders.length === 0 && searchMatches.pages.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No matches for “{filter}”.</li>
          )}
          {searchMatches.folders.map((folder) =>
            renderFolderRow({ kind: 'folder', id: folder.id, title: folder.title, folder, children: [] })
          )}
          {searchMatches.pages.map((page) => renderPageRow(page))}
        </ul>
      )}

      {/* Tree */}
      {!searchMatches && hasContent && (
        <ul className="mt-2 divide-y divide-border">{tree.map((node) => renderNode(node))}</ul>
      )}
    </Card>
  );
};

/**
 * Confluence browse-and-select on the Knowledge Base page. Shows each connected space's folders
 * and pages as a tree. Add a whole FOLDER (ingested recursively — nested sub-folders and all
 * their pages, kept in sync) or individual pages to the KB; remove any time.
 */
export const ConfluenceCatalogSection = ({
  refreshSignal = 0,
  onKbChange,
}: {
  refreshSignal?: number;
  onKbChange?: () => void;
} = {}) => {
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
          Browse your spaces and pick the folders or pages to answer from. Adding a folder pulls
          in everything inside it — including nested sub-folders — and keeps it in sync.
        </p>
      </div>
      {integrations.map((integration) => (
        <IntegrationCatalog
          key={integration.id}
          integration={integration}
          refreshSignal={refreshSignal}
          onKbChange={onKbChange}
        />
      ))}
    </section>
  );
};
