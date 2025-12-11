import { useEffect, useState } from 'react';
import {
  Filter,
  X,
  Paperclip,
  XCircle,
  MessageCircle,
  Ticket,
  ShieldX,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { integrationsService, type Integration } from '@/services/integrations.service';
import type { FilterState, SortingState } from '@/stores/messagesStore';

type MessageFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  activeFilterCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
};

export const MessageFilters = ({
  filters,
  sorting,
  pendingSearch,
  activeFilterCount,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  setPendingSearch,
  setFilters,
}: MessageFiltersProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch message sources on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await integrationsService.getAll();
        if (response.success && response.data) {
          // Filter to only message sources (email, telegram, slack)
          const sources = response.data.filter((integration) =>
            ['email', 'gmail', 'telegram', 'slack'].includes(integration.type)
          );
          setMessageSources(sources);
        }
      } catch (error) {
        console.error('Failed to fetch message sources:', error);
      }
    };
    void fetchSources();
  }, []);

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
          <div className="flex gap-2 items-center">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Filters</span>
            {pagination.total > 0 && (
              <span className="text-sm text-muted-foreground">
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total}
              </span>
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearFilters}
            disabled={activeFilterCount === 0}
          >
            <X className="mr-1 w-3 h-3 hidden sm:block" />
            Clear All
          </Button>
        </div>

        {/* Search */}
        <SearchInput
          value={pendingSearch}
          onChange={(value) => {
            setPendingSearch(value);
            onFilterChange('search', value);
          }}
          onSearch={onSearch}
          onBlur={onSearchBlur}
          showSearchButton={true}
          placeholder="Search by ID, email, subject, content..."
          className="mb-4"
          size="sm"
        />

        {/* Primary Filters Row */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">

            {/* Status Group */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <span className="text-xs font-semibold text-muted-foreground sm:whitespace-nowrap sm:mr-2">
                Status:
              </span>
              {/* Mobile: 2x2 grid */}
              <div className="flex flex-col gap-2 sm:hidden">
                <div className="flex gap-2">
                  <Button
                    variant={filters.processed === 'unprocessed' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'unprocessed')}
                    className="h-8 text-xs flex-1"
                  >
                    Unprocessed
                  </Button>
                  <Button
                    variant={filters.processed === 'processed' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'processed')}
                    className="h-8 text-xs flex-1"
                  >
                    Processed
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filters.processed === 'resolved' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'resolved')}
                    className="h-8 text-xs flex-1"
                  >
                    Resolved
                  </Button>
                  <Button
                    variant={filters.processed === 'all' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'all')}
                    className="h-8 text-xs flex-1"
                  >
                    All
                  </Button>
                </div>
              </div>
              {/* Tablet+: single row */}
              <div className="hidden gap-1 sm:flex">
                <Button
                  variant={filters.processed === 'unprocessed' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange('processed', 'unprocessed')}
                  className="h-8 text-xs"
                >
                  Unprocessed
                </Button>
                <Button
                  variant={filters.processed === 'processed' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange('processed', 'processed')}
                  className="h-8 text-xs"
                >
                  Processed
                </Button>
                <Button
                  variant={filters.processed === 'resolved' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange('processed', 'resolved')}
                  className="h-8 text-xs"
                >
                  Resolved
                </Button>
                <Button
                  variant={filters.processed === 'all' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => onFilterChange('processed', 'all')}
                  className="h-8 text-xs"
                >
                  All
                </Button>
              </div>
            </div>

            {/* Divider - hidden on mobile */}
            <div className="hidden mx-3 w-px h-8 sm:block bg-border" />

            {/* Channel Group */}
            <div className="flex gap-2 items-center min-w-[140px] ">
              <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                Channel:
              </span>
              <ReactSelect
                value={filters.channel}
                onChange={(value) => onFilterChange('channel', value)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'email', label: 'Email' },
                  { value: 'telegram', label: 'Telegram' },
                  { value: 'slack', label: 'Slack' },
                ]}
                className="flex-1 sm:min-w-[120px] sm:flex-initial"
              />
            </div>

            {/* Divider - hidden on mobile */}
            <div className="hidden mx-3 w-px h-8 lg:block bg-border" />

            {/* Message Source Group */}
            <div className="flex gap-2 items-center min-w-[140px] sm:pr-4">
              <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                Source:
              </span>
              <ReactSelect
                value={filters.messageSourceId ?? 'all'}
                onChange={(value) => onFilterChange('messageSourceId', value)}
                options={[
                  { value: 'all', label: 'All Sources' },
                  ...messageSources.map((source) => ({
                    value: source.id.toString(),
                    label: source.name,
                  })),
                ]}
                className="flex-1 sm:min-w-[120px] sm:flex-initial"
              />
            </div>

            {/* Divider - hidden on mobile */}
            <div className="hidden mx-3 w-px h-8 lg:block bg-border" />

            {/* Sort Order */}
            <div className="flex gap-2 items-center min-w-[140px]">
              <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                Sort:
              </span>
              <ReactSelect
                value={sorting.sortOrder}
                onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                options={[
                  { value: 'desc', label: 'Newest First' },
                  { value: 'asc', label: 'Oldest First' },
                ]}
                className="flex-1 sm:min-w-[120px] sm:flex-initial"
              />
            </div>
          </div>
        </div>


        {/* Advanced Filters Toggle */}
        <div className="flex justify-center mt-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="text-xs"
          >
            {showAdvancedFilters ? (
              <>
                <ChevronUp className="mr-1 w-3 h-3" />
                Hide Advanced Filters
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 w-3 h-3" />
                Show Advanced Filters
              </>
            )}
          </Button>
        </div>

        {/* Advanced Filters Section */}
        {showAdvancedFilters && (
          <div className="pt-4 mt-4 border-t">
            <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Advanced Filters
                  </span>
                </div>

                {/* Contextual Filters - shown based on status */}
                <div className="flex flex-wrap gap-3 items-center">
                  {/* Spam filters - available for all messages (processed or not) */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showSpam ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, showSpam: e.target.checked, excludeSpam: false })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3" />
                      <span>Spam</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeSpam ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, excludeSpam: e.target.checked, showSpam: false })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3 text-green-500" />
                      <span>Exclude Spam</span>
                    </div>
                  </label>

                  {/* Show Ticket Worthy & Needs Info only for Processed */}
                  {filters.processed === 'processed' && (
                    <>
                      <label className="flex gap-2 items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.showWorthy ?? false}
                          onChange={(e) => setFilters({ ...filters, showWorthy: e.target.checked })}
                          className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                          <Ticket className="w-3 h-3" />
                          <span>Ticket Worthy</span>
                        </div>
                      </label>

                      <label className="flex gap-2 items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.showNeedsInfo ?? false}
                          onChange={(e) =>
                            setFilters({ ...filters, showNeedsInfo: e.target.checked })
                          }
                          className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                          <Info className="w-3 h-3" />
                          <span>Needs Info</span>
                        </div>
                      </label>
                    </>
                  )}

                  {/* Common filters - always visible */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasAttachments ?? false}
                      onChange={(e) => setFilters({ ...filters, hasAttachments: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Paperclip className="w-3 h-3" />
                      <span>Attachments</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasReplies ?? false}
                      onChange={(e) => setFilters({ ...filters, hasReplies: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <MessageCircle className="w-3 h-3" />
                      <span>Replies</span>
                    </div>
                  </label>

                  {/* Ticket filter - tri-state toggle */}
                  <div className="flex gap-1 items-center">
                    <Ticket className="w-3 h-3 text-muted-foreground" />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setFilters({ ...filters, hasTicket: undefined })}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          filters.hasTicket === undefined
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilters({ ...filters, hasTicket: true })}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          filters.hasTicket === true
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        Has Ticket
                      </button>
                      <button
                        onClick={() => setFilters({ ...filters, hasTicket: false })}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          filters.hasTicket === false
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        No Ticket
                      </button>
                    </div>
                  </div>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showFailed ?? false}
                      onChange={(e) => setFilters({ ...filters, showFailed: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium text-red-600 whitespace-nowrap dark:text-red-400">
                      <XCircle className="w-3 h-3" />
                      <span>Failed</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.awaitingCustomerResponse ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, awaitingCustomerResponse: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>Awaiting Response</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeKB ?? false}
                      onChange={(e) => setFilters({ ...filters, excludeKB: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <BookOpen className="w-3 h-3 text-purple-500" />
                      <span>Exclude KB</span>
                    </div>
                  </label>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
