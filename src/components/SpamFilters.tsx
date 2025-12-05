import { useState } from 'react';
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
// removed unused icons for presets
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import type { SpamLogFilters } from '@/services/spamLog.service';

type SpamFiltersProps = {
  filters: SpamLogFilters;
  pendingSearch: string;
  activeFilterCount: number;
  detectedAt: string;  
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string | boolean) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void; 
  setPendingSearch: (value: string) => void;
  setFilters: (filters: Partial<SpamLogFilters>) => void;
};

export const SpamFilters = ({
  filters,
  pendingSearch,
  activeFilterCount,
  detectedAt,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  setPendingSearch,
  setFilters,
}: SpamFiltersProps) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const handleSortingChange = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    onSortingChange(sortBy, sortOrder);
    setFilters({ ...filters, sortBy, sortOrder });
  };
  // Helper to build active filter pills
  const getActiveFilters = () => {
    const active: Array<{ key: string; label: string; value: string }> = [];

    if (filters.status && filters.status !== 'all') {
      active.push({ key: 'status', label: 'Status', value: filters.status });
    }
    if (filters.category && filters.category !== 'all') {
      active.push({ key: 'category', label: 'Category', value: filters.category });
    }
    if (filters.channel && filters.channel !== 'all') {
      active.push({ key: 'channel', label: 'Channel', value: filters.channel });
    }
    if (filters.minScore !== undefined || filters.maxScore !== undefined) {
      const min = filters.minScore ?? 0;
      const max = filters.maxScore ?? 300;
      active.push({ key: 'severity', label: 'Severity', value: `${min}-${max}` });
    }
    if (filters.search) {
      active.push({ key: 'search', label: 'Search', value: filters.search });
    }

    return active;
  };

  const activeFilters = getActiveFilters();

  const removeFilter = (key: string) => {
    if (key === 'category') {
      setFilters({ ...filters, category: 'all' });
    } else if (key === 'channel') {
      setFilters({ ...filters, channel: 'all' });
    } else if (key === 'severity') {
      setFilters({ ...filters, minScore: undefined, maxScore: undefined });
    }
  };

  // Quick presets removed
  const sortOptions = [
    { value: 'desc', label: `Newest ` },
    { value: 'asc', label: `Oldest ` },
  ];
  const severitySortOptions = [
    { value: 'desc', label: 'Highest severity' },
    { value: 'asc', label: 'Lowest severity' },
  ];
  const confidenceSortOptions = [
    { value: 'desc', label: 'Highest confidence' },
    { value: 'asc', label: 'Lowest confidence' },
  ];

 
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
              {activeFilters.map((filter) => (
                <Badge
                  key={`${filter.key}-${filter.value}`}
                  variant="secondary"
                  className="flex gap-1 items-center py-1 pr-1 pl-2 text-xs group"
                >
                  <span className="font-normal text-muted-foreground">{filter.label}:</span>
                  <span className="font-medium capitalize">{filter.value}</span>
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

          {/* Quick Filters removed */}

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
                placeholder="Search by email, subject, content..."
                className="flex-1 min-w-[200px] sm:min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Primary Filters Row */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex flex-col gap-4 md:gap-6">

                <div className="flex flex-col gap-3 md:flex-row md:flex-wrap lg:flex-nowrap md:items-center">
                  <div className="flex gap-2 items-center min-w-[140px] sm:py-2">
                    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      Category:
                    </span>
                    <ReactSelect
                      value={filters.category ?? 'all'}
                      onChange={(value) => onFilterChange('category', value)}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'spam', label: 'Spam' },
                        { value: 'promotional', label: 'Promotional' },
                        { value: 'transactional', label: 'Transactional' },
                        { value: 'invalid_response', label: 'Invalid Response' },
                        { value: 'suspicious', label: 'Suspicious' },
                      ]}
                      className="min-w-[120px] sm:w-full"
                    />
                  </div>

                  <div className="hidden w-px h-8 lg:block bg-border" />

                 
                  <div className="hidden w-px h-8 lg:block bg-border" />

                  <div className="flex gap-2 items-center min-w-[140px] sm:py-2">
                    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      Time:
                    </span>
                    <ReactSelect
                      value={filters.sortBy === 'detectedAt' ? (filters.sortOrder ?? 'desc') : 'desc'}
                      onChange={(value) => handleSortingChange(detectedAt, value as 'asc' | 'desc')}
                      options={sortOptions}
                      className="min-w-[120px] sm:w-full"
                    />
                  </div>

                  <div className="flex gap-2 items-center min-w-[180px] sm:py-2">
                    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      Severity:
                    </span>
                    <ReactSelect
                      value={filters.sortBy === 'severity' ? (filters.sortOrder ?? 'desc') : 'desc'}
                      onChange={(value) => handleSortingChange('severity', value as 'asc' | 'desc')}
                      options={severitySortOptions}
                      className="min-w-[140px] sm:w-full"
                    />
                  </div>

                  <div className="flex gap-2 items-center min-w-[180px] sm:py-2">
                    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      Confidence:
                    </span>
                    <ReactSelect
                      value={filters.sortBy === 'confidence' ? (filters.sortOrder ?? 'desc') : 'desc'}
                      onChange={(value) => handleSortingChange('confidence', value as 'asc' | 'desc')}
                      options={confidenceSortOptions}
                      className="min-w-[140px] sm:w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Filters Toggle */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
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

                {/* Severity Range Filter */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground mb-2 block">
                      Severity Range (0-300):
                    </span>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Min</label>
                        <input
                          type="number"
                          min="0"
                          max="300"
                          value={filters.minScore ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || val === null) {
                              setFilters({ ...filters, minScore: undefined });
                              onFilterChange('minScore', '');
                            } else {
                              const num = Math.max(0, Math.min(300, Number(val)));
                              if (!isNaN(num)) {
                                setFilters({ ...filters, minScore: num });
                                onFilterChange('minScore', String(num));
                              }
                            }
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Max</label>
                        <input
                          type="number"
                          min="0"
                          max="300"
                          placeholder="300"
                          value={filters.maxScore ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || val === null) {
                              setFilters({ ...filters, maxScore: undefined });
                              onFilterChange('maxScore', '');
                            } else {
                              const num = Math.max(0, Math.min(300, Number(val)));
                              if (!isNaN(num)) {
                                setFilters({ ...filters, maxScore: num });
                                onFilterChange('maxScore', String(num));
                              }
                            }
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                    </div>
                  </label>
                </div>

                {/* Confidence Range Filter */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground mb-2 block">
                      Confidence Range (0-100%):
                    </span>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Min %</label>
                        <input
                          type="number"
                     
                          max="100"
                          value={filters.minConfidence !== undefined ? Math.round(filters.minConfidence * 100) : ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || val === null) {
                              setFilters({ ...filters, minConfidence: undefined });
                              onFilterChange('minConfidence', '');
                            } else {
                              const num = Number(val);
                              if (!isNaN(num)) {
                                const percent = Math.max(0, Math.min(100, num));
                                const floatVal = percent / 100;
                                setFilters({ ...filters, minConfidence: floatVal });
                                onFilterChange('minConfidence', String(floatVal));
                              }
                            }
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Max %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="100"
                          value={filters.maxConfidence !== undefined ? Math.round(filters.maxConfidence * 100) : ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || val === null) {
                              setFilters({ ...filters, maxConfidence: undefined });
                              onFilterChange('maxConfidence', '');
                            } else {
                              const num = Number(val);
                              if (!isNaN(num)) {
                                const percent = Math.max(0, Math.min(100, num));
                                const floatVal = percent / 100;
                                setFilters({ ...filters, maxConfidence: floatVal });
                                onFilterChange('maxConfidence', String(floatVal));
                              }
                            }
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                    </div>
                  </label>
                </div>

                {/* Date Range Filter */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground mb-2 block">
                      Date Range:
                    </span>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">From</label>
                        <input
                          type="date"
                          value={filters.startDate ?? ''}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            setFilters({
                              ...filters,
                              startDate: value,
                            });
                            onFilterChange('startDate', value ?? '');
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">To</label>
                        <input
                          type="date"
                          value={filters.endDate ?? ''}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            setFilters({
                              ...filters,
                              endDate: value,
                            });
                            onFilterChange('endDate', value ?? '');
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
