import {
  Filter,
  X,
  Send,
  ExternalLink as ExternalLinkIcon,
  Clock,
  AlertTriangle,
  Zap,
  CheckCircle,
} from 'lucide-react';
import { MessageSourceFilter } from '@/components/filters/MessageSourceFilter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import type { JiraIntegration } from '@/services/integrations.service';
import type { PaginationMeta } from '@/services/ticket.service';
import type { TicketStatus, TicketPriority } from '@/types';

type FilterState = {
  status: TicketStatus | 'all';
  priority: TicketPriority | 'all';
  categoryId: string;
  messageSourceId?: string;
  search?: string;
  syncedToJira?: boolean;
};

type SortingState = {
  sortBy: 'createdAt' | 'updatedAt' | 'priority';
  sortOrder: 'asc' | 'desc';
};

type TicketFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  pagination: PaginationMeta;
  jiraIntegrations: JiraIntegration[];
  selectedJiraId?: number;
  isSyncingAll: boolean;
  hasManagePermission: boolean;
  onFilterChange: (key: string, value: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sorting: SortingState) => void;
  onJiraIdChange: (id: number | undefined) => void;
  onSyncAll: () => void;
  onPendingSearchChange: (value: string) => void;
};

export const TicketFilters = ({
  filters,
  sorting,
  pendingSearch,
  pagination,
  jiraIntegrations,
  selectedJiraId,
  isSyncingAll,
  hasManagePermission,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  onJiraIdChange,
  onSyncAll,
  onPendingSearchChange,
}: TicketFiltersProps) => {
  const activeFilterCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.categoryId !== 'all' ? 1 : 0) +
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.syncedToJira ? 1 : 0);

  // Helper to get active filter labels
  const getActiveFilters = () => {
    const active: Array<{ key: string; label: string; value: string }> = [];

    if (filters.status !== 'all') {
      active.push({ key: 'status', label: 'Status', value: filters.status });
    }
    if (filters.priority !== 'all') {
      active.push({ key: 'priority', label: 'Priority', value: filters.priority });
    }
    if (filters.categoryId !== 'all') {
      active.push({ key: 'categoryId', label: 'Category', value: filters.categoryId });
    }
    if (filters.messageSourceId && filters.messageSourceId !== 'all') {
      active.push({ key: 'messageSourceId', label: 'Source', value: filters.messageSourceId });
    }
    if (filters.syncedToJira) {
      active.push({ key: 'syncedToJira', label: 'Jira', value: 'Synced' });
    }

    return active;
  };

  const activeFilters = getActiveFilters();

  const removeFilter = (key: string) => {
    if (key === 'status') {
      onFilterChange('status', 'all');
    } else if (key === 'priority') {
      onFilterChange('priority', 'all');
    } else if (key === 'categoryId') {
      onFilterChange('categoryId', 'all');
    } else if (key === 'messageSourceId') {
      onFilterChange('messageSourceId', 'all');
    } else if (key === 'syncedToJira') {
      onFilterChange('syncedToJira', 'false');
    }
  };

  // Quick filter presets
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'urgent':
        // High/Critical priority, open tickets
        onFilterChange('status', 'open');
        onFilterChange('priority', 'high');
        break;
      case 'in-progress':
        // Active work
        onFilterChange('status', 'in_progress');
        onFilterChange('priority', 'all');
        break;
      case 'pending':
        // Waiting for assignment/action
        onFilterChange('status', 'pending');
        onFilterChange('priority', 'all');
        break;
      case 'recent':
        // All recent tickets
        onFilterChange('status', 'all');
        onFilterChange('priority', 'all');
        onSortingChange({ sortBy: 'createdAt', sortOrder: 'desc' });
        break;
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </div>
              {pagination.total > 0 && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 shrink-0">
                  <X className="mr-1 w-3 h-3" />
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Active Filter Pills */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter, index) => (
                <Badge
                  key={`${filter.key}-${index}`}
                  variant="secondary"
                  className="flex gap-1 items-center py-1 pr-1 pl-2 text-xs group"
                >
                  <span className="font-normal text-muted-foreground">{filter.label}:</span>
                  <span className="font-medium capitalize">{filter.value.replace('_', ' ')}</span>
                  <button
                    onClick={() => removeFilter(filter.key)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20 transition-colors p-0.5"
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Quick Filter Presets */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground">Quick Filters:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('urgent')}
              className="h-7 gap-1.5 text-xs"
            >
              <AlertTriangle className="w-3 h-3 text-orange-500" />
              Urgent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('in-progress')}
              className="h-7 gap-1.5 text-xs"
            >
              <Zap className="w-3 h-3 text-blue-500" />
              In Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('pending')}
              className="h-7 gap-1.5 text-xs"
            >
              <Clock className="w-3 h-3" />
              Pending
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('recent')}
              className="h-7 gap-1.5 text-xs"
            >
              <CheckCircle className="w-3 h-3 text-green-500" />
              Recent
            </Button>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Search */}
            <div className="flex flex-wrap gap-3 items-center">
              <SearchInput
                value={pendingSearch}
                onChange={onPendingSearchChange}
                onSearch={onSearch}
                onBlur={onSearchBlur}
                showSearchButton={true}
                placeholder="Search by ID, title, description..."
                className="flex-1 min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Primary Filters Row */}
            <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex flex-col sm:inline-flex gap-4 sm:flex-row rounded-md shadow-sm">

                {/* Group 1: Status & Priority */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Status:
                  </span>
                  <ReactSelect
                    value={filters.status}
                    onChange={(value) => onFilterChange('status', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'open', label: 'Open' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'resolved', label: 'Resolved' },
                      { value: 'closed', label: 'Closed' },
                    ]}
                    className="min-w-[120px]"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Priority:
                  </span>
                  <ReactSelect
                    value={filters.priority}
                    onChange={(value) => onFilterChange('priority', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                      { value: 'critical', label: 'Critical' },
                    ]}
                    className="min-w-[120px]"
                  />
                </div>

             
               

                {/* Message Source Filter */}
                <MessageSourceFilter
                  value={filters.messageSourceId}
                  onChange={(value) => onFilterChange('messageSourceId', value)}
                />


                {/* Group 2: Sorting */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Sort:
                  </span>
                  <ReactSelect
                    value={sorting.sortBy}
                    onChange={(value) =>
                      onSortingChange({
                        ...sorting,
                        sortBy: value as 'createdAt' | 'updatedAt' | 'priority',
                      })
                    }
                    options={[
                      { value: 'createdAt', label: 'Created Date' },
                      { value: 'updatedAt', label: 'Updated Date' },
                      { value: 'priority', label: 'Priority' },
                    ]}
                    className="min-w-[140px]"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Order:
                  </span>
                  <ReactSelect
                    value={sorting.sortOrder}
                    onChange={(value) =>
                      onSortingChange({ ...sorting, sortOrder: value as 'asc' | 'desc' })
                    }
                    options={[
                      { value: 'desc', label: 'Newest First' },
                      { value: 'asc', label: 'Oldest First' },
                    ]}
                    className="min-w-[120px]"
                  />
                </div>
              </div>
            </div>

            {/* Jira Integration Section */}
            {jiraIntegrations.length > 0 && (
              <div className="flex flex-wrap gap-4 items-center">
                {/* Jira Integration Selector */}
                {jiraIntegrations.length > 1 && (
                  <>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                        Jira:
                      </span>
                      <ReactSelect
                        value={selectedJiraId?.toString() ?? ''}
                        onChange={(value) => onJiraIdChange(value ? Number(value) : undefined)}
                        options={[
                          { value: '', label: 'All Integrations' },
                          ...jiraIntegrations.map((integration) => ({
                            value: integration.id.toString(),
                            label: integration.name,
                          })),
                        ]}
                        className="min-w-[150px]"
                      />
                    </div>
                    <div className="w-px h-8 bg-border" />
                  </>
                )}

                {/* Jira Sync Status Filter */}
                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.syncedToJira ?? false}
                    onChange={(e) =>
                      onFilterChange('syncedToJira', e.target.checked ? 'true' : 'false')
                    }
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                    <ExternalLinkIcon className="w-3 h-3" />
                    <span>Synced to Jira</span>
                  </div>
                </label>

                <Button
                  onClick={onSyncAll}
                  size="sm"
                  className="ml-auto"
                  disabled={
                    !hasManagePermission ||
                    jiraIntegrations.length === 0 ||
                    (jiraIntegrations.length > 1 && !selectedJiraId)
                  }
                  isLoading={isSyncingAll}
                  title={
                    !hasManagePermission ? 'You need MANAGE_TICKETS permission to sync to Jira' : ''
                  }
                >
                  <Send className="mr-2 w-4 h-4" />
                  Sync to Jira
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
