import { SlidersHorizontal, Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { FilterSheet } from './FilterSheet';
import { FilterToken } from './FilterToken';
import { FilterTokenBar } from './FilterTokenBar';
import { RECEIVED_KEYS, buildFilterDefs } from './filterSchema';
import { clearPatch, tokensOf } from './filterTokens';
import { useFilterOptions } from './useFilterOptions';
import {
  BUILT_IN_VIEWS,
  loadSavedViews,
  persistSavedViews,
  viewAppliesTo,
  viewIsActive,
  type SavedView,
} from './savedViews';
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
}) => {
  const dynamic = useFilterOptions();
  const defs = useMemo(() => buildFilterDefs(dynamic), [dynamic]);
  const tokens = useMemo(() => tokensOf(defs, filters, isKanban), [defs, filters, isKanban]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [userViews, setUserViews] = useState<SavedView[]>(() => loadSavedViews());
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
      const keys: string[] =
        token.def.kind === 'date' ? [...RECEIVED_KEYS] : [token.def.key];
      if (token.def.sub) keys.push(token.def.sub.key);
      for (const key of keys) snapshot[key] = (filters as Record<string, unknown>)[key];
    }
    // Only the inversions this view actually carries. Copying the whole `negate` CSV
    // would smuggle in an inversion for a filter the view does not set, and it would
    // apply the moment someone set that filter.
    const negated = tokens.filter((token) => token.negated).map((token) => token.def.key);
    if (negated.length > 0) snapshot.negate = negated.join(',');
    const next = [
      ...userViews.filter((view) => view.name !== name),
      { name, filters: snapshot as Partial<FilterState> },
    ];
    setUserViews(next);
    persistSavedViews(next);
    setNamingView(false);
    setViewName('');
  };

  const removeView = (name: string) => {
    const next = userViews.filter((view) => view.name !== name);
    setUserViews(next);
    persistSavedViews(next);
  };

  const { total } = pagination;
  // The range, not a match count: it answers "where am I in this list", which a count
  // cannot, and deep paging is exactly when that matters.
  const rangeStart = (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(pagination.page * pagination.limit, total);

  return (
    <Card>
      <CardContent className="p-3 space-y-2.5 sm:p-4">
        {/* ── saved views ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {views.map((view) => {
            const on = viewIsActive(view, filters);
            return (
              <span key={view.name} className="inline-flex relative items-center group/view">
                <Button
                  variant="ghost"
                  aria-pressed={on}
                  // A lit pill toggles OFF. `viewIsActive` is an exact match, so when it
                  // is lit the active filters ARE the view — clearing everything and
                  // clearing "just the view" are the same set.
                  onClick={() => (on ? unapplyView(view) : applyView(view))}
                  className={`h-7 px-2.5 rounded-full border text-[12.5px] ${
                    on
                      ? 'bg-primary border-primary text-primary-foreground font-semibold'
                      : 'border-border text-muted-foreground font-medium hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {view.name}
                </Button>
                {!view.builtIn && (
                  <Button
                    variant="ghost"
                    onClick={() => removeView(view.name)}
                    aria-label={`Delete view ${view.name}`}
                    className="grid absolute -top-1 -right-1 place-items-center p-0 w-4 h-4 rounded-full opacity-0 transition-opacity bg-muted text-muted-foreground group-hover/view:opacity-100 hover:text-red-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                )}
              </span>
            );
          })}
          <span className="text-[11.5px] text-muted-foreground/70">saved views</span>
        </div>

        {/* ── desktop: the token bar ──────────────────────────────────── */}
        <div className="hidden md:block">
          <FilterTokenBar
            defs={defs}
            filters={filters}
            isKanban={isKanban}
            onFilterChange={onFilterChange}
            onFilterPatch={onFilterPatch}
            onCommitSearch={onCommitSearch}
          />
        </div>

        {/* ── mobile: a search pill, a filter button, a token strip ───── */}
        <div className="md:hidden space-y-2">
          <div className="flex gap-2 items-center">
            <Button
              variant="ghost"
              onClick={() => setSheetOpen(true)}
              className="flex flex-1 gap-2 justify-start items-center px-2.5 h-9 rounded-lg bg-muted"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-[13.5px] text-muted-foreground/70">Search messages</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSheetOpen(true)}
              aria-label="Filters"
              className="grid relative place-items-center p-0 w-9 h-9 rounded-md border shrink-0 border-input"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="grid absolute -top-1 -right-1 place-items-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
          {tokens.length > 0 && (
            <div className="flex overflow-x-auto gap-1.5 pb-0.5">
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

        {/* ── count + actions ─────────────────────────────────────────── */}
        <div className="flex gap-3 justify-between items-center">
          <span className="text-[12.5px] text-muted-foreground tabular-nums">
            {total > 0 ? (
              <>
                <b className="font-semibold text-foreground/70">
                  {rangeStart}–{rangeEnd}
                </b>{' '}
                of {total}
              </>
            ) : (
              'No messages'
            )}
          </span>
          <div className="flex gap-2 items-center">
            {namingView ? (
              <span className="flex gap-1 items-center">
                <input
                  autoFocus
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveCurrentView();
                    if (event.key === 'Escape') setNamingView(false);
                  }}
                  placeholder="View name"
                  aria-label="Name this view"
                  className="px-2 h-8 rounded-md border outline-none w-[130px] text-[13px] bg-input border-border"
                />
                <Button onClick={saveCurrentView} className="h-8 px-2.5 text-[13px]">
                  Save
                </Button>
              </span>
            ) : (
              activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setNamingView(true)}
                  className="h-8 px-2.5 rounded-md border text-[13px] border-input hover:bg-accent"
                >
                  Save as view
                </Button>
              )
            )}
            {clearableFilterCount > 0 && (
              <Button
                variant="ghost"
                onClick={onClearFilters}
                className="h-8 px-2.5 rounded-md text-[13px] text-muted-foreground hover:bg-accent hover:text-red-600 dark:hover:text-red-400"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>
      </CardContent>

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
    </Card>
  );
};
