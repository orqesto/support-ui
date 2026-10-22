import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/logger';
import { ticketService } from '@/services/ticket.service';
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
 * tickets each holds. One metadata request per view (counts only, no rows), re-run whenever
 * `refreshKey` changes: the page bumps it on a realtime ticket event or a change it made itself.
 */
const COUNTS_DEBOUNCE_MS = 600;

export const useTicketViews = (currentUserId: number | null, refreshKey: number | string) => {
  const [saved, setSaved] = useState<TicketView[]>([]);
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    let live = true;
    ticketSavedViewsService
      .list()
      .then((rows) => {
        if (live)
          setSaved(rows.map((row) => ({ id: row.id, name: row.name, filters: row.filters })));
      })
      .catch((error) => logger.error('Failed to load saved ticket views:', error));
    return () => {
      live = false;
    };
  }, []);

  const views = useMemo(() => [...BUILT_IN_TICKET_VIEWS, ...saved], [saved]);

  useEffect(() => {
    let live = true;
    // A burst of realtime events (an import, a bulk change) refreshes the counts once, not once per
    // event: every refresh is one request per view, for every agent with the list open.
    const timer = setTimeout(() => {
      views.forEach((view) => {
        const filters = ticketApiFilters(filtersOfView(view.filters), currentUserId);
        ticketService
          .getMetadata(filters, 1)
          .then((response) => {
            if (live && response.success) {
              setCounts((prev) => ({ ...prev, [view.name]: response.data.total }));
            }
          })
          .catch((error) => logger.error(`Failed to count the "${view.name}" view:`, error));
      });
    }, COUNTS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [views, currentUserId, refreshKey]);

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
