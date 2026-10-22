import {
  ChevronDown,
  Columns2,
  Filter,
  LayoutList,
  List,
  MessagesSquare,
  Rows3,
  Square,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import type { TicketFilters, TicketSortBy, TicketSorting } from '@/stores/ticketsStore';
import type { Ticket, TicketStatus } from '@/types';
import { TicketCard } from './TicketCard';
import { TicketRow } from './TicketRow';
import { STATUS_ORDER, filterValue, withoutFilter, type TicketFilterKey } from './ticketFilterKeys';
import { StatusDot } from './ticketRowBits';
import { HIDE_BELOW_MD, HIDE_BELOW_XL, TICKET_GRID, type TicketRowProps } from './ticketRowShared';
import { viewFiltersOf } from './ticketViews';

export type TicketDensity = 'table' | 'cards';
export type TicketLayout = 'list' | 'split';

export type TicketTableProps = Omit<TicketRowProps, 'ticket' | 'current'> & {
  tickets: Ticket[];
  total: number;
  loading: boolean;
  filters: TicketFilters;
  sorting: TicketSorting;
  keys: TicketFilterKey[];
  density: TicketDensity;
  group: boolean;
  layout: TicketLayout;
  /** Split needs room; where there is none the choice is not offered. */
  splitAvailable: boolean;
  currentId: number | null;
  onFilters: (filters: TicketFilters) => void;
  onSort: (sorting: TicketSorting) => void;
  onDensity: (density: TicketDensity) => void;
  onGroup: (group: boolean) => void;
  onLayout: (layout: TicketLayout) => void;
  onClearFilters: () => void;
  /** Shown in the empty state when nothing is filtered (New ticket). */
  emptyAction: ReactNode;
};

const SORT_OF: Partial<
  Record<keyof TicketFilters, { sortBy: TicketSortBy; label: string; order: 'asc' | 'desc' }>
> = {
  priority: { sortBy: 'priority', label: 'Highest priority first', order: 'desc' },
  threads: { sortBy: 'threads', label: 'Most threads first', order: 'desc' },
  owes: { sortBy: 'owed', label: 'Most owed first', order: 'desc' },
  updated: { sortBy: 'updatedAt', label: 'Recently updated first', order: 'desc' },
  status: { sortBy: 'status', label: 'Status order', order: 'asc' },
};

/** A column header that filters (and, where it can, sorts) by its own column. */
const ColumnHeader = ({
  label,
  field,
  keys,
  filters,
  sorting,
  onFilters,
  onSort,
  alignEnd,
}: {
  label: string;
  field: keyof TicketFilters;
  keys: TicketFilterKey[];
  filters: TicketFilters;
  sorting: TicketSorting;
  onFilters: (filters: TicketFilters) => void;
  onSort: (sorting: TicketSorting) => void;
  alignEnd?: boolean;
}) => {
  const filterKey = keys.find((key) => key.field === field);
  const sort = SORT_OF[field];
  const filtered = filterValue(filters, field) !== undefined;
  const sorted = sort && sorting.sortBy === sort.sortBy;
  return (
    <Menu
      ariaLabel={`${label} column`}
      align={alignEnd ? 'end' : 'start'}
      width={260}
      trigger={({ open, toggle }) => (
        <Button
          variant="ghost"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label}: filter${sort ? ' and sort' : ''}${filtered ? ' (filtered)' : ''}`}
          className={`gap-1 px-1.5 -mx-1.5 h-[22px] font-display text-[10.5px] font-semibold tracking-wider uppercase rounded ${
            filtered ? 'text-primary' : sorted ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {label}
          {sorted && <ChevronDown className="w-3 h-3" />}
          <Filter className={`w-3 h-3 ${filtered ? 'opacity-100' : 'opacity-40'}`} />
        </Button>
      )}
    >
      <MenuLabel>{label}</MenuLabel>
      {sort && (
        <MenuItem
          checked={!!sorted}
          onSelect={() => onSort({ sortBy: sort.sortBy, sortOrder: sort.order })}
        >
          {sort.label}
        </MenuItem>
      )}
      {filterKey && (
        <>
          <MenuSeparator />
          <MenuLabel>Show only</MenuLabel>
          {filterKey.options.map((option) => {
            const on = filterValue(filters, field) === option.value;
            return (
              <MenuItem
                key={option.value}
                checked={on}
                icon={
                  option.dot ? (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: option.dot }}
                    />
                  ) : undefined
                }
                // From a column, picking the active value again turns the filter off.
                onSelect={() =>
                  onFilters(
                    on ? withoutFilter(filters, field) : { ...filters, [field]: option.value }
                  )
                }
              >
                {option.label}
              </MenuItem>
            );
          })}
        </>
      )}
    </Menu>
  );
};

