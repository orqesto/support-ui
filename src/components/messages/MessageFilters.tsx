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
  AlertCircle,
  Target,
} from 'lucide-react';
import { AssigneeFilter } from '@/components/filters/AssigneeFilter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useFilterPanel } from '@/hooks/useFilterPanel';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { labelService, type Label } from '@/services/settings.service';
import type { FilterState, SortingState } from '@/stores/messagesStore';
import { logger } from '@/lib/logger';

const AGE_RANGE_OPTIONS: {
  value: 'lt24h' | '1to7d' | '1to4w' | 'gt1mo' | undefined;
  label: string;
}[] = [
  { value: undefined, label: 'Any' },
  { value: 'lt24h', label: '< 24h' },
  { value: '1to7d', label: '1–7d' },
  { value: '1to4w', label: '1–4w' },
  { value: 'gt1mo', label: '> 1mo' },
];

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
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    labelService
      .getLabels()
      .then(setLabels)
      .catch(() => {});
  }, []);

  const { showAdvancedFilters, toggleAdvancedFilters } = useFilterPanel({
    filters,
  });

  // Spam overrides View/Progress in the backend — disable those controls to avoid confusion
  const spamModeActive = filters.showSpam ?? false;

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
        logger.error('Failed to fetch message sources:', error);
      }
    };
    void fetchSources();
  }, []);

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
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-8 shrink-0"
                disabled={activeFilterCount === 0}
              >
                <X className="mr-1 w-3 h-3" />
                Clear All
              </Button>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Search */}
            <div className="flex flex-wrap gap-3 items-center">
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
                className="flex-1 min-w-[200px] sm:min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Primary Filters Row */}
            <div className="p-4 space-y-3 rounded-lg border bg-muted/30">
              {/* Row 1: View + Status selects */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* View */}
                <div className={`flex gap-2 items-center${spamModeActive ? ' opacity-40 pointer-events-none' : ''}`}>
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">
                    View:
                  </span>
                  <ReactSelect
                    value={filters.view ?? 'active'}
                    onChange={(value) => onFilterChange('view', value)}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'suspicious', label: 'Suspicious' },
                      { value: 'not_analysed', label: 'Not Analysed' },
                      { value: 'resolved', label: 'Resolved' },
                      { value: 'all', label: 'All' },
                    ]}
                    className="w-36"
                  />
                </div>

                {/* Status */}
                <div className={`flex gap-2 items-center${spamModeActive ? ' opacity-40 pointer-events-none' : ''}`}>
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">
                    Status:
                  </span>
                  <ReactSelect
                    value={filters.processed ?? 'all'}
                    onChange={(value) => onFilterChange('processed', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'open', label: 'Open' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'closed', label: 'Closed' },
                    ]}
                    className="w-36"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* Row 2: Dropdowns */}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-center">
                {/* Channel */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16">
                    Channel:
                  </span>
                  <ReactSelect
                    value={filters.channel ?? 'all'}
                    onChange={(value) => onFilterChange('channel', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'email', label: 'Email' },
                      { value: 'telegram', label: 'Telegram' },
                      { value: 'slack', label: 'Slack' },
                    ]}
                    className="flex-1 sm:flex-none sm:w-36"
                  />
                </div>

                {/* Message Source */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16">
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
                    className="flex-1 sm:flex-none sm:w-36"
                  />
                </div>

                {/* Assignee */}
                <AssigneeFilter
                  value={filters.assigneeId ?? 'all'}
                  onChange={(value) => onFilterChange('assigneeId', value)}
                />

                {/* Priority */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16">
                    Priority:
                  </span>
                  <ReactSelect
                    value={filters.priority ?? 'all'}
                    onChange={(value) => onFilterChange('priority', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                      { value: 'critical', label: 'Critical' },
                    ]}
                    formatOptionLabel={(option) => (
                      <div className="flex gap-2 items-center">
                        {option.value !== 'all' && (
                          <span
                            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                              option.value === 'low'
                                ? 'bg-green-500'
                                : option.value === 'medium'
                                  ? 'bg-yellow-500'
                                  : option.value === 'high'
                                    ? 'bg-orange-500'
                                    : 'bg-red-500'
                            }`}
                          />
                        )}
                        <span>{option.label}</span>
                      </div>
                    )}
                    className="flex-1 sm:flex-none sm:w-36"
                  />
                </div>

                {/* Label */}
                {labels.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16">
                      Label:
                    </span>
                    <ReactSelect
                      value={filters.labelId ?? 'all'}
                      onChange={(value) => onFilterChange('labelId', value)}
                      options={[
                        { value: 'all', label: 'All Labels' },
                        ...labels.map((l) => ({ value: l.id.toString(), label: l.name })),
                      ]}
                      formatOptionLabel={(option) => (
                        <div className="flex gap-2 items-center">
                          {option.value !== 'all' && (
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  labels.find((l) => l.id.toString() === option.value)?.color ??
                                  '#888',
                              }}
                            />
                          )}
                          <span>{option.label}</span>
                        </div>
                      )}
                      className="flex-1 sm:flex-none sm:w-40"
                    />
                  </div>
                )}

                {/* Sort */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 w-16">
                    Sort:
                  </span>
                  <ReactSelect
                    value={sorting.sortOrder}
                    onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                    options={[
                      { value: 'desc', label: 'Newest First' },
                      { value: 'asc', label: 'Oldest First' },
                    ]}
                    className="flex-1 sm:flex-none sm:w-36"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Filters Toggle */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAdvancedFilters}
                className="gap-2 h-8 text-xs"
              >
                {showAdvancedFilters ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide Advanced Filters
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show Advanced Filters
                  </>
                )}
              </Button>
            </div>

            {/* Advanced Filters Section */}
            {showAdvancedFilters && (
              <div className="p-3 space-y-3 rounded-lg border bg-muted/10">
                <div className="flex gap-2 items-center">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Advanced Filters
                  </span>
                </div>

                {/* Contextual Filters - shown based on status */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:gap-3">
                  {/* Spam filters - available for all messages (processed or not) */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showSpam ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          showSpam: e.target.checked,
                          showSuspicious: false,
                          excludeSpam: false,
                        })
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
                        setFilters({
                          ...filters,
                          excludeSpam: e.target.checked,
                          showSpam: false,
                          showSuspicious: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3 text-green-500" />
                      <span>Exclude Spam</span>
                    </div>
                  </label>

                  {/* Show Ticket Worthy & Needs Info only for Active tab */}
                  {filters.view === 'active' && (
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
                      checked={filters.isLead ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, isLead: e.target.checked, isQualifiedLead: false })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Target className="w-3 h-3" />
                      <span>Leads Only</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.isQualifiedLead ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, isQualifiedLead: e.target.checked, isLead: false })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Target className="w-3 h-3 text-green-600" />
                      <span>Qualified Leads</span>
                    </div>
                  </label>

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

                  {/* Ticket filters - checkboxes (mutually exclusive like spam filters) */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasTicket === true}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Check this, uncheck the other
                          setFilters({ ...filters, hasTicket: true });
                        } else {
                          // Uncheck - show all
                          setFilters({ ...filters, hasTicket: undefined });
                        }
                      }}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Ticket className="w-3 h-3 text-green-500" />
                      <span>Has Ticket</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasTicket === false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Check this, uncheck the other
                          setFilters({ ...filters, hasTicket: false });
                        } else {
                          // Uncheck - show all
                          setFilters({ ...filters, hasTicket: undefined });
                        }
                      }}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Ticket className="w-3 h-3 text-muted-foreground" />
                      <span>No Ticket</span>
                    </div>
                  </label>

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
                      checked={filters.customerResponded ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, customerResponded: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <MessageCircle className="w-3 h-3 text-orange-500" />
                      <span>Customer Replied</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showKBOnly ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          showKBOnly: e.target.checked,
                          excludeKB: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <BookOpen className="w-3 h-3 text-purple-500" />
                      <span>Only KB</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeKB ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          excludeKB: e.target.checked,
                          showKBOnly: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <BookOpen className="w-3 h-3 text-green-500" />
                      <span>Exclude KB</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.needsHumanReview ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, needsHumanReview: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium text-orange-600 whitespace-nowrap dark:text-orange-400">
                      <AlertCircle className="w-3 h-3" />
                      <span>Needs Review</span>
                    </div>
                  </label>
                </div>

                {/* Age range filter */}
                <div className="pt-2 border-t">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Age</p>
                  <div className="flex flex-wrap gap-1">
                    {AGE_RANGE_OPTIONS.map(({ value, label }) => (
                      <button
                        key={label}
                        onClick={() => setFilters({ ...filters, ageRange: value })}
                        className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                          filters.ageRange === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
