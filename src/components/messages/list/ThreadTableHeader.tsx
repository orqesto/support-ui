import { useMemo } from 'react';
import { X } from 'lucide-react';
import { ColumnMenu } from '@/components/list/ColumnMenu';
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { buildFilterDefs, type FilterDef } from '@/components/messages/filters/filterSchema';
import { useFilterOptions } from '@/components/messages/filters/useFilterOptions';
import { presetToSorting, sortingToPreset } from '@/components/messages/sortPresets';
import { COLUMNS } from '@/components/messages/kanbanColumns';
import { useLeadsHidden } from '@/hooks/useLeadsHidden';
import type { FilterState, SortingState } from '@/stores/messagesStore';
import { THREAD_TABLE_GRID } from './threadTableParts';
import { TRIAGE_IDS } from './ThreadViews';

type Sort = [preset: string, label: string];
type Column = {
  label: string;
  /** Sort presets offered by this column (`sortPresets.ts` — the cards' select uses the same). */
  sorts?: Sort[];
  /** Filter sections: a schema key, under a heading. */
  sections: Array<[heading: string, key: string]>;
  /** On/off filters (flags). */
  flags?: string[];
  alignEnd?: boolean;
  showFilterIcon?: boolean;
};

/** The design's header menus (messages-list-table.js `HM`), on the app's own filter keys. */
const COLUMN: Record<'pri' | 'from' | 'sig' | 'st' | 'as' | 'up', Column> = {
  pri: {
    label: 'P',
    sorts: [
      ['priority', 'Highest first'],
      ['priority_low', 'Lowest first'],
      ['priority_sla', 'Priority, then SLA'],
    ],
    sections: [['Priority', 'priority']],
    showFilterIcon: false,
  },
  from: {
    label: 'From',
    sections: [
      ['Team', 'departmentId'],
      ['Source', 'messageSourceId'],
    ],
  },
  sig: {
    label: 'Signals',
    sorts: [
      ['sla', 'SLA: most urgent'],
      ['sla_low', 'SLA: least urgent'],
    ],
    sections: [['AI state', 'aiState']],
    flags: ['slaBreached', 'slaAtRisk', 'hasAttachments'],
  },
  st: { label: 'Status', sections: [['Status', 'lifecycle']] },
  as: { label: 'Assignee', sections: [['Show only', 'assigneeId']], alignEnd: true },
  up: {
    label: 'Updated',
    sorts: [
      ['newest', 'Newest first'],
      ['oldest', 'Oldest first'],
      ['last_client_reply', 'Latest client reply'],
      ['last_our_reply', 'Latest our reply'],
    ],
    sections: [['Received', 'received']],
    alignEnd: true,
  },
};

const valueOf = (filters: FilterState, key: string): string | undefined => {
  if (key === 'received')
    return filters.ageRange && filters.ageRange !== 'all' ? filters.ageRange : undefined;
  const raw = (filters as Record<string, unknown>)[key];
  if (raw === true) return 'true';
  return typeof raw === 'string' && raw !== 'all' && raw !== '' ? raw : undefined;
};

