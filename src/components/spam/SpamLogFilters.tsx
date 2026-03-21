import { useEffect, useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { integrationsService, type Integration } from '@/services/integrations.service';
import type { SpamLogFilters as SpamLogFiltersType } from '@/services/spamLog.service';

type SpamLogFiltersProps = {
  filters: SpamLogFiltersType;
  pendingSearch: string;
  activeFilterCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string | number | boolean) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
  setFilters: (filters: Partial<SpamLogFiltersType>) => void;
};

export const SpamLogFilters = ({
  filters,
  pendingSearch,
  activeFilterCount,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  setPendingSearch,
}: SpamLogFiltersProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const toggleAdvancedFilters = () => {
    setShowAdvancedFilters(!showAdvancedFilters);
  };

  // Fetch message sources on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await integrationsService.getAll();
        if (response.success && response.data) {
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

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearFilters}
            className="h-8 shrink-0"
            disabled={activeFilterCount === 0}
          >
            <X className="mr-1 w-3 h-3" />
            Clear All
          </Button>
        </div>

        <div className="space-y-4">
          {/* Search */}
          <div className="flex flex-wrap gap-3 items-center">
            <SearchInput
              value={pendingSearch}
              onChange={(value) => setPendingSearch(value)}
              onSearch={onSearch}
              onBlur={onSearchBlur}
              showSearchButton={true}
              placeholder="Search by sender, subject, content, domain..."
              className="flex-1 min-w-[200px] sm:min-w-[300px]"
              size="sm"
            />
          </div>

          {/* Primary Filters */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex flex-col gap-3">
              {/* Category */}
              <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:w-auto">
                <span className="text-xs font-semibold text-muted-foreground shrink-0">Category:</span>
                <div className="flex flex-wrap gap-1">
                  {(['', 'spam', 'promotional', 'scam', 'phishing'] as const).map((cat) => (
                    <Button
                      key={cat || 'all'}
                      size="sm"
                      variant={filters.category === cat || (!filters.category && cat === '') ? 'primary' : 'outline'}
                      onClick={() => onFilterChange('category', cat)}
                      className="h-8"
                    >
                      {cat === '' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Channel / Source / Sort */}
              <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex flex-col gap-2 items-start w-full sm:flex-row sm:items-center sm:w-auto">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">Channel:</span>
                  <ReactSelect
                    value={filters.channel ?? 'all'}
                    onChange={(value) => onFilterChange('channel', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'email', label: 'Email' },
                      { value: 'telegram', label: 'Telegram' },
                      { value: 'slack', label: 'Slack' },
                    ]}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="flex flex-col gap-2 items-start w-full sm:flex-row sm:items-center sm:w-auto">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">Source:</span>
                  <ReactSelect
                    value={filters.messageSourceId?.toString() ?? 'all'}
                    onChange={(value) =>
                      onFilterChange('messageSourceId', value === 'all' ? '' : Number(value))
                    }
                    options={[
                      { value: 'all', label: 'All Sources' },
                      ...messageSources.map((source) => ({
                        value: source.id.toString(),
                        label: source.name,
                      })),
                    ]}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="flex flex-col gap-2 items-start w-full sm:flex-row sm:items-center sm:w-auto">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">Sort:</span>
                  <ReactSelect
                    value={filters.sortOrder ?? 'desc'}
                    onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                    options={[
                      { value: 'desc', label: 'Newest First' },
                      { value: 'asc', label: 'Oldest First' },
                    ]}
                    className="w-full sm:w-40"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Filters Toggle */}
        <div className="flex justify-center mt-4">
          <Button size="sm" variant="ghost" onClick={toggleAdvancedFilters} className="text-xs">
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
          <div className="p-3 space-y-3 rounded-lg border bg-muted/10">
            <span className="text-xs font-semibold text-muted-foreground">Advanced Filters</span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {/* Department */}
              <div>
                <label className="block mb-1 text-xs font-medium text-muted-foreground">
                  Department
                </label>
                <ReactSelect
                  value={filters.departmentRole ?? 'all'}
                  onChange={(value) => onFilterChange('departmentRole', value)}
                  options={[
                    { value: 'all', label: 'All Departments' },
                    { value: 'support', label: 'Support' },
                    { value: 'sales', label: 'Sales' },
                    { value: 'billing', label: 'Billing' },
                    { value: 'hr', label: 'HR' },
                    { value: 'general', label: 'General' },
                  ]}
                />
              </div>

              {/* Time Period */}
              <div>
                <label className="block mb-1 text-xs font-medium text-muted-foreground">
                  Time Period
                </label>
                <ReactSelect
                  value={filters.days?.toString() ?? '30'}
                  onChange={(value) => onFilterChange('days', Number(value))}
                  options={[
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' },
                    { value: '90', label: 'Last 90 days' },
                    { value: '365', label: 'Last year' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
};
