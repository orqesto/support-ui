import { useEffect, useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
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
          onChange={(value) => setPendingSearch(value)}
          onSearch={onSearch}
          onBlur={onSearchBlur}
          showSearchButton={true}
          placeholder="Search by sender, subject, content, domain..."
          className="mb-4"
          size="sm"
        />

        {/* Quick Filters + Inline Controls */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Category Quick Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1">
              <span className="text-xs font-semibold text-muted-foreground sm:whitespace-nowrap sm:mr-2">
                Category:
              </span>
              {/* Mobile: 2x3 grid */}
              <div className="flex flex-col gap-2 sm:hidden">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!filters.category ? 'primary' : 'outline'}
                    onClick={() => onFilterChange('category', '')}
                    className="h-8 text-xs flex-1"
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={filters.category === 'spam' ? 'primary' : 'outline'}
                    onClick={() => onFilterChange('category', 'spam')}
                    className="h-8 text-xs flex-1"
                  >
                    Spam
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={filters.category === 'promotional' ? 'primary' : 'outline'}
                    onClick={() => onFilterChange('category', 'promotional')}
                    className="h-8 text-xs flex-1"
                  >
                    Promo
                  </Button>
                  <Button
                    size="sm"
                    variant={filters.category === 'scam' ? 'primary' : 'outline'}
                    onClick={() => onFilterChange('category', 'scam')}
                    className="h-8 text-xs flex-1"
                  >
                    Scam
                  </Button>
                  <Button
                    size="sm"
                    variant={filters.category === 'phishing' ? 'primary' : 'outline'}
                    onClick={() => onFilterChange('category', 'phishing')}
                    className="h-8 text-xs flex-1"
                  >
                    Phishing
                  </Button>
                </div>
              </div>
              {/* Tablet+: single row */}
              <div className="hidden gap-1 sm:flex">
                <Button
                  size="sm"
                  variant={!filters.category ? 'primary' : 'outline'}
                  onClick={() => onFilterChange('category', '')}
                  className="h-8 text-xs"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filters.category === 'spam' ? 'primary' : 'outline'}
                  onClick={() => onFilterChange('category', 'spam')}
                  className="h-8 text-xs"
                >
                  Spam
                </Button>
                <Button
                  size="sm"
                  variant={filters.category === 'promotional' ? 'primary' : 'outline'}
                  onClick={() => onFilterChange('category', 'promotional')}
                  className="h-8 text-xs"
                >
                  Promotional
                </Button>
                <Button
                  size="sm"
                  variant={filters.category === 'scam' ? 'primary' : 'outline'}
                  onClick={() => onFilterChange('category', 'scam')}
                  className="h-8 text-xs"
                >
                  Scam
                </Button>
                <Button
                  size="sm"
                  variant={filters.category === 'phishing' ? 'primary' : 'outline'}
                  onClick={() => onFilterChange('category', 'phishing')}
                  className="h-8 text-xs"
                >
                  Phishing
                </Button>
              </div>
            </div>

            {/* Divider - hidden on mobile */}
            <div className="hidden mx-3 w-px h-8 sm:block bg-border" />

            {/* Channel Dropdown */}
            <div className="flex gap-2 items-center min-w-[140px] sm:pr-4">
              <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
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
                value={filters.sortOrder ?? 'desc'}
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
          <div className="pt-4 mt-4 border-t">
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
      </CardContent>
    </Card>
  );
};
