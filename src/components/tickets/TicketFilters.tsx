import { Filter, X, Send, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import type { JiraIntegration } from '@/services/integrations.service';
import type { PaginationMeta } from '@/services/ticket.service';
import type { TicketStatus, TicketPriority } from '@/types';

type FilterState = {
  status: TicketStatus | 'all';
  priority: TicketPriority | 'all';
  categoryId: string;
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
    (filters.search?.trim() ? 1 : 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex flex-wrap gap-2 justify-between items-center min-h-[32px]">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
                <Badge variant="default" className="text-xs">
                  {activeFilterCount}
                </Badge>
              </div>
              {pagination.total > 0 && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearFilters} className="shrink-0">
                <X className="mr-1 w-3 h-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search Input */}
            <SearchInput
              value={pendingSearch}
              onChange={onPendingSearchChange}
              onSearch={onSearch}
              onBlur={onSearchBlur}
              showSearchButton={true}
              placeholder="Search by ID, title, description..."
              className="w-[300px]"
              size="sm"
            />

            {/* Group 1: Status & Priority */}
            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                Status:
              </span>
              <Select
                value={filters.status}
                onChange={(e) => onFilterChange('status', e.target.value)}
                className="px-2 py-1 pr-8 h-8 text-xs"
                aria-label="Filter by status"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                Priority:
              </span>
              <Select
                value={filters.priority}
                onChange={(e) => onFilterChange('priority', e.target.value)}
                className="px-2 py-1 pr-8 h-8 text-xs"
                aria-label="Filter by priority"
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </div>

            {/* Group 2: Sorting */}
            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                Sort:
              </span>
              <Select
                value={sorting.sortBy}
                onChange={(e) =>
                  onSortingChange({
                    ...sorting,
                    sortBy: e.target.value as 'createdAt' | 'updatedAt' | 'priority',
                  })
                }
                className="px-2 py-1 pr-8 h-8 text-xs"
                aria-label="Sort by"
              >
                <option value="createdAt">Created Date</option>
                <option value="updatedAt">Updated Date</option>
                <option value="priority">Priority</option>
              </Select>
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                Order:
              </span>
              <Select
                value={sorting.sortOrder}
                onChange={(e) =>
                  onSortingChange({ ...sorting, sortOrder: e.target.value as 'asc' | 'desc' })
                }
                className="px-2 py-1 pr-8 h-8 text-xs"
                aria-label="Sort order"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </Select>
            </div>

            {/* Group 3: Jira & Sync */}
            {jiraIntegrations.length > 1 && (
              <div className="flex gap-2 items-center">
                <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                  Jira:
                </span>
                <Select
                  value={selectedJiraId ?? ''}
                  onChange={(e) => onJiraIdChange(e.target.value ? Number(e.target.value) : undefined)}
                  className="px-2 py-1 pr-8 h-8 text-xs"
                  aria-label="Filter by Jira integration"
                >
                  <option value="">All Integrations</option>
                  {jiraIntegrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name}
                    </option>
                  ))}
                </Select>
              </div>
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
              title={!hasManagePermission ? 'You need MANAGE_TICKETS permission to sync to Jira' : ''}
            >
              <Send className="mr-2 w-4 h-4" />
              Sync to Jira
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
