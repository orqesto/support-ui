import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ColumnAlign = 'left' | 'right';

/**
 * How a column maps into the mobile card layout. Reserved for the Phase-3 ListCard
 * mobile renderer — declared now so column configs are forward-compatible.
 */
export type CardSlot = 'title' | 'subtitle' | 'meta' | 'hidden';

export type ColumnDef<Row> = {
  id: string;
  header: ReactNode;
  /** Cell content — return design-system components (Badge, Button, Select…), not raw HTML. */
  cell: (row: Row) => ReactNode;
  align?: ColumnAlign;
  headerClassName?: string;
  cellClassName?: string;
  /** Mobile-card slot (Phase 3). Defaults to 'meta'. */
  card?: CardSlot;
};

/**
 * Search wiring. When `clientAccessor` is set the table filters `rows` itself
 * (client-side); otherwise search is assumed server-side and the caller refetches on
 * `onChange` / `onCommit`.
 */
export type DataTableSearch<Row> = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Server-committed UX (commit on Enter / button) vs live (default). */
  showButton?: boolean;
  onCommit?: () => void;
  /** Fires when the search box blurs — e.g. to clear a committed empty query. */
  onBlur?: () => void;
  /** Set ⇒ client-side filtering over these fields (case-insensitive substring). */
  clientAccessor?: (row: Row) => Array<string | null | undefined>;
};

/**
 * Pagination. `client` mode slices `rows` internally (single source for the
 * clamp/slice/page-reset logic every page used to hand-roll). `server` mode renders the
 * footer from API-supplied meta and calls back.
 */
export type DataTablePagination =
  | { mode: 'client'; pageSize: number }
  | {
      mode: 'server';
      page: number;
      totalPages: number;
      total: number;
      limit: number;
      onPageChange: (page: number) => void;
      loading?: boolean;
    };

export type DataTableProps<Row> = {
  rows: Row[];
  rowKey: (row: Row) => string | number;
  columns: ColumnDef<Row>[];
  /** Right-aligned trailing actions cell (capability-gated icon buttons). */
  actions?: (row: Row) => ReactNode;
  /** Left side of the toolbar — e.g. a result count and/or a filter `Select`. */
  toolbarStart?: ReactNode;
  search?: DataTableSearch<Row>;
  pagination: DataTablePagination;
  /** Error banner with a Retry action (server fetch failures). */
  isError?: boolean;
  onRetry?: () => void;
  empty?: { icon?: LucideIcon; message: string; filteredMessage?: string };
  className?: string;
  /** Accessible label for the trailing actions column header (visually hidden). */
  actionsLabel?: string;
  /**
   * Opt-in inline edit: when this returns a node for a row, that row renders as a single
   * full-width cell holding the node instead of its normal columns (PlatformOrganizations'
   * edit-in-row). Return null/undefined/false to render the row normally.
   */
  renderEditRow?: (row: Row) => ReactNode;
  /**
   * Client mode only: changing this value resets the internal page to 1. Use it when an
   * EXTERNAL filter (e.g. a status `Select`) narrows `rows` — the table resets its page on
   * a search-term change on its own, but can't see a filter the page applied before passing
   * `rows` in. Pass a key that changes with that filter (e.g. the filter value, or a
   * composite `` `${status}:${query}` ``).
   */
  resetPageKey?: string | number;
};
