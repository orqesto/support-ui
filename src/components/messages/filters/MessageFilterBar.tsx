import { SlidersHorizontal, Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { FilterSheet } from './FilterSheet';
import { FilterToken } from './FilterToken';
import { FilterTokenBar } from './FilterTokenBar';
import { buildFilterDefs, visibleDefs } from './filterSchema';
import { clearedValue, tokensOf } from './filterTokens';
import { useFilterOptions } from './useFilterOptions';
import {
  BUILT_IN_VIEWS,
  loadSavedViews,
  persistSavedViews,
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
  onCommitSearch,
  onClearFilters,
}: {
  filters: FilterState;
  pagination: { page: number; limit: number; total: number };
  activeFilterCount: number;
  clearableFilterCount?: number;
  isKanban?: boolean;
  onFilterChange: (key: string, value: string | boolean) => void;
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

  const views = useMemo(() => [...BUILT_IN_VIEWS, ...userViews], [userViews]);
  const activeKeys = useMemo(() => tokens.map((token) => token.def.key), [tokens]);

  /**
   * Applying a view REPLACES the filter state rather than merging into it — a view is
   * "show me this", not "and also this". Cleared explicitly key by key, because the
   * page's clearFilters is async and racing it would leave whichever write lost.
   */
  const applyView = useCallback(
    (view: SavedView) => {
      for (const def of visibleDefs(defs, isKanban)) {
        const wanted = (view.filters as Record<string, unknown>)[def.key];
        if (wanted === undefined) {
          if (activeKeys.includes(def.key)) onFilterChange(def.key, clearedValue(def));
        } else {
          onFilterChange(def.key, wanted as string | boolean);
        }
      }
    },
    [defs, isKanban, activeKeys, onFilterChange]
  );

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const snapshot: Partial<FilterState> = {};
    for (const token of tokens) {
      (snapshot as Record<string, unknown>)[token.def.key] = (
        filters as Record<string, unknown>
      )[token.def.key];
    }
    const next = [...userViews.filter((view) => view.name !== name), { name, filters: snapshot }];
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
  const countLabel = activeFilterCount
    ? `${total} matching · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}`
    : `${total} messages · no filters`;

  return (
    <Card>
      <CardContent className="p-3 space-y-2.5 sm:p-4">
        {/* ── saved views ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {views.map((view) => {
            const on = viewIsActive(view, filters, activeKeys);
            return (
              <span key={view.name} className="inline-flex relative items-center group/view">
                <Button
                  variant="ghost"
                  onClick={() => applyView(view)}
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
                  onRemove={() => onFilterChange(token.def.key, clearedValue(token.def))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── count + actions ─────────────────────────────────────────── */}
        <div className="flex gap-3 justify-between items-center">
          <span className="text-[12.5px] text-muted-foreground tabular-nums">{countLabel}</span>
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
        onCommitSearch={onCommitSearch}
        onClearAll={onClearFilters}
      />
    </Card>
  );
};
