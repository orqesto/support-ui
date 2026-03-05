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
          <div className="flex flex items-center">
            <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
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
            <X className="mr-1 w-4 h-4" />
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
        <div className="flex flex-wrap gap-3 items-center mb-3">
          {/* Category Quick Filters */}
          <div className="flex flex-col gap-2 w-full rounded-md shadow-sm sm:inline-flex sm:flex-row sm:w-auto">
            <span className="mr-2 text-sm font-medium">Category:</span>
            <Button
              size="sm"
              variant={!filters.category ? 'primary' : 'outline'}
              onClick={() => onFilterChange('category', '')}
              className="h-8"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filters.category === 'spam' ? 'primary' : 'outline'}
              onClick={() => onFilterChange('category', 'spam')}
              className="h-8"
            >
              Spam
            </Button>
            <Button
              size="sm"
              variant={filters.category === 'promotional' ? 'primary' : 'outline'}
              onClick={() => onFilterChange('category', 'promotional')}
              className="h-8"
            >
              Promotional
            </Button>
            <Button
              size="sm"
              variant={filters.category === 'scam' ? 'primary' : 'outline'}
              onClick={() => onFilterChange('category', 'scam')}
              className="h-8"
            >
              Scam
            </Button>
            <Button
              size="sm"
              variant={filters.category === 'phishing' ? 'primary' : 'outline'}
              onClick={() => onFilterChange('category', 'phishing')}
              className="h-8"
            >
              Phishing
            </Button>
          </div>

          {/* Channel Dropdown */}
        </div>

        {/* Second Row: Source + Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
          {/* Channel */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium w-full sm:w-auto">Channel:</span>
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

          {/* Source */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium w-full sm:w-auto">Source:</span>
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

          {/* Sort */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium w-full sm:w-auto">Sort:</span>
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
