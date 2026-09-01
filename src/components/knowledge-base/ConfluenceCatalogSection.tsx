import { ChevronDown, ChevronRight, FileText, Folder, FolderCheck, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { documentationService } from '@/services/documentation.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  integrationsService,
  type ConfluenceFolderNode,
  type ConfluenceIntegration,
  type ConfluencePageNode,
  type ConfluenceSpace,
} from '@/services/integrations.service';

const POLL_MS = 2500;
const MAX_POLLS = 48; // ~2 min ceiling so a stuck job can't poll forever
// Auto-expand only the first N levels on load so a large space doesn't render as a wall.
const AUTO_EXPAND_DEPTH = 2;
// Above this descendant-page count, adding a folder asks for confirmation first.
const CONFIRM_ADD_THRESHOLD = 15;

// KB-state badge shown next to a processed page's / selected folder's title.
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

// A node in the browse tree. BOTH folders and pages can have children — Confluence nests
// folders and sub-pages under a page (e.g. the space homepage), not only under folders.
type TreeNode = {
  kind: 'folder' | 'page';
  id: string;
  title: string;
  folder?: ConfluenceFolderNode;
  page?: ConfluencePageNode;
  children: TreeNode[];
};

const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
  [...nodes].sort((first, second) =>
    first.kind !== second.kind
      ? first.kind === 'folder'
        ? -1
        : 1
      : first.title.localeCompare(second.title)
  );

