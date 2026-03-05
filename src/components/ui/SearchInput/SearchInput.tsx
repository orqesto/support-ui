import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  getSearchInputClasses,
  getSearchIconClasses,
  getSearchButtonClasses,
} from './searchInput.styles';
import type { SearchInputProps } from './searchInput.types';

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  size = 'md',
  onSearch,
  showSearchButton = false,
  onBlur,
}: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const wasFocusedRef = useRef(false);
  const cursorPositionRef = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inputRef.current) {
      cursorPositionRef.current = {
        start: inputRef.current.selectionStart,
        end: inputRef.current.selectionEnd,
      };
    }
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  useEffect(() => {
    if (wasFocusedRef.current && inputRef.current && document.activeElement !== inputRef.current) {
      requestAnimationFrame(() => {
        if (inputRef.current && wasFocusedRef.current) {
          inputRef.current.focus();
          const { start, end } = cursorPositionRef.current;
          if (start !== null && end !== null) {
            try {
              inputRef.current.setSelectionRange(start, end);
            } catch {
              // Ignore invalid cursor position
            }
          }
        }
      });
    }
  });

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          wasFocusedRef.current = true;
        }}
        onBlur={() => {
          wasFocusedRef.current = false;
          onBlur?.();
        }}
        className={getSearchInputClasses(size)}
      />

      <div className="flex absolute right-2 top-1/2 gap-1 items-center -translate-y-1/2">
        {value && (
          <Button
            variant="ghost"
            onClick={handleClear}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(getSearchButtonClasses(size), 'text-muted-foreground hover:text-primary')}
            title="Clear search"
            type="button"
            aria-label="Clear search"
          >
            <X className={getSearchIconClasses(size)} />
          </Button>
        )}

        {showSearchButton && onSearch && (
          <Button
            variant="ghost"
            onClick={onSearch}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(
              getSearchButtonClasses(size),
              'text-white/60 hover:text-primary dark:text-white/40'
            )}
            title="Search"
            aria-label="Search"
          >
            {/* <Search className={getSearchIconClasses(size)} /> */}
          </Button>
        )}
      </div>
    </div>
  );
};
