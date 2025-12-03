import { useState } from 'react';
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  AlertTriangle,
} from 'lucide-react';
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
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string | boolean) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
  setFilters: (filters: Partial<SpamLogFilters>) => void;
};

export const SpamFilters = ({
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
  setFilters,
}: SpamFiltersProps) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Helper to get active filter labels
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
      const max = filters.maxScore ?? 100;
      active.push({ key: 'severity', label: 'Severity', value: `${min}-${max}` });
    }

    return active;
  };

  const activeFilters = getActiveFilters();

  const removeFilter = (key: string) => {
    if (key === 'status') {
      setFilters({ ...filters, status: 'all' });
    } else if (key === 'category') {
      setFilters({ ...filters, category: 'all' });
    } else if (key === 'channel') {
      setFilters({ ...filters, channel: 'all' });
    } else if (key === 'severity') {
      setFilters({ ...filters, minScore: undefined, maxScore: undefined });
    }
  };

  // Quick filter presets
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'pending':
        setFilters({
          ...filters,
          status: 'pending',
        });
        onSortingChange('desc');
        break;
      case 'high-severity':
        setFilters({
          ...filters,
          minScore: 70,
          maxScore: 100,
          status: 'pending',
        });
        onSortingChange('desc');
        break;
      case 'recent':
        setFilters({
          ...filters,
          status: 'all',
        });
        onSortingChange('desc');
        break;
      case 'confirmed':
        setFilters({
          ...filters,
          status: 'confirmed',
        });
        onSortingChange('desc');
        break;
      case 'false-positives':
        setFilters({
          ...filters,
          status: 'false_positive',
        });
        onSortingChange('desc');
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

          {/* Quick Filter Presets */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground">Quick Filters:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('pending')}
              className="h-7 gap-1.5 text-xs"
            >
              <Clock className="w-3 h-3" />
              Pending Review
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('high-severity')}
              className="h-7 gap-1.5 text-xs"
            >
              <AlertTriangle className="w-3 h-3 text-orange-500" />
              High Severity
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('recent')}
              className="h-7 gap-1.5 text-xs"
            >
              <Zap className="w-3 h-3" />
              Recent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('confirmed')}
              className="h-7 gap-1.5 text-xs"
            >
              Confirmed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('false-positives')}
              className="h-7 gap-1.5 text-xs"
            >
              False Positives
            </Button>
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
                placeholder="Search by email, subject, content..."
                className="flex-1 min-w-[200px] sm:min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Primary Filters Row */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex flex-col gap-4 md:gap-6">
                <div className="w-full">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      Status:
                    </span>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <Button
                        variant={filters.status === 'pending' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange('status', 'pending')}
                        className="h-8 text-xs rounded-r-none rounded-l-md border-r-0"
                      >
                        Pending
                      </Button>
                      <Button
                        variant={filters.status === 'confirmed' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange('status', 'confirmed')}
                        className="h-8 text-xs rounded-none border-r-0"
                      >
                        Confirmed
                      </Button>
                      <Button
                        variant={filters.status === 'false_positive' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange('status', 'false_positive')}
                        className="h-8 text-xs rounded-none border-r-0"
                      >
                        False Positive
                      </Button>
                      <Button
                        variant={filters.status === 'whitelisted' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange('status', 'whitelisted')}
                        className="h-8 text-xs rounded-none border-r-0"
                      >
                        Whitelisted
                      </Button>
                      <Button
                        variant={filters.status === 'all' || !filters.status ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange('status', 'all')}
                        className="h-8 text-xs rounded-r-md rounded-l-none"
                      >
                        All
                      </Button>
                    </div>
                  </div>
                </div>

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
                      Sort:
                    </span>
                    <ReactSelect
                      value={filters.sortOrder ?? 'desc'}
                      onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                      options={[
                        { value: 'desc', label: 'Newest First' },
                        { value: 'asc', label: 'Oldest First' },
                      ]}
                      className="min-w-[120px] sm:w-full"
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
                      Severity Range (0-100):
                    </span>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Min</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={filters.minScore ?? 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setFilters({
                              ...filters,
                              minScore: value,
                            });
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Max</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={filters.maxScore ?? 100}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 100;
                            setFilters({
                              ...filters,
                              maxScore: value,
                            });
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
                      Confidence (Detection Accuracy):
                    </span>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Min Confidence</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={filters.minScore ?? 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setFilters({
                              ...filters,
                              minScore: value,
                            });
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background border-input"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-center px-2">to</div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Max Confidence</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={filters.maxScore ?? 100}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 100;
                            setFilters({
                              ...filters,
                              maxScore: value,
                            });
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
                            setFilters({
                              ...filters,
                              startDate: e.target.value || undefined,
                            });
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
                            setFilters({
                              ...filters,
                              endDate: e.target.value || undefined,
                            });
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