/** The tickets list: caption, column headers, rows or cards, optionally grouped by status. */
export const TicketTable = (props: TicketTableProps) => {
  const {
    tickets,
    total,
    loading,
    filters,
    sorting,
    keys,
    density,
    group,
    layout,
    splitAvailable,
    currentId,
    onFilters,
    onSort,
    onDensity,
    onGroup,
    onLayout,
    onClearFilters,
    emptyAction,
  } = props;
  // Closed is collapsed until opened: done work, rarely what someone came for.
  const [collapsed, setCollapsed] = useState<Partial<Record<TicketStatus, boolean>>>({
    closed: true,
  });
  // The split pane is too narrow for columns, so it always shows cards.
  const cards = density === 'cards' || layout === 'split';
  const Row = cards ? TicketCard : TicketRow;
  const filtered = Object.keys(viewFiltersOf(filters)).length > 0 || !!filters.search?.trim();

  const renderRow = (ticket: Ticket) => (
    <Row
      key={ticket.id}
      ticket={ticket}
      current={ticket.id === currentId}
      canManage={props.canManage}
      assignees={props.assignees}
      currentUserId={props.currentUserId}
      onOpen={props.onOpen}
      onAssign={props.onAssign}
      onRowMenu={props.onRowMenu}
    />
  );

  const header = (field: keyof TicketFilters, label: string, alignEnd?: boolean) => (
    <ColumnHeader
      label={label}
      field={field}
      keys={keys}
      filters={filters}
      sorting={sorting}
      onFilters={onFilters}
      onSort={onSort}
      alignEnd={alignEnd}
    />
  );

  const caption = (
    <div className="flex flex-wrap gap-2.5 items-center px-3 py-1.5 rounded-t-lg border border-b-0 min-h-[38px] border-border bg-muted/40 text-[12.5px] text-muted-foreground">
      <span
        className="inline-flex gap-1.5 items-center font-semibold text-success"
        title="The list updates by itself"
      >
        <span className="w-[7px] h-[7px] rounded-full bg-success animate-pulse" />
        Live
      </span>
      <span>
        {loading ? (
          'Loading…'
        ) : (
          <>
            <strong className="font-mono font-semibold text-foreground">{total}</strong>{' '}
            {total === 1 ? 'ticket' : 'tickets'}
          </>
        )}
      </span>
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={group}
        onClick={() => onGroup(!group)}
        className={group ? 'text-primary bg-primary/10' : ''}
      >
        <LayoutList className="mr-1.5 w-3.5 h-3.5" />
        Group by status
      </Button>
      <span
        role="group"
        aria-label="Row density"
        className="flex gap-0.5 p-0.5 rounded-lg border border-border bg-muted"
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Table rows"
          aria-pressed={density === 'table'}
          onClick={() => onDensity('table')}
          className="p-0 w-7 h-6"
        >
          <Rows3 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Card rows"
          aria-pressed={density === 'cards'}
          onClick={() => onDensity('cards')}
          className="p-0 w-7 h-6"
        >
          <List className="w-3.5 h-3.5" />
        </Button>
      </span>
      {splitAvailable && (
        <span
          role="group"
          aria-label="Layout"
          className="flex gap-0.5 p-0.5 rounded-lg border border-border bg-muted"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-label="Full-width list"
            aria-pressed={layout === 'list'}
            onClick={() => onLayout('list')}
            className="p-0 w-7 h-6"
          >
            <Square className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Split layout"
            aria-pressed={layout === 'split'}
            onClick={() => onLayout('split')}
            className="p-0 w-7 h-6"
          >
            <Columns2 className="w-3.5 h-3.5" />
          </Button>
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        {caption}
        <div className="rounded-b-lg border border-border bg-card">
          {Array.from({ length: 6 }, (_, idx) => (
            <div
              key={`skel-${String(idx)}`}
              className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-4 py-3.5 border-t border-border/60 first:border-t-0"
            >
              <span className="h-2.5 rounded bg-muted animate-pulse" />
              <span className="h-2.5 rounded bg-muted animate-pulse" />
              <span className="h-2.5 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div>
        {caption}
        <div className="grid gap-2.5 justify-items-center px-5 py-14 text-center rounded-b-lg border border-border bg-card text-[13.5px] text-muted-foreground">
          <MessagesSquare className="w-6 h-6" />
          <b className="text-[15px] text-foreground">
            {filtered ? 'No tickets match these filters' : 'No tickets yet'}
          </b>
          <span>
            {filtered
              ? 'Clear a filter or pick another view.'
              : 'Create one for a cause, or from a thread — and link the threads it explains.'}
          </span>
          {filtered ? (
            <Button size="sm" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : (
            emptyAction
          )}
        </div>
      </div>
    );
  }

  const groups = STATUS_ORDER.map((status) => ({
    status,
    rows: tickets.filter((ticket) => ticket.status === status),
  })).filter((section) => section.rows.length > 0);

  const body = group
    ? groups.map(({ status, rows: sectionRows }) => {
        const open = !collapsed[status];
        const owed = sectionRows.reduce((sum, ticket) => sum + (ticket.owedCount ?? 0), 0);
        return (
          <div key={status} role="rowgroup">
            <Button
              variant="ghost"
              aria-expanded={open}
              onClick={() => setCollapsed((prev) => ({ ...prev, [status]: open }))}
              className={`flex gap-2 justify-start px-3.5 w-full h-9 font-semibold rounded-none text-[12.5px] ${
                cards ? '' : 'border-t border-border bg-muted/40 first:border-t-0'
              }`}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
              />
              <StatusDot status={status} />{' '}
              <span className="font-mono font-medium text-muted-foreground">
                {sectionRows.length}
              </span>{' '}
              {owed > 0 && (
                <Badge size="sm" variant="danger" className="cursor-default">
                  {owed} owed
                </Badge>
              )}
            </Button>
            {open && <div className={cards ? 'grid gap-2' : ''}>{sectionRows.map(renderRow)}</div>}
          </div>
        );
      })
    : tickets.map(renderRow);

  return (
    <div>
      {caption}
      {cards ? (
        <div role="table" aria-label="Tickets" className="grid gap-2 pt-2">
          {body}
        </div>
      ) : (
        <div
          role="table"
          aria-label="Tickets"
          className="overflow-hidden rounded-b-lg border border-border bg-card"
        >
          <div role="row" className={`${TICKET_GRID} h-8 border-b border-border/60`}>
            <span role="columnheader">{header('priority', 'P')}</span>
            <span
              role="columnheader"
              className="font-display text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground"
            >
              Ticket
            </span>
            <span role="columnheader" className={HIDE_BELOW_XL}>
              {header('categoryId', 'Category')}
            </span>
            <span role="columnheader">{header('threads', 'Threads')}</span>
            <span role="columnheader">{header('owes', 'Owed')}</span>
            <span role="columnheader" className={HIDE_BELOW_MD}>
              {header('status', 'Status')}
            </span>
            <span role="columnheader" className={HIDE_BELOW_MD}>
              {header('assigneeId', 'Assignee', true)}
            </span>
            <span role="columnheader" className={`${HIDE_BELOW_MD} justify-end`}>
              {header('updated', 'Updated', true)}
            </span>
            <span role="columnheader" />
          </div>
          {body}
        </div>
      )}
    </div>
  );
};
