import { ChevronDown, Filter } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';

/**
 * A table column title that opens its own menu — filters by that column and, where the list can,
 * sorts by it. ONE look for the Tickets and Threads tables (Claude Design "Tickets v3" /
 * "Messages list v4" `.thb`): uppercase label, a chevron while the list is sorted by it, and a
 * funnel shown on hover/focus, or for good while the column filters the list.
 */
export const ColumnMenu = ({
  label,
  filtered,
  sorted,
  sortable,
  showFilterIcon = true,
  alignEnd,
  width = 260,
  children,
}: {
  label: string;
  /** The list is narrowed by this column. */
  filtered: boolean;
  /** The list is ordered by this column. */
  sorted: boolean;
  /** The menu offers a sort (named in the trigger's accessible name). */
  sortable: boolean;
  showFilterIcon?: boolean;
  alignEnd?: boolean;
  width?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) => (
  <Menu
    ariaLabel={`${label} column`}
    align={alignEnd ? 'end' : 'start'}
    width={width}
    trigger={({ open, toggle }) => (
      <Button
        variant="ghost"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: filter${sortable ? ' and sort' : ''}${filtered ? ' (filtered)' : ''}`}
        className={`group/th gap-1 px-1.5 -mx-1.5 h-[22px] font-display text-[10.5px] font-semibold tracking-wider uppercase rounded ${
          filtered ? 'text-primary' : sorted ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
        {sorted && <ChevronDown className="w-3 h-3" />}
        {showFilterIcon && (
          <Filter
            className={`w-3 h-3 ${filtered ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-70 group-focus-visible/th:opacity-70'}`}
          />
        )}
      </Button>
    )}
  >
    {children}
  </Menu>
);