// Build a folder/page tree from the flat lists using parentId. A node whose parent isn't in
// the set (or is null) is a root (top-level under the space). Children attach to ANY parent
// node — folder OR page — so subtrees hanging off a page (the homepage) are not lost.
const buildTree = (folders: ConfluenceFolderNode[], pages: ConfluencePageNode[]): TreeNode[] => {
  const byId = new Map<string, TreeNode>();
  for (const folder of folders)
    byId.set(folder.id, {
      kind: 'folder',
      id: folder.id,
      title: folder.title || 'Untitled folder',
      folder,
      children: [],
    });
  for (const page of pages)
    byId.set(page.id, { kind: 'page', id: page.id, title: page.title, page, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.kind === 'folder' ? node.folder?.parentId : node.page?.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const node of byId.values()) node.children = sortNodes(node.children);
  return sortNodes(roots);
};

// Ids of parents to auto-expand on first load — capped to the first AUTO_EXPAND_DEPTH levels.
const collectParentIds = (
  nodes: TreeNode[],
  depth = 0,
  acc: Set<string> = new Set()
): Set<string> => {
  for (const node of nodes) {
    if (node.children.length > 0) {
      if (depth < AUTO_EXPAND_DEPTH) acc.add(node.id);
      collectParentIds(node.children, depth + 1, acc);
    }
  }
  return acc;
};

// Count all page descendants of a node (for the "Add folder · N pages" hint / confirm).
const countDescendantPages = (node: TreeNode): number =>
  node.children.reduce(
    (sum, child) => sum + (child.kind === 'page' ? 1 : 0) + countDescendantPages(child),
    0
  );

type ConfirmState = {
  title: string;
  description: string;
  confirmText: string;
  onConfirm: () => void;
} | null;

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
  const [refreshing, setRefreshing] = useState(false); // manual-refresh spin state
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set()); // page ids queued/processing
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [folderBusy, setFolderBusy] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
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
    integrationsService.processConfluencePage(integration.id, page.id).catch((err) => {
      setError(
        getApiErrorMessage(err) ??
          `Could not queue “${page.title}” for the Knowledge Base.`
      );
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
      .catch((err) =>
        setError(
          getApiErrorMessage(err) ?? `Could not remove “${page.title}” from the Knowledge Base.`
        )
      )
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

  const doProcessFolder = (folder: ConfluenceFolderNode) => {
    setError(null);
    setFolderSelected(folder.id, true); // optimistic
    withFolderBusy(
      folder.id,
      integrationsService
        .processConfluenceFolder(integration.id, folder.id)
        .then(() => refresh())
        .then(() => onKbChange?.())
        .catch((err) => {
          setError(
            getApiErrorMessage(err) ??
              `Could not add “${folder.title}” to the Knowledge Base.`
          );
          setFolderSelected(folder.id, false);
        })
    );
  };

  const doRemoveFolder = (folder: ConfluenceFolderNode) => {
    setError(null);
    setFolderSelected(folder.id, false); // optimistic
    withFolderBusy(
      folder.id,
      integrationsService
        .removeConfluenceFolder(integration.id, folder.id)
        .then(() => refresh())
        .then(() => onKbChange?.())
        .catch((err) => {
          setError(
            getApiErrorMessage(err) ??
              `Could not remove “${folder.title}” from the selection.`
          );
          setFolderSelected(folder.id, true);
        })
    );
  };

  // Confirm before adding a large folder, and always before removing one (it drops pages).
  const requestProcessFolder = (folder: ConfluenceFolderNode, pageCount: number) => {
    if (pageCount > CONFIRM_ADD_THRESHOLD) {
      setConfirm({
        title: 'Add folder to Knowledge Base',
        description: `This adds “${folder.title}” and its ${pageCount} pages — including nested sub-folders — to the Knowledge Base, and keeps them in sync.`,
        confirmText: 'Add to KB',
        onConfirm: () => doProcessFolder(folder),
      });
    } else {
      doProcessFolder(folder);
    }
  };

  const requestRemoveFolder = (folder: ConfluenceFolderNode, pageCount: number) => {
    setConfirm({
      title: 'Remove folder from Knowledge Base',
      description: `This removes “${folder.title}”${pageCount > 0 ? ` and its ${pageCount} page(s)` : ''} from the Knowledge Base. Pages also covered by another selected folder are kept.`,
      confirmText: 'Remove',
      onConfirm: () => doRemoveFolder(folder),
    });
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tree = useMemo(() => buildTree(folders, pages ?? []), [folders, pages]);

  // Auto-expand the first levels once on load (Confluence nests folders under the space
  // homepage; a fully-collapsed root would hide everything).
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current) return;
    if ((pages?.length ?? 0) > 0 || folders.length > 0) {
      setExpanded(collectParentIds(tree));
      autoExpandedRef.current = true;
    }
  }, [tree, pages, folders]);

  // Pages/folders that sit under a SELECTED folder — they're managed by that folder, so their
  // own Add/Remove controls are suppressed (removing them individually wouldn't stick).
  const { coveredPages, coveredFolders } = useMemo(() => {
    const cp = new Set<string>();
    const cf = new Set<string>();
    const selectedIds = new Set(folders.filter((folder) => folder.selected).map((folder) => folder.id));
    const walk = (nodes: TreeNode[], underSelected: boolean) => {
      for (const node of nodes) {
        if (underSelected) (node.kind === 'page' ? cp : cf).add(node.id);
        walk(node.children, underSelected || (node.kind === 'folder' && selectedIds.has(node.id)));
      }
    };
    walk(tree, false);
    return { coveredPages: cp, coveredFolders: cf };
  }, [tree, folders]);

  const selectedFolderCount = folders.filter((folder) => folder.selected).length;
  // Individually-added pages = processed pages NOT already covered by a selected folder.
  const individualPageCount = (pages ?? []).filter(
    (page) => page.processed && !coveredPages.has(page.id)
  ).length;
  const needle = filter.trim().toLowerCase();

  // Search mode: flat list of matching folders + pages (hierarchy ignored while searching).
  const searchMatches = useMemo(() => {
    if (!needle) return null;
    const folderHits = folders.filter((folder) => folder.title.toLowerCase().includes(needle));
    const pageHits = (pages ?? []).filter((page) => page.title.toLowerCase().includes(needle));
    return { folders: folderHits, pages: pageHits };
  }, [needle, folders, pages]);

  // Unified row renderer — a folder OR a page, each of which may have children.
  const renderNode = (node: TreeNode, depth = 0): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const isFolder = node.kind === 'folder';
    const page = node.page;
    const folder = node.folder;
    const busy = isFolder && folder ? folderBusy.has(folder.id) : false;
    const isProcessing = !isFolder && !!page && (pending.has(page.id) || page.status === 'processing');
    const isRemoving = !isFolder && !!page && removing.has(page.id);
    const folderSelected = isFolder && folder ? folder.selected : false;
    const covered = isFolder ? coveredFolders.has(node.id) : coveredPages.has(node.id);
    const childPages = isFolder ? countDescendantPages(node) : 0;

    const renderAction = () => {
      // Covered by a selected ancestor folder → managed there; show a passive note, no control.
      if (covered) {
        return (
          <Badge variant="secondary" size="sm">
            {isFolder ? 'Included' : 'Via folder'}
          </Badge>
        );
      }
      if (isFolder && folder) {
        if (busy)
          return (
            <span className="text-muted-foreground shrink-0">
              <Spinner />
            </span>
          );
        return folderSelected ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 shrink-0 hover:text-red-700"
            onClick={() => requestRemoveFolder(folder, childPages)}
          >
            Remove from KB
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => requestProcessFolder(folder, childPages)}
          >
            Add to KB{childPages > 0 ? ` · ${childPages} page${childPages === 1 ? '' : 's'}` : ''}
          </Button>
        );
      }
      if (page) {
        if (isProcessing)
          return (
            <span className="text-muted-foreground shrink-0">
              <Spinner />
            </span>
          );
        return page.processed ? (
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
            Add to KB
          </Button>
        );
      }
      return null;
    };

    return (
      <li
        key={`${node.kind}-${node.id}`}
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={isFolder ? folderSelected : Boolean(page?.processed)}
      >
        <div
          className={`flex gap-2 justify-between items-center px-4 py-2 ${isFolder ? 'bg-muted/30' : ''}`}
          style={{ paddingLeft: `${16 + depth * 18}px` }}
        >
          <div className="flex gap-2 items-center min-w-0">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand(node.id)}
                aria-label={isOpen ? 'Collapse' : 'Expand'}
                className="p-0 w-5 h-5 shrink-0 hover:bg-transparent"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
            ) : (
              <span className="w-5 shrink-0" aria-hidden />
            )}
            {isFolder ? (
              folderSelected ? (
                <FolderCheck className="w-4 h-4 shrink-0 text-green-600" />
              ) : (
                <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
              )
            ) : (
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <span className={`text-sm truncate ${isFolder ? 'font-medium' : ''}`}>{node.title}</span>
            {hasChildren && (
              <span className="text-xs text-muted-foreground shrink-0">({node.children.length})</span>
            )}
            {isProcessing ? (
              <Badge variant="warning" size="sm">
                Processing…
              </Badge>
            ) : isFolder ? (
              folderSelected && (
                <Badge variant="success" size="sm">
                  In Knowledge Base
                </Badge>
              )
            ) : (
              page?.processed && <StatusBadge status={page.status} />
            )}
          </div>
          {renderAction()}
        </div>
        {isOpen && hasChildren && (
          <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  // Wrap a flat folder/page (search results) as a childless node for the same renderer.
  const folderLeaf = (folder: ConfluenceFolderNode): TreeNode => ({
    kind: 'folder',
    id: folder.id,
    title: folder.title || 'Untitled folder',
    folder,
    children: [],
  });
  const pageLeaf = (page: ConfluencePageNode): TreeNode => ({
    kind: 'page',
    id: page.id,
    title: page.title,
    page,
    children: [],
  });

  const hasContent = (pages?.length ?? 0) > 0 || folders.length > 0;
  const showSpacePicker = configuredSpaceKeys.length === 0;

  return (
    <Card padding="none">
      <div className="flex gap-3 justify-between items-center px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{integration.name}</p>
          <p className="text-xs text-muted-foreground">
            {configuredSpaceKeys.join(', ') || spaceKey || 'Pick a space'}
            {pages
              ? ` · ${selectedFolderCount} folder${selectedFolderCount === 1 ? '' : 's'}, ${individualPageCount} page${individualPageCount === 1 ? '' : 's'} in KB`
              : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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

      {/* Deep trees scroll horizontally inside their own container (page never scrolls sideways). */}
      <div className="overflow-x-auto">
        {/* Search results (flat) */}
        {searchMatches && hasContent && (
          <ul role="tree" className="mt-2 divide-y divide-border">
            {searchMatches.folders.length === 0 && searchMatches.pages.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No matches for “{filter}”.</li>
            )}
            {searchMatches.folders.map((folder) => renderNode(folderLeaf(folder)))}
            {searchMatches.pages.map((page) => renderNode(pageLeaf(page)))}
          </ul>
        )}

        {/* Tree */}
        {!searchMatches && hasContent && (
          <ul role="tree" className="mt-2 divide-y divide-border">
            {tree.map((node) => renderNode(node))}
          </ul>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          title={confirm.title}
          description={confirm.description}
          confirmText={confirm.confirmText}
        />
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
