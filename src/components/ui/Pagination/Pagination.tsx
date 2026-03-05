import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../Button';
import { getPaginationPageButtonClasses } from './pagination.styles';
import type { PaginationProps } from './pagination.types';

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
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-wrap justify-center sm:justify-between items-center gap-2 px-4 py-3 rounded-b-lg border-t border-border bg-card">
      {/* Information about shown items */}
      <div className="flex flex-wrap justify-center sm:justify-start items-center text-sm text-muted-foreground w-full sm:w-auto">
        Showing <span className="mx-1 font-medium">{startItem}</span> to{' '}
        <span className="mx-1 font-medium">{endItem}</span> of{' '}
        <span className="mx-1 font-medium">{total}</span> results
      </div>

      {/* Pagination buttons */}
      <div className="flex flex-wrap justify-center gap-2 items-center w-full sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>

        <div className="flex flex-wrap justify-center gap-1">
          {getPageNumbers().map((page) =>
            typeof page === 'number' ? (
              <Button
                variant="outline"
                size="sm"
                key={page.toString()}
                onClick={() => onPageChange(page)}
                disabled={loading}
                className={getPaginationPageButtonClasses(page === currentPage)}
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
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};
