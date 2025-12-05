import type { VariantProps } from 'class-variance-authority';
import type { paginationContainerVariants } from './pagination.styles';

export type PaginationProps = VariantProps<typeof paginationContainerVariants> & {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};
