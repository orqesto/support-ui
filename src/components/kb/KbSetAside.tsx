import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import {
  KB_SET_ASIDE_REASONS,
  type KbSetAsideItem,
  type KbSetAsideReason,
} from '@/services/kbConsolidation.service';
import { KbWorkRows, SET_ASIDE_REASON_LABEL, type KbWorkNotice } from './KbWorkRows';

export const SET_ASIDE_PAGE_SIZE = 25;

/**
 * The entries the report set aside — in no case — one row each with its reason, filterable by
 * reason and paged (a big workspace has hundreds). Rows are read only for the page on screen.
 */
export const KbSetAside = ({
  items,
  departmentIds,
  notice,
  onListNotice,
  onChanged,
  onNotice,
  searchActive = false,
}: {
  items: KbSetAsideItem[];
  /** The departments the report covers (where Move into case searches). */
  departmentIds: number[];
  /** Its line about the last move / removal — held by the report view, which clears it. */
  notice: KbWorkNotice | null;
  onListNotice: (notice: KbWorkNotice | null) => void;
  /** A search narrows the cases only (BE): this list is all of them, and says so. */
  searchActive?: boolean;
  onChanged: () => void | Promise<unknown>;
  onNotice: (notice: KbWorkNotice | null) => void;
}) => {
  const [reason, setReason] = useState<'all' | KbSetAsideReason>('all');
  const [page, setPage] = useState(1);
  // The line about the last move / removal lives HERE: the list below unmounts when its last row
  // leaves, and the line must outlive it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const counts = useMemo(() => {
    const byReason = new Map<KbSetAsideReason, number>();
    for (const item of items) byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
    return byReason;
  }, [items]);
  const reasons = useMemo(
    () => new Map(items.map((item) => [item.entryId, item.reason] as const)),
    [items]
  );
  const filtered = reason === 'all' ? items : items.filter((item) => item.reason === reason);
  const totalPages = Math.max(1, Math.ceil(filtered.length / SET_ASIDE_PAGE_SIZE));
  // A re-read can shrink the list under the page the viewer is on.
  const currentPage = Math.min(page, totalPages);
  const pageIds = filtered
    .slice((currentPage - 1) * SET_ASIDE_PAGE_SIZE, currentPage * SET_ASIDE_PAGE_SIZE)
    .map((item) => item.entryId);
  const rawEmails = counts.get('raw_email') ?? 0;
  // The list emptied under the viewer (its last row moved or was decided): focus, lost with the
  // row, goes to this section's heading.
  const hadRows = useRef(pageIds.length > 0);
  useEffect(() => {
    const had = hadRows.current;
    hadRows.current = pageIds.length > 0;
    if (!had || pageIds.length > 0) return;
    const active = document.activeElement;
    if (!active || active === document.body || !document.body.contains(active))
      headingRef.current?.focus();
  }, [pageIds.length]);
  // Pagination sends the WINDOW to the top on a page change (right for a page-long list); this
  // list sits below the cases, so bring its own heading back into view after that.
  const sectionRef = useRef<HTMLElement>(null);
  const changePage = (next: number) => {
    setPage(next);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => sectionRef.current?.scrollIntoView?.({ block: 'start' }))
    );
  };

  return (
    <section ref={sectionRef} aria-label="Entries not in any case">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-3 justify-between items-end">
            <div>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display font-semibold outline-none"
              >
                Not in any case ({items.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Learned entries in no case, each with the reason it was set aside.
                {searchActive && ' The search narrows the cases only, not this list.'}
              </p>
            </div>
            <div>
              <Label htmlFor="set-aside-reason">Reason</Label>
              <Select
                id="set-aside-reason"
                value={reason}
                options={[
                  { value: 'all', label: `All reasons (${items.length})` },
                  ...[...KB_SET_ASIDE_REASONS, 'other' as const]
                    .filter((key) => (counts.get(key) ?? 0) > 0 || key === reason)
                    .map((key) => ({
                      value: key,
                      label: `${SET_ASIDE_REASON_LABEL[key]} (${counts.get(key) ?? 0})`,
                    })),
                ]}
                onChange={(value) => {
                  setReason(value as 'all' | KbSetAsideReason);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {rawEmails > 0 && (reason === 'all' || reason === 'raw_email') && (
            <p className="text-xs text-muted-foreground">
              Until hidden, a raw email that belongs to a real case keeps serving its old answer
              next to the merged one.
            </p>
          )}
          {notice && (
            <div role="status">
              <Alert variant={notice.variant}>{notice.text}</Alert>
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="py-4 text-sm text-center text-muted-foreground">
              {reason === 'all'
                ? 'No entry is set aside now.'
                : `No entry is set aside as “${SET_ASIDE_REASON_LABEL[reason]}” now.`}
            </p>
          ) : (
            <KbWorkRows
              ids={pageIds}
              reasons={reasons}
              departmentIds={departmentIds}
              onChanged={onChanged}
              onNotice={onNotice}
              listNotice={notice}
              onListNotice={onListNotice}
              label="Entries not in any case"
              pageSize={SET_ASIDE_PAGE_SIZE}
            />
          )}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filtered.length}
              limit={SET_ASIDE_PAGE_SIZE}
              onPageChange={changePage}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
};
