import { useEffect, useMemo, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { DataTableProps } from './dataTable.types';

/**
 * Config-driven list table — the shared foundation for the console/user/workspace
 * surfaces (see SHARED-TABLE-REFACTOR-PLAN). Owns the toolbar (optional filter slot +
 * search), the row grid, client|server search + pagination, and the empty/error states,
 * so pages no longer re-roll a `<table>` + `.slice`/clamp + search each time.
 *
 * The page still owns data-fetching and passes either the full list (`pagination.mode:
 * 'client'` — the table slices) or the current page + meta (`'server'`). By default mobile
 * scrolls the table horizontally; pass `renderCard` to render a mobile card list below `xl`
 * instead (the customer UsersPage's responsive layout).
 */
export function DataTable<Row>({
  rows,
  rowKey,
  columns,
  actions,
  toolbarStart,
  search,
  pagination,
  isError,
  onRetry,
  empty,
  className,
  actionsLabel = 'Actions',
  renderEditRow,
  renderCard,
  resetPageKey,
}: DataTableProps<Row>) {
  const [clientPage, setClientPage] = useState(1);
  const isClient = pagination.mode === 'client';
  const clientFilterActive = Boolean(search?.clientAccessor);
  const term = (search?.value ?? '').trim().toLowerCase();
  const columnCount = columns.length + (actions ? 1 : 0);

  // Client-side filtering (only when a clientAccessor is provided; server search leaves
  // `rows` as the already-filtered page).
  const filtered = useMemo(() => {
    if (!search?.clientAccessor || !term) {
      return rows;
    }
    const accessor = search.clientAccessor;
    return rows.filter((row) => accessor(row).some((field) => (field ?? '').toLowerCase().includes(term)));
  }, [rows, search, term]);

  // Reset to page 1 whenever a client-side search term changes so results are never
  // stranded on an out-of-range page. Server callers reset their own page in onChange.
  useEffect(() => {
    if (isClient && clientFilterActive) {
      setClientPage(1);
    }
  }, [term, isClient, clientFilterActive]);

  // Reset to page 1 when an EXTERNAL filter changes (the page narrows `rows` before passing
  // them in, so the table can't see that filter the way it sees its own search term).
  useEffect(() => {
    if (isClient) {
      setClientPage(1);
    }
  }, [resetPageKey, isClient]);

  const pageSize = isClient ? pagination.pageSize : pagination.limit;
  const totalItems = isClient ? filtered.length : pagination.total;
  const totalPages = isClient
    ? Math.max(1, Math.ceil(filtered.length / pagination.pageSize))
    : pagination.totalPages;
  const currentPage = isClient ? Math.min(clientPage, totalPages) : pagination.page;
  const handlePageChange = isClient ? setClientPage : pagination.onPageChange;

  // Client mode: the table slices. Server mode: `rows` is already the current page.
  const pageRows = isClient
    ? filtered.slice((currentPage - 1) * pagination.pageSize, currentPage * pagination.pageSize)
    : filtered;

  const isFilteredEmpty = totalItems === 0 && term.length > 0;
  const EmptyIcon = empty?.icon;
  const hasToolbar = toolbarStart !== undefined || search !== undefined;

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {hasToolbar && (
        <div className="flex flex-col flex-shrink-0 gap-3 px-4 py-3 border-b sm:flex-row sm:justify-between sm:items-center border-border">
          <div className="flex flex-wrap gap-3 items-center">{toolbarStart}</div>
          {search && (
            <SearchInput
              value={search.value}
              onChange={search.onChange}
              onSearch={search.onCommit}
              onBlur={search.onBlur}
              showSearchButton={search.showButton}
              placeholder={search.placeholder}
              className="w-full sm:w-auto sm:min-w-[280px]"
            />
          )}
        </div>
      )}

      {isError ? (
        <div className="p-4">
          <Alert variant="danger">
            <div className="flex gap-3 justify-between items-center">
              <span>Couldn&apos;t load this list.</span>
              {onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          </Alert>
        </div>
      ) : totalItems === 0 ? (
        <div className="flex flex-1 justify-center items-center px-4 py-10 min-h-0 text-center">
          <div className="flex flex-col gap-2 items-center text-muted-foreground">
            {EmptyIcon && !isFilteredEmpty && <EmptyIcon className="w-8 h-8 opacity-60" />}
            <p className="text-sm">
              {isFilteredEmpty
                ? (empty?.filteredMessage ?? 'No results match your search.')
                : (empty?.message ?? 'Nothing here yet.')}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-auto flex-1 min-h-0">
          {renderCard && (
            <div className="divide-y xl:hidden divide-border">
              {pageRows.map((row) => (
                <div key={rowKey(row)}>{renderCard(row)}</div>
              ))}
            </div>
          )}
          <table className={cn('w-full text-sm', renderCard && 'hidden xl:table')}>
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      'px-3 py-2 font-medium',
                      col.align === 'right' && 'text-right',
                      col.headerClassName
                    )}
                  >
                    {col.header}
                  </th>
                ))}
                {actions && (
                  <th className="px-3 py-2 font-medium text-right">
                    <span className="sr-only">{actionsLabel}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const editNode = renderEditRow?.(row);
                if (editNode !== undefined && editNode !== null && editNode !== false) {
                  // Inline edit: this row becomes one full-width cell holding the edit form.
                  return (
                    <tr key={rowKey(row)} className="border-t border-border bg-primary/5">
                      <td colSpan={columnCount} className="px-3 py-2">
                        {editNode}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={rowKey(row)} className="border-t border-border align-top">
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn('px-3 py-2', col.align === 'right' && 'text-right', col.cellClassName)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end">{actions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && !isError && (
        <div className="flex-shrink-0">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            total={totalItems}
            limit={pageSize}
            onPageChange={handlePageChange}
            loading={isClient ? undefined : pagination.loading}
          />
        </div>
      )}
    </div>
  );
}
