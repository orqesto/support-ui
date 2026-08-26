import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { FilterToken } from './FilterToken';
import { clearPatch, clearedValue, suggestionsFor, tokenText, tokensOf } from './filterTokens';
import {
  filterValue,
  isNegated,
  toggleCsvValue,
  visibleDefs,
  withNegation,
  GROUP_ORDER,
  type FilterDef,
} from './filterSchema';
import { optionSelected } from './FilterMenu';
import { isRangeValue, rangeFromValue } from './receivedRange';
import { DateRangeFields, NegateSwitch } from './ValueControls';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The filter surface for narrow screens.
 *
 * A popover anchored to a token bar is a desktop idea — on a phone the bar has no room
 * for tokens and the menu has nowhere to hang. Same schema, same state, different
 * shape: a full-height drawer with 52px rows you can hit with a thumb, and one
 * drill-down per filter instead of a nested popover.
 */

const ROW = 'w-full px-4 h-[52px] flex items-center gap-3 text-left border-b border-border/50 rounded-none justify-start font-normal';

/** Mirrors FilterMenu's threshold — see the note there. */
const OPTION_SEARCH_THRESHOLD = 8;

export const FilterSheet = ({
  open,
  onClose,
  defs,
  filters,
  isKanban,
  resultCount,
  onFilterChange,
  onFilterPatch,
  onCommitSearch,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  defs: FilterDef[];
  filters: FilterState;
  isKanban: boolean;
  resultCount: number;
  onFilterChange: (key: string, value: string | boolean) => void;
  /** Several keys in one write — see the same prop on `FilterTokenBar`. */
  onFilterPatch: (patch: Partial<FilterState>) => void;
  onCommitSearch: (text: string) => void;
  onClearAll: () => void;
}) => {
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Separate from `query` above, which searches FILTERS. This one searches the VALUES
  // inside one filter's panel — the "Received at" list runs to 99 addresses on a real
  // workspace, and a touch drawer is the worst place to hunt through that by scrolling.
  const [optionQuery, setOptionQuery] = useState('');
  // Opening a different filter must start with an empty needle. A stale one would
  // silently hide options in the panel just opened, which reads as "nothing here".
  const openPanel = (key: string | null) => {
    setOptionQuery('');
    setPanelKey(key);
  };

  const tokens = useMemo(() => tokensOf(defs, filters, isKanban), [defs, filters, isKanban]);
  const suggestions = useMemo(
    () => suggestionsFor(defs, query, isKanban),
    [defs, query, isKanban]
  );
  const usable = useMemo(() => visibleDefs(defs, isKanban), [defs, isKanban]);
  const panelDef = panelKey ? defs.find((def) => def.key === panelKey) : undefined;
  const panelSearchable = (panelDef?.options?.length ?? 0) > OPTION_SEARCH_THRESHOLD;
  const panelOptions = useMemo(() => {
    const all = panelDef?.options ?? [];
    const needle = optionQuery.trim().toLowerCase();
    if (!panelSearchable || !needle) return all;
    return all.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle)
    );
  }, [panelDef, optionQuery, panelSearchable]);

  const close = () => {
    openPanel(null);
    setQuery('');
    onClose();
  };

  const pick = (def: FilterDef, value: string) => {
    if (def.kind === 'date') {
      onFilterPatch({
        ageRange: value as FilterState['ageRange'],
        receivedFrom: undefined,
        receivedTo: undefined,
      });
    } else if (def.multi) {
      onFilterChange(def.key, toggleCsvValue((filters as Record<string, unknown>)[def.key], value));
    } else {
      onFilterChange(def.key, value);
    }
    if (def.exclusiveWith && filterValue(filters, def.exclusiveWith) !== undefined) {
      const other = defs.find((row) => row.key === def.exclusiveWith);
      onFilterChange(def.exclusiveWith, clearedValue(other ?? def));
    }
    // A multi keeps its drill-down open — the whole point is picking more than one, and
    // bouncing back to the filter list after each would make that four taps a value.
    if (!def.multi) openPanel(null);
  };

  /** One token off — a patch, because Received is three fields and an inversion goes
   *  with the filter it inverted. Same rule as the bar, same helper. */
  const remove = (def: FilterDef) => onFilterPatch(clearPatch(def, filters));

  // ── one filter's values ───────────────────────────────────────────────────
  if (panelDef) {
    const current = filterValue(filters, panelDef.key);
    const range = current && isRangeValue(current) ? rangeFromValue(current) : {};
    return (
      <Drawer open={open} onClose={close} title={panelDef.label}>
        <div className="flex flex-col h-full">
          <Button
            variant="ghost"
            onClick={() => openPanel(null)}
            className="flex gap-1.5 justify-start items-center px-4 h-11 rounded-none border-b shrink-0 border-border/60 text-[13.5px] text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            All filters
          </Button>
          {panelDef.negatable && (
            <div className="flex gap-3 justify-between items-center px-4 py-2.5 border-b shrink-0 border-border/60">
              <span className="text-[13px] text-muted-foreground">Match or exclude</span>
              <NegateSwitch
                size="touch"
                negated={isNegated(filters, panelDef.key)}
                onChange={(negated) =>
                  onFilterChange('negate', withNegation(filters, panelDef.key, negated))
                }
              />
            </div>
          )}
          {panelDef.help && (
            <p className="px-4 py-2.5 border-b text-[12px] leading-relaxed text-muted-foreground bg-muted/50 border-border/60 shrink-0">
              {panelDef.help}
            </p>
          )}
          {panelDef.multi && (
            <p className="px-4 py-2 border-b text-[12px] text-muted-foreground border-border/60 shrink-0">
              Pick as many as you like — the list matches any of them.
            </p>
          )}
          {panelSearchable && (
            <div className="px-4 py-2 border-b border-border/60 shrink-0">
              <div className="flex gap-2 items-center px-2.5 rounded-md border bg-input border-border focus-within:border-primary">
                <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={optionQuery}
                  onChange={(event) => setOptionQuery(event.target.value)}
                  placeholder={`Search ${panelDef.label.toLowerCase()}…`}
                  aria-label={`Search ${panelDef.label}`}
                  className="py-2 w-full bg-transparent outline-none text-[14px] placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {panelSearchable && panelOptions.length === 0 && (
              <p className="px-4 py-4 text-[13px] text-center text-muted-foreground">
                No address matches “{optionQuery.trim()}”.
              </p>
            )}
            {panelOptions.map((option) => {
              const on = optionSelected(panelDef, current, option.value);
              return (
                <Button
                  key={option.value}
                  variant="ghost"
                  onClick={() => pick(panelDef, option.value)}
                  className={`${ROW} ${on ? 'bg-accent/50' : ''}`}
                >
                  {option.dot && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: option.dot }}
                    />
                  )}
                  <span className={`flex-1 text-[14.5px] truncate ${on ? 'font-semibold' : ''}`}>
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                  {on && <Check className="w-4 h-4 text-primary shrink-0" />}
                </Button>
              );
            })}
            {panelDef.kind === 'date' && (
              <>
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                  Or an exact range
                </div>
                <DateRangeFields
                  size="touch"
                  from={range.from}
                  to={range.to}
                  onChange={(next) =>
                    onFilterPatch({ ageRange: 'all', receivedFrom: next.from, receivedTo: next.to })
                  }
                />
              </>
            )}
          </div>
        </div>
      </Drawer>
    );
  }

  // ── the filter list ───────────────────────────────────────────────────────
  const searching = query.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Filters"
      footer={
        <Button onClick={close} className="w-full h-12 text-[15px] font-semibold">
          Show {resultCount} {resultCount === 1 ? 'message' : 'messages'}
        </Button>
      }
    >
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b shrink-0 border-border">
          <div className="flex gap-2 items-center px-3 h-10 rounded-lg bg-muted">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a filter"
              aria-label="Find a filter"
              className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted-foreground/70"
            />
          </div>
        </div>

        {tokens.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b shrink-0 border-border/70">
            {tokens.map((token) => (
              <FilterToken
                key={token.def.key}
                token={token}
                alwaysShowRemove
                onEdit={() =>
                  (token.def.kind === 'select' || token.def.kind === 'date') &&
                  openPanel(token.def.key)
                }
                onRemove={() => remove(token.def)}
              />
            ))}
            <Button
              variant="ghost"
              onClick={onClearAll}
              className="px-2 h-7 text-[12px] text-muted-foreground"
            >
              Clear all
            </Button>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {searching
            ? suggestions.map((suggestion, index) => {
                if (suggestion.kind === 'free') {
                  return (
                    <Button
                      key="free"
                      variant="ghost"
                      onClick={() => {
                        onCommitSearch(suggestion.query);
                        setQuery('');
                        close();
                      }}
                      className={ROW}
                    >
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 text-[14px] truncate">
                        Search messages for <b className="font-semibold">{suggestion.query}</b>
                      </span>
                    </Button>
                  );
                }
                if (suggestion.kind === 'value') {
                  return (
                    <Button
                      key={`${suggestion.def.key}:${suggestion.option.value}`}
                      variant="ghost"
                      onClick={() => {
                        pick(suggestion.def, suggestion.option.value);
                        setQuery('');
                      }}
                      className={ROW}
                    >
                      <span className="text-[12.5px] text-muted-foreground shrink-0">
                        {suggestion.def.label.toLowerCase()}
                      </span>
                      <span className="text-[14.5px] font-semibold truncate">
                        {suggestion.option.label}
                      </span>
                    </Button>
                  );
                }
                return (
                  <Button
                    key={`${suggestion.def.key}-${index}`}
                    variant="ghost"
                    onClick={() => {
                      if (suggestion.kind === 'flag') {
                        onFilterChange(suggestion.def.key, true);
                        setQuery('');
                        return;
                      }
                      openPanel(suggestion.def.key);
                      setQuery('');
                    }}
                    className={ROW}
                  >
                    <span className="text-[14.5px]">{suggestion.def.label}</span>
                  </Button>
                );
              })
            : GROUP_ORDER.map((group) => {
                const inGroup = usable.filter((def) => def.group === group && def.kind !== 'free');
                if (inGroup.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                      {group}
                    </div>
                    {inGroup.map((def) => {
                      const value = filterValue(filters, def.key);
                      const on = value !== undefined;
                      if (def.kind === 'flag') {
                        return (
                          <Button
                            key={def.key}
                            variant="ghost"
                            onClick={() => onFilterChange(def.key, !on)}
                            className={`${ROW} justify-between`}
                          >
                            <span
                              className={`text-[14.5px] ${
                                def.tone === 'red'
                                  ? 'text-red-600 dark:text-red-400'
                                  : def.tone === 'amber'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : ''
                              }`}
                            >
                              {def.label}
                            </span>
                            <span
                              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <span
                                className={`block w-5 h-5 rounded-full shadow transition-transform bg-background ${on ? 'translate-x-4' : ''}`}
                              />
                            </span>
                          </Button>
                        );
                      }
                      return (
                        <Button
                          key={def.key}
                          variant="ghost"
                          onClick={() => openPanel(def.key)}
                          className={`${ROW} justify-between`}
                        >
                          <span className="text-[14.5px] shrink-0">{def.label}</span>
                          <span className="flex gap-1.5 items-center min-w-0">
                            <span
                              className={`truncate text-[13px] ${on ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                            >
                              {on && value ? tokenText(def, value, filters) : 'All'}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                );
              })}
        </div>
      </div>
    </Drawer>
  );
};
