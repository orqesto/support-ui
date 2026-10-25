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
 * What a `?id=` names: the entry's public number ("KB-159", what the page shows and the search
 * finds) or, from links built before it had one or by pages that only know the row, its row id.
 */
type EntryParam = { publicId: string } | { rowId: number };

export const parseKbEntryParam = (value: string): EntryParam | null => {
  const publicMatch = /^#?kb-(\d{1,12})$/i.exec(value.trim());
  if (publicMatch) return { publicId: `KB-${Number(publicMatch[1])}` };
  return /^\d{1,12}$/.test(value.trim()) ? { rowId: Number(value) } : null;
};

/** The value a `?id=` carries for an entry: its public number when it has one. */
export const kbEntryParamValue = (entry: Pick<KBEntry, 'id' | 'publicId'>): string =>
  entry.publicId ?? String(entry.id);

const isEntry = (entry: KBEntry | null, param: EntryParam): boolean =>
  !!entry && ('rowId' in param ? entry.id === param.rowId : entry.publicId === param.publicId);

/** The row id a public number belongs to, by the list's search by number (null: none readable). */
const rowIdOf = async (publicId: string): Promise<number | null> => {
  const response = await kbService.getAll({ search: publicId, limit: 1 });
  return response.data?.idMatch?.id ?? null;
};

/**
 * The Knowledge Base `?id=` deep link (e.g. /knowledge-base?id=KB-159): keeps the open entry in
 * the URL for sharing and refresh, like Messages and Tickets. A row id (`?id=3797`, the form the
 * other pages link with) still opens the entry and is then rewritten to its public number, so the
 * address shows the number the page and the search use. A reviewer's entry comes with the
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
  setSelectedEntry: (entry: KBEntry | null) => void;
  canReview: boolean;
  entries: KBEntry[];
  filterStatus: KbFilterStatus;
  onNotFound: () => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const withId = (value: string | null, replace = true) => {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete('id');
    else params.set('id', value);
    // setSearchParams strips location.hash — go through navigate to keep the tab hash.
    navigate({ search: params.toString(), hash: location.hash }, { replace });
  };

  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam) return;
    const param = parseKbEntryParam(idParam);
    if (!param) return;
    if (isEntry(selectedEntry, param)) return; // already showing this entry — don't re-fetch
    const load = async () => {
      const id = 'rowId' in param ? param.rowId : await rowIdOf(param.publicId);
      if (id === null) throw new Error(`No readable entry ${idParam}`);
      const { data: entry } = await kbService.getById(id);
      const listed = entries.find((row) => row.id === id);
      setSelectedEntry(canReview ? await withPendingDecision(entry, listed, filterStatus) : entry);
      if (entry.publicId && entry.publicId !== idParam) withId(entry.publicId);
    };
    load().catch((error: unknown) => {
      logger.error('Failed to fetch KB entry:', error);
      onNotFound();
      withId(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return {
    /** Show an entry and put its number in the URL. */
    openEntry: (entry: KBEntry) => {
      setSelectedEntry(entry);
      withId(kbEntryParamValue(entry));
    },
    /** Close the entry and take its number out of the URL (a new history step, so Back reopens it). */
    closeEntry: () => {
      setSelectedEntry(null);
      withId(null, false);
    },
  };
};
