import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/logger';
import { fetchTicketViewCounts, ticketService } from '@/services/ticket.service';
import { ticketSavedViewsService } from '@/services/ticketSavedViews.service';
import { ticketApiFilters } from './ticketFilters';
import {
  BUILT_IN_TICKET_VIEWS,
  filtersOfView,
  type TicketView,
  type TicketViewFilters,
} from './ticketViews';

/**
 * The tickets list's views — the built-ins, then the agent's own from the server — and how many
 * tickets each holds, re-counted whenever `refreshKey` changes: the page bumps it on a realtime
 * ticket event or a change it made itself.
 *
 * All views are counted in ONE request (`POST /api/tickets/counts`), and only once the saved views
 * have arrived. Counting the built-ins first and every view again when the saved ones landed (they
 * took ~0.7 s, past the debounce) was 12 requests per page open on a 25,000-ticket workspace
 * (staging, 2026-10-29), and the slow ones waited 4–5 s in the queue they made. A backend without
 * the route gets one metadata request per view, as before.
 */
const COUNTS_DEBOUNCE_MS = 600;

export const useTicketViews = (currentUserId: number | null, refreshKey: number | string) => {
  const [saved, setSaved] = useState<TicketView[]>([]);
  // Settled = answered or failed; a failed list still leaves the built-ins to count.
  const [savedSettled, setSavedSettled] = useState(false);
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    let live = true;
    ticketSavedViewsService
      .list()
      .then((rows) => {
        if (live)
          setSaved(rows.map((row) => ({ id: row.id, name: row.name, filters: row.filters })));
      })
      .catch((error) => logger.error('Failed to load saved ticket views:', error))
      .finally(() => {
        if (live) setSavedSettled(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const views = useMemo(() => [...BUILT_IN_TICKET_VIEWS, ...saved], [saved]);

  useEffect(() => {
    if (!savedSettled) return undefined;
    let live = true;
    // A burst of realtime events (an import, a bulk change) refreshes the counts once, not once per
    // event: every refresh is a request for every agent with the list open.
    const timer = setTimeout(() => {
      const asked = views.map((view) => ({
        id: view.name,
        filters: ticketApiFilters(filtersOfView(view.filters), currentUserId),
      }));
      fetchTicketViewCounts(asked)
        .then((answer) => {
          if (!live) return;
          if (answer) {
            setCounts((prev) => {
              const next = { ...prev };
              for (const view of asked) {
                const total = answer[view.id];
                if (typeof total === 'number') next[view.id] = total;
              }
              return next;
            });
            return;
          }
          asked.forEach((view) => {
            ticketService
              .getMetadata(view.filters, 1)
              .then((response) => {
                if (live && response.success) {
                  setCounts((prev) => ({ ...prev, [view.id]: response.data.total }));
                }
              })
              .catch((error) => logger.error(`Failed to count the "${view.id}" view:`, error));
          });
        })
        .catch((error) => logger.error('Failed to count the ticket views:', error));
    }, COUNTS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [views, savedSettled, currentUserId, refreshKey]);

  const saveView = useCallback(async (name: string, filters: TicketViewFilters) => {
    const row = await ticketSavedViewsService.save(name, filters);
    // The server replaces a view with the same name, so the list does too.
    setSaved((prev) => [
      ...prev.filter((view) => view.name !== row.name),
      { id: row.id, name: row.name, filters: row.filters },
    ]);
  }, []);

  const deleteView = useCallback(async (view: TicketView) => {
    if (view.id === undefined) return;
    await ticketSavedViewsService.remove(view.id);
    setSaved((prev) => prev.filter((other) => other.id !== view.id));
  }, []);

  return { views, counts, saveView, deleteView };
};
