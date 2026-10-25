import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { logger } from '@/lib/logger';
import { withPendingDecision } from '@/lib/kbDecisionLookup';
import { kbService, type KBEntry } from '@/services/kb.service';

export type KbEntryAlert = {
  open: true;
  title: string;
  description: string;
  variant: 'error';
};

/** The alert for a `?id=` that names no readable entry. */
const KB_ENTRY_NOT_FOUND_ALERT: KbEntryAlert = {
  open: true,
  title: 'Entry Not Found',
  description: 'Could not find the requested knowledge base entry.',
  variant: 'error',
};

/** The alert for a link to another workspace's entry: its KB-… exists here too, as another entry. */
const kbEntryOtherWorkspaceAlert = (code: string): KbEntryAlert => ({
  open: true,
  title: 'Entry in another workspace',
  description: `This link is for an entry in the ${code} workspace. Switch to that workspace to open it.`,
  variant: 'error',
});

/**
 * What a `?id=` names: the entry's public number — with the workspace code the address carries
 * ("ACM-KB-77"), or bare as typed ("KB-77", this workspace) — or a row id, from the pages that
 * link by row and from a workspace whose code has not loaded.
 */
type EntryParam = { rowId: number } | { publicId: string; workspaceCode: string | null };

export const parseKbEntryParam = (value: string): EntryParam | null => {
  const trimmed = value.trim();
  const publicMatch = /^#?(?:([a-z]+\d*)-)?kb-(\d{1,12})$/i.exec(trimmed);
  if (publicMatch)
    return {
      publicId: `KB-${Number(publicMatch[2])}`,
      workspaceCode: publicMatch[1]?.toUpperCase() ?? null,
    };
  return /^\d{1,12}$/.test(trimmed) ? { rowId: Number(trimmed) } : null;
};

/**
 * The value a `?id=` carries for an entry. ⛔ Never the bare public number: KB-77 exists in every
 * workspace, so a link opened in another would show a different entry. With the workspace code
 * (as Messages' `ACM-SUP-42`), or else the row id, which is unique everywhere.
 */
export const kbEntryParamValue = (
  entry: Pick<KBEntry, 'id' | 'publicId'>,
  workspaceCode: string | null | undefined
): string =>
  entry.publicId && workspaceCode
    ? `${workspaceCode.toUpperCase()}-${entry.publicId}`
    : String(entry.id);

const isEntry = (entry: KBEntry | null, param: EntryParam): entry is KBEntry =>
  !!entry && ('rowId' in param ? entry.id === param.rowId : entry.publicId === param.publicId);

/** The row id a public number belongs to, by the list's search by number (null: none readable). */
const rowIdOf = async (publicId: string): Promise<number | null> => {
  const response = await kbService.getAll({ search: publicId, limit: 1 });
  return response.data?.idMatch?.id ?? null;
};

/**
 * The Knowledge Base `?id=` deep link (e.g. /knowledge-base?id=ACM-KB-77): keeps the open entry
 * in the URL for sharing and refresh, like Messages and Tickets, under the number the page shows
 * and the search finds. A row-id link (how the other pages link) still opens the entry and is then
 * rewritten to the public number. A link carrying another workspace's code is refused rather than
 * resolved here. A reviewer's entry comes with the decision waiting on it (looked up in the list,
 * which the detail route does not send), so every deep link can decide. An id that cannot be read
 * is dropped from the URL.
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
  onNotFound: (alert: KbEntryAlert) => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceCode = useCurrentOrgCode();
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
    if ('publicId' in param && param.workspaceCode) {
      if (!workspaceCode) return; // the code loads; this runs again then
      if (param.workspaceCode !== workspaceCode.toUpperCase()) {
        onNotFound(kbEntryOtherWorkspaceAlert(param.workspaceCode));
        withId(null);
        return;
      }
    }
    if (isEntry(selectedEntry, param)) {
      // Already showing it: only bring the address to the form it is shared in (the workspace
      // code can load after the entry did).
      const wanted = kbEntryParamValue(selectedEntry, workspaceCode);
      if (wanted !== idParam) withId(wanted);
      return;
    }
    // A newer address (another entry opened, a filter changed) supersedes this load.
    let current = true;
    const load = async () => {
      const id = 'rowId' in param ? param.rowId : await rowIdOf(param.publicId);
      if (id === null) throw new Error(`No readable entry ${idParam}`);
      const { data: entry } = await kbService.getById(id);
      const listed = entries.find((row) => row.id === id);
      const opened = canReview ? await withPendingDecision(entry, listed, filterStatus) : entry;
      if (!current) return;
      setSelectedEntry(opened);
      // The address names exactly the entry shown, so the next run finds it and stops.
      const wanted = kbEntryParamValue(opened, workspaceCode);
      if (wanted !== idParam) withId(wanted);
    };
    load().catch((error: unknown) => {
      logger.error('Failed to fetch KB entry:', error);
      if (!current) return;
      onNotFound(KB_ENTRY_NOT_FOUND_ALERT);
      withId(null);
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaceCode, selectedEntry]);

  return {
    /** Show an entry and put its number in the URL. */
    openEntry: (entry: KBEntry) => {
      setSelectedEntry(entry);
      withId(kbEntryParamValue(entry, workspaceCode));
    },
    /** Close the entry and take its number out of the URL (a new history step, so Back reopens it). */
    closeEntry: () => {
      setSelectedEntry(null);
      withId(null, false);
    },
  };
};
