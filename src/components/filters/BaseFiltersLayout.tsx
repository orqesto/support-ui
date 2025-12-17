import { Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';

type BaseFiltersLayoutProps = {
  title: string;
  activeFilterCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  children: React.ReactNode;
};

export const BaseFiltersLayout = ({
  title,
  activeFilterCount,
  pagination,
  searchValue,
  onSearchChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  children,
}: BaseFiltersLayoutProps) => (
  <Card>
    <CardContent className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2 items-center">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{title}</span>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8 shrink-0"
              disabled={activeFilterCount === 0}
            >
              <X className="mr-1 w-3 h-3 hidden sm:block" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Search */}
        <SearchInput
          value={searchValue}
          onChange={(value) => onSearchChange(value)}
          onSearch={onSearch}
          onBlur={onSearchBlur}
          showSearchButton={true}
          placeholder="Search..."
          className="flex-1 min-w-[200px] sm:min-w-[300px]"
          size="sm"
        />

        {/* Filter Controls */}
        {children}
      </div>
    </CardContent>
  </Card>
);
