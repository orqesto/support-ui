import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilterMenu } from './FilterMenu';
import { FilterToken } from './FilterToken';
import { clearPatch, clearedValue, suggestionsFor, tokensOf } from './filterTokens';
import {
  filterValue,
  toggleCsvValue,
  withNegation,
  type FilterDef,
  type FilterKey,
} from './filterSchema';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The inbox filter bar: every active filter as a token on one line, with a menu that
 * both searches and browses.
 *
 * Replaces a panel that ran ~730px open and hid the thread list. The bar is one row
 * whether you have no filters or nine; the menu is a popover, so opening it costs the
 * list nothing.
 */
export const FilterTokenBar = ({
  defs,
  filters,
  isKanban,
  onFilterChange,
  onFilterPatch,
  onCommitSearch,
}: {
  defs: FilterDef[];
  filters: FilterState;
  isKanban: boolean;
  onFilterChange: (key: string, value: string | boolean) => void;
  /** Several keys in ONE write. The date range and clearing a negated filter each touch
   *  more than one field, and doing that as two writes fetches the list twice — once
   *  for a state nobody asked for. */
  onFilterPatch: (patch: Partial<FilterState>) => void;
  onCommitSearch: (text: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelKey, setPanelKey] = useState<FilterKey | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  /** Explains an exclusivity swap. The old panel reset the other dropdown silently. */
  const [notice, setNotice] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tokens = useMemo(() => tokensOf(defs, filters, isKanban), [defs, filters, isKanban]);
  const suggestions = useMemo(
    () => suggestionsFor(defs, query, isKanban),
    [defs, query, isKanban]
  );

  const close = useCallback(() => {
    setOpen(false);
    setPanelKey(null);
    setQuery('');
    setHighlighted(0);
  }, []);

  const openBar = useCallback(() => {
    setOpen(true);
    setPanelKey(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Click-away. Bound while open only, so a closed bar costs nothing.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // "/" focuses the bar, the way it does in every tool this borrows from. Ignored
  // while the caret is in some other field, or it would eat a typed slash.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      event.preventDefault();
      openBar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openBar]);

  const setValue = useCallback(
    (def: FilterDef, value: string, options?: { keepOpen?: boolean }) => {
      if (def.kind === 'date') {
        // A bucket and an explicit range are alternatives, so choosing one drops the
        // other. Both would be honoured by the API — as an intersection nobody asked for.
        onFilterPatch({ ageRange: value as FilterState['ageRange'], receivedFrom: undefined, receivedTo: undefined });
      } else if (def.multi) {
        // Toggle, not replace: a second pick on a multi means "and this one too".
        onFilterChange(def.key, toggleCsvValue((filters as Record<string, unknown>)[def.key], value));
      } else {
        onFilterChange(def.key, value);
      }
      // Status and Queue partition disjoint sets — together they always match nothing.
      // Say so, rather than quietly resetting the other one.
      if (def.exclusiveWith && filterValue(filters, def.exclusiveWith) !== undefined) {
        const other = defs.find((row) => row.key === def.exclusiveWith);
        onFilterChange(def.exclusiveWith, clearedValue(other ?? def));
        setNotice(
          `${other?.label ?? 'The other filter'} was cleared — it and ${def.label} filter different sets and cannot combine.`
        );
      } else {
        setNotice('');
      }
      // A multi stays open so the next value is one click away, not a reopen. Picking
      // one off the suggestion list is a finished action, so that path passes keepOpen.
      const stayOpen = Boolean(def.sub) || (Boolean(def.multi) && options?.keepOpen === true);
      if (!stayOpen) close();
    },
    [defs, filters, onFilterChange, onFilterPatch, close]
  );

  /** The explicit range half of Received — clears the bucket for the same reason. */
  const setRange = useCallback(
    (next: { from?: string; to?: string }) => {
      onFilterPatch({ ageRange: 'all', receivedFrom: next.from, receivedTo: next.to });
      setNotice('');
    },
    [onFilterPatch]
  );

  const setNegated = useCallback(
    (def: FilterDef, negated: boolean) => {
      onFilterChange('negate', withNegation(filters, def.key, negated));
    },
    [filters, onFilterChange]
  );

  const toggleFlag = useCallback(
    (def: FilterDef) => {
      const on = filterValue(filters, def.key) !== undefined;
      onFilterChange(def.key, !on);
    },
    [filters, onFilterChange]
  );

  const pickSuggestion = useCallback(
    (index: number) => {
      const suggestion = suggestions[index];
      if (!suggestion) return;
      if (suggestion.kind === 'free') {
        onCommitSearch(suggestion.query);
        close();
        return;
      }
      if (suggestion.kind === 'flag') {
        onFilterChange(suggestion.def.key, true);
        close();
        return;
      }
      if (suggestion.kind === 'value') {
        setValue(suggestion.def, suggestion.option.value, { keepOpen: false });
        return;
      }
      setPanelKey(suggestion.def.key);
      setQuery('');
    },
    [suggestions, onCommitSearch, onFilterChange, setValue, close]
  );

  const removeToken = useCallback(
    (def: FilterDef) => {
      onFilterPatch(clearPatch(def, filters));
      setNotice('');
    },
    [filters, onFilterPatch]
  );

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'Backspace' && !query && tokens.length > 0) {
      removeToken(tokens[tokens.length - 1].def);
      return;
    }
    if (panelKey) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => Math.min(prev + 1, Math.max(0, suggestions.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (query.trim()) pickSuggestion(highlighted);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        onMouseDown={(event) => {
          // A click on a token's own controls must not also reopen the bar.
          if ((event.target as HTMLElement).closest('button')) return;
          openBar();
        }}
        // Dark mode drops to --background rather than --input: the bar sits ON a card,
        // and --input there is barely distinguishable from it.
        className={`flex flex-wrap gap-1.5 items-center p-1.5 rounded-md border cursor-text min-h-[46px] transition-colors bg-input dark:bg-background ${
          open
            ? 'border-primary ring-2 ring-primary/10'
            : 'border-border hover:border-accent-foreground dark:hover:border-primary/50'
        }`}
      >
        <Search className="ml-1.5 w-4 h-4 text-muted-foreground shrink-0" />
        {tokens.map((token) => (
          <FilterToken
            key={token.def.key}
            token={token}
            onEdit={() => {
              if (token.def.kind === 'flag') return;
              if (token.def.kind === 'free') {
                setQuery(token.value);
                onFilterChange('search', '');
              }
              setPanelKey(token.def.kind === 'free' ? null : token.def.key);
              setOpen(true);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            onRemove={() => removeToken(token.def)}
          />
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setPanelKey(null);
          }}
          onKeyDown={onInputKeyDown}
          aria-label="Filter or search messages"
          placeholder={
            tokens.length
              ? 'Add filter or search…'
              : 'Filter by status, assignee, priority, source…'
          }
          className="flex-1 px-1 h-7 bg-transparent outline-none min-w-[150px] text-[13.5px] placeholder:text-muted-foreground/70"
        />
      </div>

      {open && (
        <div className="overflow-hidden absolute right-0 left-0 top-[52px] z-30 rounded-lg border shadow-lg max-w-[460px] bg-card border-border">
          <FilterMenu
            defs={defs}
            filters={filters}
            isKanban={isKanban}
            query={query}
            suggestions={suggestions}
            highlighted={highlighted}
            panelKey={panelKey}
            onOpenPanel={(key) => setPanelKey(key)}
            onBack={() => setPanelKey(null)}
            onPick={(def, value) => setValue(def, value, { keepOpen: true })}
            onPickSub={(def, value) => {
              if (def.sub) onFilterChange(def.sub.key, value);
              close();
            }}
            onToggleFlag={toggleFlag}
            onPickSuggestion={pickSuggestion}
            onSetNegated={setNegated}
            onSetRange={setRange}
          />
        </div>
      )}

      {notice && !open && (
        <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">{notice}</p>
      )}
    </div>
  );
};
