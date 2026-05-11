import { useEffect, useState } from 'react';
import {
  Filter,
  X,
  Clock,
  AlertTriangle,
  Zap,
  CheckCircle,
  Link,
  ChevronDown,
} from 'lucide-react';
import { AssigneeFilter } from '@/components/filters/AssigneeFilter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import type { PaginationMeta } from '@/services/ticket.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import type { TicketStatus, TicketPriority, Category } from '@/types';

type FilterState = {
  status: TicketStatus | 'all';
  priority: TicketPriority | 'all';
  categoryId: string;
  messageSourceId?: string;
  assigneeId?: string;
  labelId?: string;
  search?: string;
  linked?: 'all' | 'synced_to_jira' | 'not_synced';
};

type SortingState = {
  sortBy: 'createdAt' | 'updatedAt' | 'priority';
  sortOrder: 'asc' | 'desc';
};

const STATUS_OPTIONS = [
  { value: 'all',         label: 'All' },
  { value: 'pending',     label: 'Pending' },
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const LINKED_OPTIONS = [
  { value: 'all',            label: 'All' },
  { value: 'synced_to_jira', label: 'Synced to Jira' },
  { value: 'not_synced',     label: 'Not Synced' },
] as const;

type TicketFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  pagination: PaginationMeta;
  activeFilterCount?: number;
  onFilterChange: (key: string, value: string) => void;
  onApplyPreset: (presetName: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sorting: SortingState) => void;
  onPendingSearchChange: (value: string) => void;
};

export const TicketFilters = ({
  filters,
  sorting,
  pendingSearch,
  pagination,
  activeFilterCount = 0,
  onFilterChange,
  onApplyPreset,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  onPendingSearchChange,
}: TicketFiltersProps) => {
  const [labels, setLabels] = useState<Label[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    labelService.getLabels().then(setLabels).catch(() => {});
    categoryService.getAll().then((res) => { if (res.data) setCategories(res.data); }).catch(() => {});
  }, []);

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-2 min-w-0 md:cursor-default"
            onClick={() => setMobileExpanded((v) => !v)}
            aria-expanded={mobileExpanded}
          >
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="default" className="text-xs shrink-0">{activeFilterCount}</Badge>
            )}
            {pagination.total > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                {start}–{end} of {pagination.total}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform md:hidden ${mobileExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {pagination.total > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap sm:hidden">
                {start}–{end} of {pagination.total}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8"
              disabled={activeFilterCount === 0}
            >
              <X className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Clear All</span>
              <span className="sm:hidden">Clear</span>
            </Button>
          </div>
        </div>

        {/* Search — always visible */}
        <SearchInput
          value={pendingSearch}
          onChange={onPendingSearchChange}
          onSearch={onSearch}
          onBlur={onSearchBlur}
          showSearchButton
          placeholder="Search by ID, title, description..."
          className="w-full"
          size="sm"
        />

        {/* Collapsible body */}
        <div className={`${mobileExpanded ? 'flex' : 'hidden'} md:flex flex-col gap-0 divide-y divide-border/40`}>

          {/* ── Queue ─────────────────────────────────────────────── */}
          <FilterSection label="Queue">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              <FilterCell label="Status">
                <ReactSelect
                  value={filters.status ?? 'all'}
                  onChange={(value) => onFilterChange('status', value)}
                  options={STATUS_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-full"
                />
              </FilterCell>

              <FilterCell label="Priority">
                <ReactSelect
                  value={filters.priority ?? 'all'}
                  onChange={(value) => onFilterChange('priority', value)}
                  options={PRIORITY_OPTIONS as unknown as { value: string; label: string }[]}
                  formatOptionLabel={(option) => (
                    <div className="flex items-center gap-2">
                      {option.value !== 'all' && (
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          option.value === 'low'      ? 'bg-green-500'  :
                          option.value === 'medium'   ? 'bg-yellow-500' :
                          option.value === 'high'     ? 'bg-orange-500' : 'bg-red-500'
                        }`} />
                      )}
                      <span>{option.label}</span>
                    </div>
                  )}
                  className="w-full"
                />
              </FilterCell>

              <FilterCell label="Assignee">
                <AssigneeFilter
                  value={filters.assigneeId ?? 'all'}
                  onChange={(value) => onFilterChange('assigneeId', value)}
                  hideLabel
                  className="w-full [&>div]:w-full"
                />
              </FilterCell>

              {categories.length > 0 && (
                <FilterCell label="Category">
                  <ReactSelect
                    value={filters.categoryId || ''}
                    onChange={(value) => onFilterChange('categoryId', value || 'all')}
                    options={[
                      { value: '', label: 'All' },
                      ...categories.map((c) => ({ value: c.id.toString(), label: c.name })),
                    ]}
                    className="w-full"
                    isSearchable
                  />
                </FilterCell>
              )}
            </div>
          </FilterSection>

          {/* ── Tags ──────────────────────────────────────────────── */}
          <FilterSection label="Tags">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              {labels.length > 0 && (
                <FilterCell label="Label">
                  <ReactSelect
                    value={filters.labelId ?? ''}
                    onChange={(value) => onFilterChange('labelId', value)}
                    options={[
                      { value: '', label: 'All Labels' },
                      ...labels.map((l) => ({ value: l.id.toString(), label: l.name })),
                    ]}
                    className="w-full"
                  />
                </FilterCell>
              )}

              <FilterCell label="Linked" icon={<Link className="w-3 h-3 text-blue-500" />}>
                <ReactSelect
                  value={filters.linked ?? 'all'}
                  onChange={(value) => onFilterChange('linked', value)}
                  options={LINKED_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-full"
                />
              </FilterCell>
            </div>
          </FilterSection>

          {/* ── Footer ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Sort:</span>
              <ReactSelect
                value={sorting.sortBy}
                onChange={(value) => onSortingChange({ ...sorting, sortBy: value as SortingState['sortBy'] })}
                options={[
                  { value: 'createdAt', label: 'Created Date' },
                  { value: 'updatedAt', label: 'Updated Date' },
                  { value: 'priority',  label: 'Priority' },
                ]}
                className="w-36"
              />
              <ReactSelect
                value={sorting.sortOrder}
                onChange={(value) => onSortingChange({ ...sorting, sortOrder: value as 'asc' | 'desc' })}
                options={[
                  { value: 'desc', label: 'Newest First' },
                  { value: 'asc',  label: 'Oldest First' },
                ]}
                className="w-36"
              />
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">Quick:</span>
              <button type="button" onClick={() => onApplyPreset('urgent')} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border hover:bg-muted transition-colors">
                <AlertTriangle className="w-3 h-3 text-orange-500" />Urgent
              </button>
              <button type="button" onClick={() => onApplyPreset('in-progress')} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border hover:bg-muted transition-colors">
                <Zap className="w-3 h-3 text-blue-500" />In Progress
              </button>
              <button type="button" onClick={() => onApplyPreset('pending')} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border hover:bg-muted transition-colors">
                <Clock className="w-3 h-3" />Pending
              </button>
              <button type="button" onClick={() => onApplyPreset('recent')} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border hover:bg-muted transition-colors">
                <CheckCircle className="w-3 h-3 text-green-500" />Recent
              </button>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 space-y-3">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterCell({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}
