import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getConvUrlId } from '@/lib/messageHelpers';
import { conversationMergeService, type ManualMerge } from '@/services/conversationMerge.service';
import type { MessageEvent } from '@/types';

/** The ticket a message was merged in from — the LAST entry of its trail (a stack; see BE). */
export const mergedFromId = (event: Pick<MessageEvent, 'metadata'>): number | null => {
  const trail = (event.metadata as { mergeTrail?: unknown } | null | undefined)?.mergeTrail;
  if (!Array.isArray(trail) || trail.length === 0) return null;
  const last: unknown = trail[trail.length - 1];
  return typeof last === 'number' ? last : null;
};

/** A merge change the server has just CONFIRMED (its POST succeeded). */
export type MergeChange = { unmerged: number } | { mergedIn: ManualMerge[] };

/** A thread just merged in, as the merges list shows it (merged now, by us). */
export const asManualMerge = (row: {
  id: number;
  publicId?: string | null;
  subject?: string | null;
}): ManualMerge => ({
  id: row.id,
  publicId: row.publicId ?? null,
  subject: row.subject ?? null,
  mergedAt: new Date().toISOString(),
  mergedBy: null,
});

/**
 * The list with a confirmed change applied — so a re-read that then fails (and keeps what is
 * shown) never leaves an unmerged thread listed beside the "unmerged" toast, or a merged-in one
 * missing. A list never read (null) stays null: nothing merge-related is offered from it.
 */
export const withMergeChange = (
  prev: ManualMerge[] | null,
  change: MergeChange
): ManualMerge[] | null => {
  if (prev === null) return null;
  if ('unmerged' in change) return prev.filter((row) => row.id !== change.unmerged);
  const added = new Set(change.mergedIn.map((row) => row.id));
  return [...prev.filter((row) => !added.has(row.id)), ...change.mergedIn];
};

/**
 * What the thread view needs to know about merges and people, loaded once per thread:
 *  - a label for messages that came from a merged-in ticket ("from ODL-MKT-1"), so a merged
 *    ticket never reads as though every message was always here;
 *  - everyone on the thread who is not us, for Reply all (email only).
 *
 * Both fail SOFT: an older backend answers neither, and the thread must still open.
 *
 * The merge list is also what the header's "Merged · n" chip shows: MessageDetail hands
 * `merges` + `reloadMerges` to MessageDetailHeader, so opening a thread asks for it ONCE.
 * `merges` is null until read, and when the backend could not say on the thread's first read (the
 * chip then offers nothing); a refresh that fails keeps the last list. `applyMergeChange` writes a
 * change the server has just confirmed, so that kept list never contradicts it.
 */
export const useThreadMergeContext = (
  conversationId: number,
  isEmail: boolean,
  refreshKey: number
) => {
  const orgCode = useCurrentOrgCode();
  const [merges, setMerges] = useState<ManualMerge[] | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  // Reads can overlap (a refresh, a reload after an unmerge): only the latest may write.
  const mergesSeq = useRef(0);
  const shownFor = useRef<number | null>(null);

  const reloadMerges = useCallback(() => {
    const seq = ++mergesSeq.current;
    void conversationMergeService.listMerges(conversationId).then((rows) => {
      // A refresh that fails (null) keeps what is on screen — the chip, Same conversation and an
      // open merge picker stay. Only the FIRST read for a thread (state still null) can leave it
      // null, and then nothing merge-related is offered.
      if (seq === mergesSeq.current) setMerges((prev) => rows ?? prev);
    });
  }, [conversationId]);

  /** Apply a confirmed merge/unmerge now; a read already in flight (from before it) is disowned. */
  const applyMergeChange = useCallback((change: MergeChange) => {
    mergesSeq.current += 1;
    setMerges((prev) => withMergeChange(prev, change));
  }, []);

  useEffect(() => {
    // Another thread starts from "not read yet"; a refresh of this one keeps what is shown.
    if (shownFor.current !== conversationId) {
      shownFor.current = conversationId;
      setMerges(null);
    }
    reloadMerges();
    return () => {
      mergesSeq.current += 1;
    };
  }, [reloadMerges, conversationId, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    if (isEmail) {
      void conversationMergeService.participants(conversationId).then((rows) => {
        if (!cancelled) setParticipants((rows ?? []).map((row) => row.address));
      });
    } else {
      setParticipants([]);
    }
    return () => {
      cancelled = true;
    };
  }, [conversationId, isEmail, refreshKey]);

  /**
   * "from ODL-MKT-1" for a message that arrived through a merge, else null. A trail naming a
   * ticket that is not in this ticket's merge list (merged into a ticket that was then merged
   * here) still says it came through a merge — but never shows the internal row id, which would
   * read as a ticket number nobody can look up.
   */
  const mergedFromLabel = useCallback(
    (event: MessageEvent): string | null => {
      const origin = mergedFromId(event);
      if (origin === null) return null;
      const merge = merges?.find((row) => row.id === origin);
      return merge ? `from ${getConvUrlId(merge, orgCode)}` : 'from a merged ticket';
    },
    [merges, orgCode]
  );

  return { mergedFromLabel, participants, merges, reloadMerges, applyMergeChange };
};
