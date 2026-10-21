import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { logger } from '@/lib/logger';
import { withPendingDecision } from '@/lib/kbDecisionLookup';
import { kbService, type KBEntry } from '@/services/kb.service';

/** The alert for a `?id=` that names no readable entry. */
export const KB_ENTRY_NOT_FOUND_ALERT = {
  open: true,
  title: 'Entry Not Found',
  description: 'Could not find the requested knowledge base entry.',
  variant: 'error',
} as const;

/**
 * The Knowledge Base `?id=` deep link (e.g. /knowledge-base?id=123): keeps the open entry in the
 * URL for sharing and refresh, like Messages and Tickets. A reviewer's entry comes with the
 * decision waiting on it (looked up in the list, which the detail route does not send), so every
 * deep link can decide. An id that cannot be read is dropped from the URL.
 */
export const useKbEntryParam = ({
  selectedEntry,
  setSelectedEntry,
  canReview,
  entries,
  filterStatus,
  onNotFound,
}: {
  selectedEntry: KBEntry | null;
  setSelectedEntry: (entry: KBEntry) => void;
  canReview: boolean;
  entries: KBEntry[];
  filterStatus: KbFilterStatus;
  onNotFound: () => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam) return;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) return;
    if (selectedEntry?.id === id) return; // already showing this entry — don't re-fetch
    void kbService
      .getById(id)
      .then(async (response: { data: KBEntry }) => {
        const listed = entries.find((row) => row.id === id);
        setSelectedEntry(
          canReview ? await withPendingDecision(response.data, listed, filterStatus) : response.data
        );
      })
      .catch((error: Error) => {
        logger.error('Failed to fetch KB entry:', error);
        onNotFound();
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        // setSearchParams strips location.hash — go through navigate to keep the tab hash.
        navigate({ search: params.toString(), hash: location.hash }, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
};
