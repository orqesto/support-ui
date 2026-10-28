import type { VariantProps } from 'class-variance-authority';
import type { paginationContainerVariants } from './pagination.styles';

export type PaginationProps = VariantProps<typeof paginationContainerVariants> & {
  currentPage: number;
  totalPages: number;
  total: number;
  /** `total` is a lower bound ("at least"): shown as `10,000+`. */
  totalCapped?: boolean;
  limit: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};
