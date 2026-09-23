import { useCallback, useEffect, useState } from 'react';
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

/**
 * What the thread view needs to know about merges and people, loaded once per thread:
 *  - a label for messages that came from a merged-in ticket ("from ODL-MKT-1"), so a merged
 *    ticket never reads as though every message was always here;
 *  - everyone on the thread who is not us, for Reply all (email only).
 *
 * Both fail SOFT: an older backend answers neither, and the thread must still open.
 */
export const useThreadMergeContext = (
  conversationId: number,
  isEmail: boolean,
  refreshKey: number
) => {
  const orgCode = useCurrentOrgCode();
  const [merges, setMerges] = useState<ManualMerge[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void conversationMergeService.listMerges(conversationId).then((rows) => {
      if (!cancelled) setMerges(rows ?? []);
    });
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
      const merge = merges.find((row) => row.id === origin);
      return merge ? `from ${getConvUrlId(merge, orgCode)}` : 'from a merged ticket';
    },
    [merges, orgCode]
  );

  return { mergedFromLabel, participants };
};
