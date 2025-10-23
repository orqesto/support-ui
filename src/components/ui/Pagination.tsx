import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};

export const Pagination = ({
  currentPage,
  totalPages,
  total,
  limit,
  onPageChange,
  loading = false,
}: PaginationProps) => {
  const startItem = (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, total);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex justify-between items-center px-4 py-3 rounded-b-lg border-t border-border bg-card">
      <div className="flex items-center text-sm text-muted-foreground">
        Showing <span className="mx-1 font-medium">{startItem}</span> to{' '}
        <span className="mx-1 font-medium">{endItem}</span> of{' '}
        <span className="mx-1 font-medium">{total}</span> results
      </div>

      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>

        <div className="flex gap-1">
          {getPageNumbers().map((page) =>
            typeof page === 'number' ? (
              <Button
                variant="outline"
                size="sm"
                key={page.toString()}
                onClick={() => onPageChange(page)}
                disabled={loading}
                className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-foreground'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {page}
              </Button>
            ) : (
              <span
                key={page.toString()}
                className="min-w-[36px] h-9 px-3 flex items-center justify-center text-muted-foreground"
              >
                {page}
              </span>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
