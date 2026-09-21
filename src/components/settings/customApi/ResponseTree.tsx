import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import type { FieldPick } from '@/services/customApi.service';

/**
 * The vendor's real response as a TICKABLE TREE — CA-5 Task 3, and the reason the phase exists.
 *
 * ⛔ IF AN ADMIN MUST TYPE `data.orders[].order_id`, THIS IS NOT SELF-SERVE however many forms
 * surround it. They press Test (or paste a response), see what their own system returned, and
 * tick what an agent should see.
 *
 * ⛔ THE TREE IS BUILT FROM THE BACKEND'S `paths`, never from a shape derived here. Those paths
 * are row-relative and are exactly what the executor resolves against each row, so what the admin
 * ticks is what works. Deriving the shape again in the browser is how a picker starts offering
 * fields that silently never match.
 *
 * ⛔ IT SHOWS STRUCTURE, NOT VALUES. The backend sends keys and types and discards every scalar,
 * because one real order carries a customer's email, telephone, postal address and IP.
 */

interface Props {
  /** Row-relative paths from the Send test or a pasted sample. */
  paths: string[];
  picked: FieldPick[];
  onToggle: (path: string, next: boolean) => void;
  /**
   * Paths that were picked before and are NOT in `paths` any more. Named rather than silently
   * dropped: an admin who re-tests to check a lookup is alive must be told what vanished.
   */
  missing?: string[];
}

interface TreeNode {
  /** The last segment, which is what the admin reads. */
  segment: string;
  /** The full row-relative path, which is what gets stored. */
  path: string;
  children: TreeNode[];
  /** A leaf is pickable; a branch is structure and is not. */
  leaf: boolean;
}

/**
 * Split a row-relative path into readable segments. `products[].name` is two segments, and the
 * `[]` stays attached so the admin can see that `products` is a list rather than being told it in
 * prose somewhere else.
 */
const segmentsOf = (path: string): string[] =>
  path
    .split('.')
    .flatMap((part) => (part ? [part] : []))
    .filter(Boolean);

const buildTree = (paths: string[]): TreeNode[] => {
  const roots: TreeNode[] = [];
  for (const path of paths) {
    const segments = segmentsOf(path);
    let level = roots;
    let walked = '';
    segments.forEach((segment, index) => {
      walked = walked ? `${walked}.${segment}` : segment;
      let node = level.find((candidate) => candidate.segment === segment);
      if (!node) {
        node = { segment, path: walked, children: [], leaf: false };
        level.push(node);
      }
      // Only the last segment of a path is pickable; the ones above it are containers. A path that
      // is also a prefix of another (rare, but a vendor can do it) stays a branch — ticking it
      // would store a path whose value is an object the agent's panel cannot render.
      if (index === segments.length - 1) node.leaf = true;
      level = node.children;
    });
  }
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((node) => ({
      ...node,
      leaf: node.leaf && node.children.length === 0,
      children: prune(node.children),
    }));
  return prune(roots);
};

const Branch = ({
  nodes,
  depth,
  picked,
  onToggle,
}: {
  nodes: TreeNode[];
  depth: number;
  picked: Set<string>;
  onToggle: Props['onToggle'];
}) => (
  <ul className="space-y-1">
    {nodes.map((node) => (
      <li key={node.path} style={{ paddingLeft: depth * 16 }}>
        {node.leaf ? (
          <Checkbox
            size="sm"
            checked={picked.has(node.path)}
            onChange={(event) => onToggle(node.path, event.target.checked)}
            label={
              <span className="text-xs">
                {node.segment}
                {/* The full path, quietly, for the admin who does want to see it. */}
                {node.path !== node.segment && (
                  <span className="ml-2 text-muted-foreground">{node.path}</span>
                )}
              </span>
            }
          />
        ) : (
          <p className="text-xs font-medium text-muted-foreground">{node.segment}</p>
        )}
        {node.children.length > 0 && (
          <Branch nodes={node.children} depth={depth + 1} picked={picked} onToggle={onToggle} />
        )}
      </li>
    ))}
  </ul>
);

export const ResponseTree = ({ paths, picked, onToggle, missing = [] }: Props) => {
  const tree = useMemo(() => buildTree(paths), [paths]);
  const pickedPaths = useMemo(() => new Set(picked.map((field) => field.path)), [picked]);

  if (paths.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing to choose from yet — run a test, or paste a response from your system.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {missing.length > 0 && (
        /*
         * ⛔ NAMED, NOT DISCARDED. An admin who presses Test to check something is alive must not
         * lose their configuration, and must be told which fields their system stopped returning
         * — a field that quietly disappears is a column that goes blank for agents with no
         * explanation anywhere.
         */
        <p className="text-xs text-warning">
          Your system did not return {missing.join(', ')} this time. We have kept{' '}
          {missing.length === 1 ? 'it' : 'them'} selected, but agents will not see{' '}
          {missing.length === 1 ? 'that field' : 'those fields'} until it comes back.
          {/*
           * ⛔ THE WORDS HAVE TO MATCH WHAT THE BACKEND WILL DO. `shape_changed` fires only when
           * EVERY configured path is missing — so losing one field of several is the mild thing
           * this sentence describes, but losing them ALL makes the whole lookup report a changed
           * shape and show an agent nothing at all. Audit pass 3: the original wording described
           * the mild case in both states.
           */}
          {missing.length === picked.length && (
            <>
              {' '}
              <strong>
                That is every field this lookup shows, so agents will see it as “this lookup’s
                fields have changed” rather than as a result.
              </strong>
            </>
          )}
        </p>
      )}
      <Branch nodes={tree} depth={0} picked={pickedPaths} onToggle={onToggle} />
    </div>
  );
};
