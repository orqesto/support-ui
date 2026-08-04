import { memo, useMemo, type ReactNode } from 'react';
import type { ConfluencePageNode } from '@/services/integrations.service';

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
export const PageTree = ({
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
    const list: ConfluencePageNode[] = [];
    for (const page of pages) {
      if (!seen.has(page.id)) {
        seen.add(page.id);
        list.push(page);
      }
    }
    const ids = new Set(list.map((page) => page.id));
    const parentMap = new Map<string | null, ConfluencePageNode[]>();
    for (const page of list) {
      const key = page.parentId && ids.has(page.parentId) ? page.parentId : null; // orphan → root
      const arr = parentMap.get(key);
      if (arr) arr.push(page);
      else parentMap.set(key, [page]);
    }
    for (const arr of parentMap.values())
      arr.sort((first, second) => first.title.localeCompare(second.title));
    return { deduped: list, byParent: parentMap };
  }, [pages]);

  const needle = filter.trim().toLowerCase();
  if (needle) {
    const matches = deduped.filter((page) => page.title.toLowerCase().includes(needle));
    if (matches.length === 0) {
      return <p className="py-2 text-xs text-muted-foreground">No pages match “{filter}”.</p>;
    }
    return (
      <div>
        {matches.map((page) => (
          <PageRow
            key={page.id}
            node={page}
            depth={0}
            checked={selected.has(page.id)}
            onToggle={onToggle}
          />
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
