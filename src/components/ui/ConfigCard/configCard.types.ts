import type { ReactNode } from 'react';
import type { ConfigCardState } from '@/types/configCard';

// Moved to `@/types/configCard` (modularity task F2): a hook names it too.
export type { ConfigCardState };

/**
 * One row of the read-only view.
 *
 * `source` is the provenance phrase — "from environment", "from console". The
 * read-only view is the RIGHT place for it: freed from competing with an input for
 * space it can be a readable phrase rather than a cramped chip, so consolidating on
 * this pattern gains provenance rather than costing it.
 */
export interface ConfigSummaryRow {
  label: string;
  /** Rendered value. Nullish falls back to `placeholder`, so callers can pass raw config. */
  value?: ReactNode;
  source?: string;
  /** Shown when `value` is nullish or an empty string. */
  placeholder?: string;
}

export interface ConfigCardProps {
  title: string;
  /** Lucide icon element, rendered before the title. */
  icon?: ReactNode;
  description?: ReactNode;
  state: ConfigCardState;

  /** Read-only rows, shown in the `stored` state. */
  summary?: ConfigSummaryRow[];
  /** Shown in the `empty` state: say what happens WITHOUT a config, not just "nothing set". */
  emptyNote?: ReactNode;
  /** The edit form. Rendered only in the `editing` state. */
  children?: ReactNode;

  /** Trailing content under the body in every state — a probe result, a warning. */
  note?: ReactNode;
  /** Extra controls beside the primary action (Test, Remove). */
  extraActions?: ReactNode;

  onConfigure?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;

  saveDisabled?: boolean;
  saving?: boolean;
  /** Disables Configure / Edit, e.g. while a request that changes the stored config is in flight. */
  editDisabled?: boolean;

  /** Overrides for the primary action wording, e.g. "Save storage default". */
  configureLabel?: string;
  editLabel?: string;
  saveLabel?: string;
}
