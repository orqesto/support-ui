import type { VariantProps } from 'class-variance-authority';
import type { searchInputVariants } from './searchInput.styles';

export type SearchInputProps = VariantProps<typeof searchInputVariants> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSearch?: () => void;
  showSearchButton?: boolean;
  onBlur?: () => void;
};
