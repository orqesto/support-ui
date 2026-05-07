import { useEffect, useState } from 'react';
import {
  Filter,
  X,
  Clock,
  AlertTriangle,
  Zap,
  CheckCircle,
  Link,
} from 'lucide-react';
import { AssigneeFilter } from '@/components/filters/AssigneeFilter';
import { MessageSourceFilter } from '@/components/filters/MessageSourceFilter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useFilterPanel } from '@/hooks/useFilterPanel';
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
  { value: 'all',           label: 'All' },
  { value: 'synced_to_jira', label: 'Synced to Jira' },
  { value: 'not_synced',    label: 'Not Synced' },
] as const;

type TicketFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  pagination: PaginationMeta;
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

  useEffect(() => {
    labelService.getLabels().then(setLabels).catch(() => {});
    categoryService.getAll().then((res) => { if (res.data) setCategories(res.data); }).catch(() => {});
  }, []);

  const { activeFilterCount, activeFilters } = useFilterPanel({
    filters,
    customLabels: {
      status: 'Status', priority: 'Priority', categoryId: 'Category',
      messageSourceId: 'Source', assigneeId: 'Assignee', labelId: 'Label', linked: 'Linked',
    },
    customValues: {
      labelId: (val) => labels.find((l) => l.id.toString() === String(val))?.name ?? String(val),
      linked: (val) => String(val).replace('_', ' '),
    },
  });

  const removeFilter = (key: string) => {
    const defaults: Record<string, string> = {
      status: 'all', priority: 'all', categoryId: 'all',
      messageSourceId: 'all', assigneeId: 'all', labelId: '', linked: 'all',
    };
    if (key in defaults) onFilterChange(key, defaults[key]);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">

          {/* Header */}
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex gap-3 items-center">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="default" className="text-xs">{activeFilterCount}</Badge>
              )}
              {pagination.total > 0 && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 shrink-0" disabled={activeFilterCount === 0}>
              <X className="mr-1 w-3 h-3" />
              Clear All
            </Button>
          </div>

          {/* Active Filter Pills */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <Badge key={`${filter.key}-${filter.value}`} variant="secondary" className="flex gap-1 items-center py-1 pr-1 pl-2 text-xs">
                  <span className="font-normal text-muted-foreground">{filter.label}:</span>
                  <span className="font-medium capitalize">{filter.value.replace(/_/g, ' ')}</span>
                  <button onClick={() => removeFilter(filter.key)} className="ml-1 rounded-full hover:bg-muted-foreground/20 transition-colors p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground">Quick:</span>
            <Button variant="outline" size="sm" onClick={() => onApplyPreset('urgent')} className="h-7 gap-1.5 text-xs">
              <AlertTriangle className="w-3 h-3 text-orange-500" />Urgent
            </Button>
            <Button variant="outline" size="sm" onClick={() => onApplyPreset('in-progress')} className="h-7 gap-1.5 text-xs">
              <Zap className="w-3 h-3 text-blue-500" />In Progress
            </Button>
            <Button variant="outline" size="sm" onClick={() => onApplyPreset('pending')} className="h-7 gap-1.5 text-xs">
              <Clock className="w-3 h-3" />Pending
            </Button>
            <Button variant="outline" size="sm" onClick={() => onApplyPreset('recent')} className="h-7 gap-1.5 text-xs">
              <CheckCircle className="w-3 h-3 text-green-500" />Recent
            </Button>
          </div>

          {/* Search */}
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

          {/* SOURCE */}
          <div className="p-3 space-y-2 rounded-lg border bg-muted/30">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Source</span>
            <MessageSourceFilter
              value={filters.messageSourceId}
              onChange={(value) => onFilterChange('messageSourceId', value)}
            />
          </div>

          {/* FILTER */}
          <div className="p-3 space-y-3 rounded-lg border bg-muted/30">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Filter</span>

            {/* Row 1: Status / Priority / Assignee */}
            <div className="flex flex-wrap gap-3 items-center">
              <FilterRow label="Status">
                <ReactSelect
                  value={filters.status}
                  onChange={(value) => onFilterChange('status', value)}
                  options={STATUS_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-36"
                />
              </FilterRow>

              <FilterRow label="Priority">
                <ReactSelect
                  value={filters.priority}
                  onChange={(value) => onFilterChange('priority', value)}
                  options={PRIORITY_OPTIONS as unknown as { value: string; label: string }[]}
                  formatOptionLabel={(option) => (
                    <div className="flex gap-2 items-center">
                      {option.value !== 'all' && (
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          option.value === 'low' ? 'bg-green-500' :
                          option.value === 'medium' ? 'bg-yellow-500' :
                          option.value === 'high' ? 'bg-orange-500' : 'bg-red-500'
                        }`} />
                      )}
                      <span>{option.label}</span>
                    </div>
                  )}
                  className="w-36"
                />
              </FilterRow>

              <AssigneeFilter
                value={filters.assigneeId}
                onChange={(value) => onFilterChange('assigneeId', value)}
              />
            </div>

            {/* Row 2: Category / Label / Linked */}
            <div className="flex flex-wrap gap-3 items-center">
              {categories.length > 0 && (
                <FilterRow label="Category">
                  <ReactSelect
                    value={filters.categoryId || ''}
                    onChange={(value) => onFilterChange('categoryId', value || 'all')}
                    options={[
                      { value: '', label: 'All' },
                      ...categories.map((c) => ({ value: c.id.toString(), label: c.name })),
                    ]}
                    className="w-40"
                    isSearchable
                  />
                </FilterRow>
              )}

              {labels.length > 0 && (
                <FilterRow label="Label">
                  <ReactSelect
                    value={filters.labelId ?? ''}
                    onChange={(value) => onFilterChange('labelId', value)}
                    options={[
                      { value: '', label: 'All' },
                      ...labels.map((l) => ({ value: l.id.toString(), label: l.name })),
                    ]}
                    className="w-36"
                  />
                </FilterRow>
              )}

              <FilterRow label="Linked" icon={<Link className="w-3 h-3 text-blue-500" />}>
                <ReactSelect
                  value={filters.linked ?? 'all'}
                  onChange={(value) => onFilterChange('linked', value)}
                  options={LINKED_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-40"
                />
              </FilterRow>
            </div>
          </div>

          {/* Sort */}
          <div className="flex flex-wrap gap-3 items-center">
            <FilterRow label="Sort by">
              <ReactSelect
                value={sorting.sortBy}
                onChange={(value) => onSortingChange({ ...sorting, sortBy: value as SortingState['sortBy'] })}
                options={[
                  { value: 'createdAt', label: 'Created Date' },
                  { value: 'updatedAt', label: 'Updated Date' },
                  { value: 'priority',  label: 'Priority' },
                ]}
                className="w-40"
              />
            </FilterRow>
            <FilterRow label="Order">
              <ReactSelect
                value={sorting.sortOrder}
                onChange={(value) => onSortingChange({ ...sorting, sortOrder: value as 'asc' | 'desc' })}
                options={[
                  { value: 'desc', label: 'Newest First' },
                  { value: 'asc',  label: 'Oldest First' },
                ]}
                className="w-36"
              />
            </FilterRow>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

function FilterRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-center">
      {icon}
      <span className="text-xs font-semibold text-muted-foreground shrink-0">{label}:</span>
      {children}
    </div>
  );
}