/** What picking `value` in `key` writes — the same exclusivity the token bar applies. */
export const pickPatch = (filters: FilterState, def: FilterDef, value: string): Partial<FilterState> => {
  const current = valueOf(filters, def.key);
  if (def.key === 'received') {
    return {
      ageRange: (current === value ? 'all' : value) as FilterState['ageRange'],
      receivedFrom: undefined,
      receivedTo: undefined,
    };
  }
  if (def.multi) {
    const set = new Set(current ? current.split(',') : []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return { [def.key]: set.size ? [...set].join(',') : 'all' } as Partial<FilterState>;
  }
  const next = current === value ? 'all' : value;
  // A status and a queue or triage lane partition disjoint sets: one clears the others.
  if (def.key === 'lifecycle')
    return { lifecycle: next as FilterState['lifecycle'], queue: 'all', columnId: 'all' };
  return { [def.key]: next } as Partial<FilterState>;
};

/** The table's column titles; each opens its own filters and, where the list can, its sorts. */
export const ThreadTableHeader = ({
  filters,
  sorting,
  onFilterPatch,
  onSort,
}: {
  filters: FilterState;
  sorting: SortingState;
  onFilterPatch: (patch: Partial<FilterState>) => void;
  onSort: (sorting: SortingState) => void;
}) => {
  const dynamic = useFilterOptions();
  const leadsHidden = useLeadsHidden();
  const defs = useMemo(() => buildFilterDefs({ ...dynamic, leadsHidden }), [dynamic, leadsHidden]);
  const preset = sortingToPreset(sorting);

  const menu = (id: keyof typeof COLUMN, className: string) => {
    const column = COLUMN[id];
    const sectionDefs = column.sections
      .map(([heading, key]) => [heading, defs.find((def) => def.key === key)] as const)
      .filter((entry): entry is readonly [string, FilterDef] => !!entry[1]?.options?.length);
    const flagDefs = (column.flags ?? [])
      .map((key) => defs.find((def) => def.key === key))
      .filter((def): def is FilterDef => !!def);
    const triage = id === 'st';
    const filtered =
      sectionDefs.some(([, def]) => valueOf(filters, def.key) !== undefined) ||
      flagDefs.some((def) => valueOf(filters, def.key) !== undefined) ||
      (triage && (TRIAGE_IDS as readonly string[]).includes(filters.columnId ?? ''));
    const sorted = !!column.sorts?.some(([value]) => value === preset);
    const clearPatch: Partial<FilterState> = {};
    for (const [, def] of sectionDefs)
      Object.assign(
        clearPatch,
        def.key === 'received'
          ? { ageRange: 'all', receivedFrom: undefined, receivedTo: undefined }
          : { [def.key]: 'all' }
      );
    for (const def of flagDefs) Object.assign(clearPatch, { [def.key]: false });
    if (triage) clearPatch.columnId = 'all';
    return (
      <div className={className}>
        <ColumnMenu
          label={column.label}
          filtered={filtered}
          sorted={sorted}
          sortable={!!column.sorts}
          alignEnd={column.alignEnd}
          showFilterIcon={column.showFilterIcon}
        >
          {column.sorts && (
            <>
              <MenuLabel>Sort</MenuLabel>
              {column.sorts.map(([value, label]) => (
                <MenuItem
                  key={value}
                  checked={preset === value}
                  onSelect={() => onSort(presetToSorting(value))}
                >
                  {label}
                </MenuItem>
              ))}
            </>
          )}
          {sectionDefs.map(([heading, def], index) => (
            <div key={def.key}>
              {(index > 0 || column.sorts) && <MenuSeparator />}
              <MenuLabel>{heading}</MenuLabel>
              {def.options?.map((option) => {
                const current = valueOf(filters, def.key);
                const on = def.multi
                  ? (current ?? '').split(',').includes(option.value)
                  : current === option.value;
                return (
                  <MenuItem
                    key={option.value}
                    checked={on}
                    keepOpen={def.multi}
                    onSelect={() => onFilterPatch(pickPatch(filters, def, option.value))}
                  >
                    {option.label}
                  </MenuItem>
                );
              })}
            </div>
          ))}
          {triage && (
            <>
              <MenuSeparator />
              <MenuLabel>Triage</MenuLabel>
              {TRIAGE_IDS.map((lane) => (
                <MenuItem
                  key={lane}
                  checked={filters.columnId === lane}
                  onSelect={() =>
                    onFilterPatch(
                      filters.columnId === lane
                        ? { columnId: 'all' }
                        : { columnId: lane, lifecycle: 'all', queue: 'all' }
                    )
                  }
                >
                  {COLUMNS.find((column) => column.id === lane)?.label ?? lane}
                </MenuItem>
              ))}
            </>
          )}
          {flagDefs.length > 0 && (
            <>
              <MenuSeparator />
              {flagDefs.map((def) => (
                <MenuItem
                  key={def.key}
                  checked={valueOf(filters, def.key) !== undefined}
                  onSelect={() =>
                    onFilterPatch({
                      [def.key]: valueOf(filters, def.key) === undefined,
                    } as Partial<FilterState>)
                  }
                >
                  {def.label}
                </MenuItem>
              ))}
            </>
          )}
          {filtered && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<X className="w-3.5 h-3.5" />}
                onSelect={() => onFilterPatch(clearPatch)}
              >
                Clear {column.label.toLowerCase()} filters
              </MenuItem>
            </>
          )}
        </ColumnMenu>
      </div>
    );
  };

  return (
    <div
      className={`hidden md:grid items-center gap-x-3.5 h-8 pl-4 pr-11 border-b border-hair ${THREAD_TABLE_GRID}`}
    >
      {menu('pri', 'flex')}
      {menu('from', 'flex')}
      <span className="font-display text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">
        Subject
      </span>
      {menu('sig', 'hidden xl:flex')}
      {menu('st', 'flex')}
      {menu('as', 'flex justify-end')}
      {menu('up', 'flex justify-end')}
    </div>
  );
};
