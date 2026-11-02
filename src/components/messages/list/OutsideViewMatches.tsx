import { useEffect, useMemo, useState } from 'react';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { scopeReasonJump } from '@/components/messages/ListScopeNotice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Typography } from '@/components/ui/Typography';
import { threadApiFilters } from '@/hooks/threadApiFilters';
import { messageService, type ListScope, type MessageThread } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';

type Place = keyof ListScope['hiddenBecause'];

/** What each "Not shown" bucket is called where an agent reads it as a place. */
const PLACE_TITLE: Record<Place, string> = {
  terminal: 'Resolved or closed',
  knowledgeBase: 'Knowledge base',
  awaitingOrReplied: 'Waiting on a reply',
  needsRouting: 'Awaiting routing',
  spam: 'Spam',
  suspicious: 'Suspicious',
  notAnalysed: 'Not yet reviewed',
  archived: 'Auto-archived',
  orphanOutgoing: 'Outbound echoes',
  other: 'Hidden by this view',
};

const PAGE = 25;

/**
 * A searched list's matches that its view does not show, grouped by where they are, each group
 * with a way to go there (search kept). A customer's workspace, 2026-11-02: an address searched
 * under Needs us showed nothing while all 10 matches sat in Resolved and the knowledge base, and
 * agents read the empty list as "not in Odly".
 *
 * Rows come from the backend's `outsideView` (the scope count's hidden set, listed, each with the
 * bucket that names it). ⛔ A backend without that option ignores it and answers the VIEW's own
 * rows; those carry no `foundIn`, and are not shown — never listed twice as "elsewhere".
 */
export const OutsideViewMatches = ({
  filters,
  onJump,
  onOpen,
  highlightTerms,
}: {
  filters: FilterState;
  onJump: (filters: Partial<FilterState>, needsListView?: boolean) => void;
  onOpen: (thread: MessageThread) => void;
  highlightTerms?: string[];
}) => {
  const search = filters.search?.trim() ?? '';
  const request = useMemo(
    () => (search ? { ...threadApiFilters(filters, false), outsideView: '1' } : null),
    [filters, search]
  );
  const requestKey = request ? JSON.stringify(request) : '';
  const [rows, setRows] = useState<MessageThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setRows([]);
    setTotal(0);
    setPage(1);
    if (!request) return undefined;
    let current = true;
    void messageService
      .getThreads(request, 1, PAGE)
      .then((answer) => {
        if (!current || !answer.success) return;
        const listed = (answer.data ?? []) as MessageThread[];
        // Older backend: the view's own rows came back — say nothing rather than repeat them.
        if (listed.some((thread) => !thread.foundIn)) return;
        setRows(listed);
        setTotal(answer.pagination?.total ?? listed.length);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
    // requestKey stands for `request`: a new object with the same content must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const loadMore = async () => {
    if (!request) return;
    setLoadingMore(true);
    try {
      const answer = await messageService.getThreads(request, page + 1, PAGE);
      const listed = (answer.data ?? []) as MessageThread[];
      if (answer.success && listed.every((thread) => thread.foundIn)) {
        setRows((shown) => [...shown, ...listed]);
        setPage(page + 1);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  if (!search || rows.length === 0) return null;

  // Groups in the order their first match arrived (the list's own order: best match, newest).
  const groups = new Map<Place, MessageThread[]>();
  for (const thread of rows) {
    const place = thread.foundIn as Place;
    groups.set(place, [...(groups.get(place) ?? []), thread]);
  }

  return (
    <section aria-label="Also found in other views" className="mt-4">
      <div className="flex gap-2 items-baseline px-1 mb-2">
        <Typography variant="label">Also found in other views</Typography>
        <Typography variant="caption" color="muted" className="font-mono">
          {total.toLocaleString()}
        </Typography>
      </div>
      <Card padding="none" className="overflow-hidden">
        {[...groups].map(([place, threads]) => {
          const jump = scopeReasonJump(place);
          return (
            <div key={place} className="border-t first:border-t-0 border-border">
              <div className="flex gap-2.5 items-center px-4 h-[34px] bg-raised">
                <h3 className="text-[12.5px] font-semibold">
                  <Typography variant="body3" weight="semibold">
                    {PLACE_TITLE[place]}
                  </Typography>{' '}
                  <Typography variant="caption" color="muted" className="font-mono">
                    {threads.length}
                  </Typography>
                </h3>
                {jump && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7"
                    aria-label={`Show in ${PLACE_TITLE[place]}`}
                    onClick={() => onJump({ ...jump.filters, search }, jump.needsListView)}
                  >
                    Show in that view
                  </Button>
                )}
              </div>
              {threads.map((thread) => (
                <MessageListItem
                  key={thread.threadId}
                  thread={thread}
                  density="compact"
                  onOpen={onOpen}
                  highlightTerms={highlightTerms}
                />
              ))}
            </div>
          );
        })}
      </Card>
      {rows.length < total && (
        <div className="flex justify-center mt-2">
          <Button
            variant="outline"
            size="sm"
            isLoading={loadingMore}
            onClick={() => void loadMore()}
          >
            Show more ({(total - rows.length).toLocaleString()})
          </Button>
        </div>
      )}
    </section>
  );
};
