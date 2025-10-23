import { useRef, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { Button } from './Button';

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  onSearch?: () => void; // Optional: trigger search on button click
  showSearchButton?: boolean; // Optional: show search button instead of auto-search
  onBlur?: () => void; // Optional: trigger on focus lost
};

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  size = 'md',
  onSearch,
  showSearchButton = false,
  onBlur,
}: SearchInputProps) => {
  const sizeClasses = size === 'sm' ? 'px-3 py-2 pr-8 text-xs' : 'px-3 py-2 pr-9 text-sm';

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const wasFocusedRef = useRef(false);
  const cursorPositionRef = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });

  // Save cursor position whenever input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inputRef.current) {
      cursorPositionRef.current = {
        start: inputRef.current.selectionStart,
        end: inputRef.current.selectionEnd,
      };
    }
    onChange(e.target.value);
  };

  // Maintain focus across all re-renders
  useEffect(() => {
    // If input was focused but lost focus due to re-render, restore it
    if (wasFocusedRef.current && inputRef.current && document.activeElement !== inputRef.current) {
      requestAnimationFrame(() => {
        if (inputRef.current && wasFocusedRef.current) {
          inputRef.current.focus();
          // Restore cursor position
          const { start, end } = cursorPositionRef.current;
          if (start !== null && end !== null) {
            try {
              inputRef.current.setSelectionRange(start, end);
            } catch (e) {
              // Ignore errors if cursor position is invalid
            }
          }
        }
      });
    }
  });

  return (
    <div className={`relative ${className}`}>
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
          if (onBlur) {
            onBlur();
          }
        }}
        className={`w-full rounded-md border ${sizeClasses} bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground`}
      />

      <div className="flex absolute right-2 top-1/2 gap-1 items-center -translate-y-1/2">
        {value && (
          <Button
            variant="ghost"
            onClick={() => {
              onChange('');
              // Keep focus on input after clearing
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
            onMouseDown={(e) => e.preventDefault()} // Prevent stealing focus from input
            className="h-auto min-h-[44px] min-w-[44px] p-2 rounded-full transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Clear search"
            type="button"
            aria-label="Clear search"
          >
            <X className={iconSize} />
          </Button>
        )}

        {showSearchButton && onSearch && (
          <Button
            variant="ghost"
            onClick={onSearch}
            onMouseDown={(e) => e.preventDefault()}
            className="h-auto min-h-[44px] min-w-[44px] p-2 rounded-full transition-colors text-primary hover:text-primary/80 hover:bg-primary/10"
            title="Search"
            aria-label="Search"
          >
            <Search className={iconSize} />
          </Button>
        )}
      </div>
    </div>
  );
};
