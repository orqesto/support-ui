import { ChevronDown, X } from 'lucide-react';
import { ViewPill } from '@/components/list/ViewPill';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { COLUMNS } from '@/components/messages/kanbanColumns';
import { formatCount, sumCounts, type Count } from '@/lib/listTotals';

/** The triage lanes (not the work queue), in the design's order: Messages list v4 `TRI`. */
export const TRIAGE_IDS = ['not_analysed', 'archived', 'spam', 'no_lane'] as const;
export type TriageId = (typeof TRIAGE_IDS)[number];

const labelOf = (id: string) => COLUMNS.find((column) => column.id === id)?.label ?? id;

/** "2 new" — arrivals nobody has looked at yet. */
const NewBadge = ({ count }: { count: number }) => (
  <span className="inline-flex items-center px-1.5 h-[17px] rounded-full bg-attention text-white text-[10.5px] font-bold">
    {count} new
  </span>
);

/**
 * Which primary view is lit. Needs us is not counted as a filter (it has no token), so "no
 * filters" alone would light All beside it — both pills lit on the landing page (#724 regression).
 */
export const primaryViewsOn = (
  filters: { lifecycle?: string; columnId?: string },
  activeFilterCount: number
) => {
  const needsUs = filters.lifecycle === 'needs_us' && (filters.columnId ?? 'all') === 'all';
  return { needsUs, all: activeFilterCount === 0 && filters.lifecycle !== 'needs_us' };
};

/**
 * "Needs us" and "All" — the two views that REPLACE the filters (Messages list v4): Needs us is
 * open or in progress, All is everything in the work queue. The saved views after them merge.
 */
export const ThreadPrimaryViews = ({
  needsUsOn,
  allOn,
  needsUsCount,
  onNeedsUs,
  onAll,
}: {
  needsUsOn: boolean;
  allOn: boolean;
  needsUsCount?: Count;
  onNeedsUs: () => void;
  onAll: () => void;
}) => (
  <>
    <ViewPill
      on={needsUsOn}
      count={needsUsCount}
      onClick={onNeedsUs}
      title="Open and in progress — leaves out threads waiting on the customer or on hold"
    >
      Needs us
    </ViewPill>
    <ViewPill
      on={allOn}
      onClick={onAll}
      title="Everything in the work queue, including pending and on-hold"
    >
      All
    </ViewPill>
  </>
);

/**
 * Triage ▾ — the lanes that are not the work queue (Not analysed, Archived, Spam, Other), folded
 * into one view with a menu. Counts are the lists each item opens; "N new" marks arrivals.
 */
export const TriageMenu = ({
  active,
  counts,
  arrivals,
  onSelect,
}: {
  /** The triage lane on screen, or null when the list is the work queue. */
  active: TriageId | null;
  counts: Partial<Record<TriageId, Count | undefined>>;
  arrivals: Partial<Record<TriageId, number>>;
  /** A lane, or 'all' to go back to the work queue. */
  onSelect: (id: TriageId | 'all') => void;
}) => {
  const total = sumCounts(TRIAGE_IDS.map((id) => counts[id]));
  const fresh = TRIAGE_IDS.reduce((sum, id) => sum + (arrivals[id] ?? 0), 0);
  return (
    <Menu
      ariaLabel="Triage"
      width={260}
      trigger={({ open, toggle }) => (
        <ViewPill
          on={active !== null}
          count={active ? counts[active] : total}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          after={
            <>
              {fresh > 0 && <NewBadge count={fresh} />}
              <ChevronDown className="w-3 h-3" />
            </>
          }
        >
          {active ? `Triage · ${labelOf(active)}` : 'Triage'}
        </ViewPill>
      )}
    >
      <MenuLabel>Not in the work queue</MenuLabel>
      {TRIAGE_IDS.map((id) => (
        <MenuItem
          key={id}
          checked={active === id}
          onSelect={() => onSelect(id)}
          hint={counts[id] === undefined ? undefined : formatCount(counts[id])}
        >
          <span className="flex gap-2 items-center">
            {labelOf(id)}
            {(arrivals[id] ?? 0) > 0 && <NewBadge count={arrivals[id] ?? 0} />}
          </span>
        </MenuItem>
      ))}
      {active && (
        <>
          <MenuSeparator />
          <MenuItem icon={<X className="w-3.5 h-3.5" />} onSelect={() => onSelect('all')}>
            Back to the work queue
          </MenuItem>
        </>
      )}
    </Menu>
  );
};
