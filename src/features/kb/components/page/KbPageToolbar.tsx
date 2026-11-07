import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { KbMoreFiltersButton } from './KbMoreFilters';
import { KbTeamFilter } from './KbTeamFilter';
import { KbViewTabs } from './KbViewTabs';
import type { KbPageView } from './kbPageView';

export type KbListType = 'all' | 'qa_pair' | 'document';

const TYPE_OPTIONS: { value: KbListType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'qa_pair', label: 'Q&A pairs' },
  { value: 'document', label: 'Documents' },
];

/**
 * The page's filter controls: at most five by default (view tabs, Search, Team, Type, More
 * filters), each marked `data-kb-filter`. A control that does nothing on a view is not drawn
 * there: Type and More filters only narrow the list (Live answers), Search is not used by Engine
 * activity.
 */
export const KbPageToolbar = ({
  canReview,
  view,
  onView,
  openQuestions,
  search,
  teamKey,
  type,
  onType,
  more,
}: {
  canReview: boolean;
  view: KbPageView;
  onView: (next: KbPageView) => void;
  openQuestions: number | null;
  search: {
    value: string;
    onChange: (value: string) => void;
    onSearch: () => void;
    onBlur: () => void;
  };
  /** The team context's selection (`useDepartmentContextKey`). */
  teamKey: string;
  type: KbListType;
  onType: (next: KbListType) => void;
  more: { open: boolean; onToggle: () => void; active: number };
}) => (
  <div className="flex flex-wrap gap-3 items-center">
    {canReview && <KbViewTabs value={view} onChange={onView} openQuestions={openQuestions} />}
    {view !== 'activity' && (
      <div data-kb-filter="search" className="flex-1 min-w-[12rem]">
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          onSearch={search.onSearch}
          onBlur={search.onBlur}
          showSearchButton={true}
          placeholder={
            view === 'questions'
              ? 'Search questions'
              : 'Search by ID, title, content, or category...'
          }
          className="w-full"
          size="sm"
        />
      </div>
    )}
    <KbTeamFilter selectedKey={teamKey} />
    {view === 'live' && (
      <div data-kb-filter="type">
        <Select
          aria-label="Type"
          size="sm"
          className="w-36"
          value={type}
          onChange={(next) => onType(next as KbListType)}
          options={TYPE_OPTIONS}
        />
      </div>
    )}
    {view === 'live' && <KbMoreFiltersButton {...more} />}
  </div>
);
