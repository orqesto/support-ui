import { AlignJustify, Columns2, LayoutList, StretchHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/Checkbox';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import type { ListScope } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';
import { cn } from '@/lib/utils';
import { ListScopeNotice, type ArrivalQueue } from './ListScopeNotice';
import { SORT_PRESET_OPTIONS } from './sortPresets';
import type { ListDensity, ListLayout } from './useListPresentation';

const DENSITY_SEGMENTS: Segment<ListDensity>[] = [
  { value: 'comfortable', label: 'Comfortable rows', icon: StretchHorizontal },
  { value: 'compact', label: 'Compact rows', icon: AlignJustify },
];

const LAYOUT_SEGMENTS: Segment<ListLayout>[] = [
  {
    value: 'list',
    label: 'Full-width list',
    icon: LayoutList,
    title: 'Full-width list — the thread opens as a slide-over',
  },
  {
    value: 'split',
    label: 'Split view',
    icon: Columns2,
    title: 'Split — list left, thread right',
  },
];

type Props = {
  /** Selectable rows on this page and how many of them are picked. */
  selectableCount: number;
  selectedCount: number;
  onSelectPage: () => void;
  /** The scope read behind "Showing N of M" — null renders no sentence, never "0 hidden". */
  scope: ListScope | null;
  shown: number;
  loading: boolean;
  onScopeJump: (next: Partial<FilterState>, needsListView?: boolean) => void;
  lensActive: boolean;
  arrivals: Partial<Record<ArrivalQueue, number>>;
  onReviewArrivals: (queue: ArrivalQueue) => void;
  hideAwaiting: boolean;
  onHideAwaitingChange: (next: boolean) => void;
  sortPreset: string;
  onSortChange: (preset: string) => void;
  density: ListDensity;
  onDensityChange: (next: ListDensity) => void;
  layout: ListLayout;
  onLayoutChange: (next: ListLayout) => void;
  /** Split is a desktop arrangement; the phone opens every thread as a page. */
  canSplit: boolean;
  /** The list column is narrow (split): long labels shorten, the select label goes. */
  narrow: boolean;
};

/**
 * The caption bar over the thread list (Messages list v2).
 *
 * Everything that is ABOUT the list and not a filter of it, on one line: select this page,
 * what the current view hides (and where to find it), and how the list is drawn — Hide
 * awaiting, Sort, row density, layout. Before, these were spread over three rows: a "select
 * every message" line above the cards, the scope notice as a card of its own, and Sort +
 * Hide awaiting on the right end of the lens chips.
 */
export const MessagesListCaption = ({
  selectableCount,
  selectedCount,
  onSelectPage,
  scope,
  shown,
  loading,
  onScopeJump,
  lensActive,
  arrivals,
  onReviewArrivals,
  hideAwaiting,
  onHideAwaitingChange,
  sortPreset,
  onSortChange,
  density,
  onDensityChange,
  layout,
  onLayoutChange,
  canSplit,
  narrow,
}: Props) => (
  <div
    className={cn(
      'flex flex-wrap items-center gap-x-3 gap-y-1.5 min-h-[36px] px-3 py-1 rounded-[10px] border border-border bg-raised text-[12.5px] text-muted-foreground',
      narrow && 'py-1.5'
    )}
    data-testid="messages-list-caption"
  >
    {/* Select every row on this page — the companion to filtering first and then acting.
        Only what is LOADED: claiming "all" would select rows the agent has not seen. */}
    <Checkbox
      checked={selectableCount > 0 && selectedCount === selectableCount}
      ref={(node) => {
        if (node) node.indeterminate = selectedCount > 0 && selectedCount < selectableCount;
      }}
      disabled={selectableCount === 0}
      aria-label="Select every message on this page"
      title={selectedCount > 0 ? 'Clear this page' : 'Select every message on this page'}
      onChange={onSelectPage}
      className="shrink-0 [&_label]:items-center [&_label]:text-[12.5px] [&_label]:text-muted-foreground [&_input]:mt-0"
      label={
        <span className={cn('whitespace-nowrap', narrow && 'sr-only', 'max-xl:sr-only')}>
          {/* "on this page", not "selected": the bulk bar's "N selected" counts the WHOLE
              selection, which can span pages, and two different "N selected" on one screen
              would disagree the moment it does. */}
          {selectedCount > 0 ? `${selectedCount} on this page` : 'Select page'}
        </span>
      }
    />

    {/* What this view is hiding. In the caption and outside the empty-state branch on
        purpose: "No messages found" while three thousand sit one filter away is the worst
        version of the silence this fixes, so the sentence has to survive an empty result. */}
    {loading ? (
      <span className="flex-1 min-w-0">Loading…</span>
    ) : scope && scope.hidden > 0 ? (
      <ListScopeNotice
        surface="caption"
        scope={scope}
        shown={shown}
        onJump={onScopeJump}
        arrivals={arrivals}
        onReviewArrivals={onReviewArrivals}
        lensActive={lensActive}
      />
    ) : (
      <span className="flex-1" />
    )}

    <div className="hidden md:flex flex-wrap gap-2 items-center shrink-0">
      <Checkbox
        checked={hideAwaiting}
        onChange={(ev) => onHideAwaitingChange(ev.target.checked)}
        className="[&_label]:items-center [&_label]:text-[12.5px] [&_label]:text-muted-foreground [&_input]:mt-0"
        label={
          <span className="whitespace-nowrap">
            Hide awaiting
            <span className={cn(narrow ? 'hidden' : 'hidden 2xl:inline')}> response</span>
          </span>
        }
      />
      {/* List view only (kanban sorts per column, contacts has no sort). */}
      <ReactSelect
        aria-label="Sort"
        value={sortPreset}
        onChange={onSortChange}
        options={SORT_PRESET_OPTIONS}
        className="w-44"
      />
      <SegmentedControl
        ariaLabel="Row density"
        value={density}
        onChange={onDensityChange}
        segments={DENSITY_SEGMENTS}
        iconOnly
      />
      {canSplit && (
        <SegmentedControl
          ariaLabel="Layout"
          value={layout}
          onChange={onLayoutChange}
          segments={LAYOUT_SEGMENTS}
          iconOnly
        />
      )}
    </div>

    {/* Phone: Hide awaiting and Sort under one compact control, as a sheet. */}
    <div className="md:hidden flex gap-2 items-center w-full">
      <ReactSelect
        aria-label="Sort"
        value={sortPreset}
        onChange={onSortChange}
        options={SORT_PRESET_OPTIONS}
        className="flex-1"
      />
      <Checkbox
        checked={hideAwaiting}
        onChange={(ev) => onHideAwaitingChange(ev.target.checked)}
        className="shrink-0 [&_label]:items-center [&_label]:text-[12.5px] [&_label]:text-muted-foreground [&_input]:mt-0"
        label="Hide awaiting"
      />
    </div>
  </div>
);
