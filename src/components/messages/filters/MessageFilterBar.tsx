import { Plus, SlidersHorizontal, Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FilterSheet } from './FilterSheet';
import { FilterToken } from './FilterToken';
import { FilterTokenBar } from './FilterTokenBar';
import { SurfaceCount } from './SurfaceCount';
import { RECEIVED_KEYS, buildFilterDefs } from './filterSchema';
import { clearPatch, tokensOf } from './filterTokens';
import { useFilterOptions } from './useFilterOptions';
import { BUILT_IN_VIEWS, viewAppliesTo, viewIsActive, type SavedView } from './savedViews';
import { useSavedViews } from './useSavedViews';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The inbox filter surface — a token bar on desktop, a drawer on mobile.
 *
 * Drop-in for the old `MessageFilters` panel. It writes the same `FilterState` keys
 * through the same `onFilterChange`, so URL sync, the query layer and the store are
 * untouched; only the way you reach a filter changed.
 */
export const MessageFilterBar = ({
  filters,
  pagination,
  activeFilterCount,
  clearableFilterCount = activeFilterCount,
  isKanban = false,
  onFilterChange,
  onFilterPatch,
  onCommitSearch,
  onClearFilters,
  showCount = true,
}: {
  filters: FilterState;
  pagination: { page: number; limit: number; total: number };
  activeFilterCount: number;
  clearableFilterCount?: number;
  isKanban?: boolean;
  onFilterChange: (key: string, value: string | boolean) => void;
  /** A several-key write. Applying a view, the date range and clearing a negated filter
   *  all move more than one field, and each should be one change to the list. */
  onFilterPatch: (patch: Partial<FilterState>) => void;
  onCommitSearch: (text: string) => void;
  onClearFilters: () => void;
  /**
   * Render the surface count at the end of the views row. The Messages page passes false: in
   * list v2 the count sits in the page header beside the view switch (`SurfaceCount`).
   */
  showCount?: boolean;
}) => {
  const dynamic = useFilterOptions();
  const defs = useMemo(() => buildFilterDefs(dynamic), [dynamic]);
  const tokens = useMemo(() => tokensOf(defs, filters, isKanban), [defs, filters, isKanban]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    views: userViews,
    source: viewSource,
    error: viewError,
    saveView,
    removeView,
  } = useSavedViews();
  const [namingView, setNamingView] = useState(false);
  const [viewName, setViewName] = useState('');

  const views = useMemo(
    () => [...BUILT_IN_VIEWS, ...userViews].filter((view) => viewAppliesTo(view, isKanban)),
    [userViews, isKanban]
  );

  /**
   * A view MERGES into the current filters — it does not replace them.
   *
   * Replacing meant Mine followed by Breached silently dropped Mine, while the same two
   * filters picked from the menu combined fine. Two ways to set a filter that disagree
   * is worse than either rule on its own. Two views naming the SAME key (Mine and
   * Unassigned) still swap it, because the second write simply overwrites the first.
   *
   * Read from the VIEW, not from the schema: a select with no options is dropped from
   * the schema, and Assignee has none until its fetch returns, so driving this off
   * `defs` skipped the assignee half of Mine on first paint.
   */
  const applyView = useCallback(
    (view: SavedView) => {
      onFilterPatch(view.filters);
    },
    [onFilterPatch]
  );

  /** Clicking a lit pill removes exactly that view's filters and leaves the rest. */
  const unapplyView = useCallback(
    (view: SavedView) => {
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(view.filters)) {
        const def = defs.find((row) => row.key === key);
        if (def) {
          Object.assign(patch, clearPatch(def, filters));
        } else if ((RECEIVED_KEYS as readonly string[]).includes(key)) {
          // Not schema keys — the Received control owns all three, and a date bound
          // clears to absent rather than to the string 'all'.
          patch[key] = undefined;
        } else if (key === 'negate') {
          patch.negate = '';
        } else {
          patch[key] = 'all';
        }
      }
      onFilterPatch(patch as Partial<FilterState>);
    },
    [defs, filters, onFilterPatch]
  );

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const snapshot: Record<string, unknown> = {};
    for (const token of tokens) {
      // `received` is a control, not a field — snapshot the three it stands for. Reading
      // filters['received'] would have stored `undefined` and saved a view with a
      // Received token that does nothing.
      const keys: string[] = token.def.kind === 'date' ? [...RECEIVED_KEYS] : [token.def.key];
      if (token.def.sub) keys.push(token.def.sub.key);
      for (const key of keys) snapshot[key] = (filters as Record<string, unknown>)[key];
    }
    // Only the inversions this view actually carries. Copying the whole `negate` CSV
    // would smuggle in an inversion for a filter the view does not set, and it would
    // apply the moment someone set that filter.
    const negated = tokens.filter((token) => token.negated).map((token) => token.def.key);
    if (negated.length > 0) snapshot.negate = negated.join(',');
    void saveView(name, snapshot as Partial<FilterState>);
    setNamingView(false);
    setViewName('');
  };

  const { total } = pagination;

  /** Saved-view pills, Save as view and Clear all — shared by the desktop row and the phone. */
  const viewPills = views.map((view) => {
    const on = viewIsActive(view, filters);
    return (
      <span key={view.name} className="inline-flex relative items-center shrink-0 group/view">
        <Button
          variant="ghost"
          aria-pressed={on}
          // A lit pill toggles OFF. `viewIsActive` is an exact match, so when it
          // is lit the active filters ARE the view — clearing everything and
          // clearing "just the view" are the same set.
          onClick={() => (on ? unapplyView(view) : applyView(view))}
          className={`h-[30px] px-[11px] rounded-lg border text-[12.5px] ${
            on
              ? 'bg-primary border-primary text-primary-foreground font-semibold hover:bg-primary hover:text-primary-foreground'
              : 'bg-card border-border text-muted-foreground font-medium hover:text-foreground hover:border-border-strong'
          }`}
        >
          {view.name}
        </Button>
        {!view.builtIn && (
          <Button
            variant="ghost"
            onClick={() => void removeView(view)}
            aria-label={`Delete view ${view.name}`}
            className="grid absolute -top-1 -right-1 place-items-center p-0 w-4 h-4 rounded-full opacity-0 transition-opacity bg-muted text-muted-foreground group-hover/view:opacity-100 hover:text-destructive"
          >
            <X className="w-2.5 h-2.5" />
          </Button>
        )}
      </span>
    );
  });

  return (
    <div data-testid="message-filter-bar">
      {/* Messages list v2: the token field and the views on ONE row. The bar was a card of its
          own with the views on a row above the field; the field is the bordered element now,
          the views ride its right end and wrap under it when the column is narrow (the split
          layout). On a phone the order is search · views · tokens, each its own strip. The
          views render ONCE for both — two copies would be two sets of pills to keep in step. */}
      <div className="flex flex-wrap gap-2 items-start">
        {/* ── desktop: the token bar ── */}
        <div className="hidden md:block flex-[1_1_420px] min-w-0">
          <FilterTokenBar
            defs={defs}
            filters={filters}
            isKanban={isKanban}
            onFilterChange={onFilterChange}
            onFilterPatch={onFilterPatch}
            onCommitSearch={onCommitSearch}
          />
        </div>

        {/* ── mobile: a search pill and a filter button ── */}
        <div className="flex md:hidden gap-2 items-center w-full">
          <Button
            variant="ghost"
            onClick={() => setSheetOpen(true)}
            className="flex flex-1 gap-2 justify-start items-center px-3 h-[42px] rounded-[10px] border border-border bg-card"
          >
            <Search className="w-4 h-4 text-muted-foreground" />
            <span className="text-[14.5px] text-muted-foreground/70 truncate">
              {filters.search?.trim() ? filters.search.trim() : 'Search messages'}
            </span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSheetOpen(true)}
            aria-label="Filters"
            className="grid relative place-items-center p-0 w-[42px] h-[42px] rounded-[10px] border shrink-0 border-border bg-card"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="grid absolute -top-1 -right-1 place-items-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* ── the views, Save as view, Clear all ── */}
        <div className="flex gap-1.5 items-center max-md:overflow-x-auto max-md:w-full max-md:-mx-3 max-md:px-3 md:flex-wrap md:min-h-[40px] [scrollbar-width:none]">
          {viewPills}
          {namingView ? (
            <span className="flex gap-1 items-center shrink-0">
              <span className="w-[140px]">
                <Input
                  autoFocus
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveCurrentView();
                    if (event.key === 'Escape') setNamingView(false);
                  }}
                  placeholder="View name"
                  aria-label="Name this view"
                  className="h-[30px] text-[13px]"
                />
              </span>
              <Button onClick={saveCurrentView} className="h-[30px] px-2.5 text-[12.5px]">
                Save
              </Button>
            </span>
          ) : (
            activeFilterCount > 0 && (
              <Button
                variant="ghost"
                onClick={() => setNamingView(true)}
                className="gap-1 h-7 px-2.5 shrink-0 text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
                Save as view
              </Button>
            )
          )}
          {clearableFilterCount > 0 && (
            <Button
              variant="ghost"
              onClick={onClearFilters}
              className="h-7 px-2.5 shrink-0 text-[12.5px] text-muted-foreground hover:text-destructive"
            >
              Clear all
            </Button>
          )}
          {/* Worth saying out loud: in this mode the views are on THIS machine, and the next
              browser will not have them. It is a transient state — the window where this
              frontend is live and the endpoint is not — not a setting. */}
          {viewSource === 'local' && userViews.length > 0 && (
            <span className="shrink-0 text-[11.5px] text-muted-foreground/70">
              saved views on this device only
            </span>
          )}
          {showCount && <SurfaceCount pagination={pagination} isKanban={isKanban} />}
        </div>

        {/* ── mobile: the active filters as a strip of tokens ── */}
        {tokens.length > 0 && (
          <div className="flex md:hidden overflow-x-auto gap-1.5 pb-0.5 w-full -mx-3 px-3 [scrollbar-width:none]">
            {tokens.map((token) => (
              <FilterToken
                key={token.def.key}
                token={token}
                alwaysShowRemove
                onEdit={() => setSheetOpen(true)}
                onRemove={() => onFilterPatch(clearPatch(token.def, filters))}
              />
            ))}
          </div>
        )}
      </div>
      {viewError && <p className="mt-2 text-[12px] text-warning">{viewError}</p>}

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        defs={defs}
        filters={filters}
        isKanban={isKanban}
        resultCount={total}
        onFilterChange={onFilterChange}
        onFilterPatch={onFilterPatch}
        onCommitSearch={onCommitSearch}
        onClearAll={onClearFilters}
      />
    </div>
  );
};
