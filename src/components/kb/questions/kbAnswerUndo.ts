import { restoreRefusalText } from '@/components/kb/activity/kbActivityCopy';
import { kbConsolidationService } from '@/services/kbConsolidation.service';
import { restoreEntryVersion } from '@/services/kbEngine.service';
import type { KbAnswerChange, KbRestoreRefusal } from '@/services/kbEngine.types';
import { getApiErrorMessage } from '@/lib/errorMessages';

export type UndoOutcome = { ok: true } | { ok: false; text: string };

/**
 * Undo an answer from what it reported changing. An entry the answer created (a merge's case, no
 * earlier version) is undone by Unmerge, which brings the originals back first. Every other entry
 * is restored to the version it had before; one that is now inside a case (a merge or an attach)
 * is taken out of that case with the existing detach, then restored. A refusal is said in plain
 * words and stops the undo (nothing is overwritten).
 */
export const undoAnswer = async (changed: KbAnswerChange[]): Promise<UndoOutcome> => {
  try {
    for (const change of changed.filter((item) => item.versionBefore === null)) {
      await kbConsolidationService.unmerge(change.entryId);
    }
    for (const change of changed) {
      if (change.versionBefore === null) continue;
      let result = await restoreEntryVersion(change.entryId, change.versionBefore);
      if ('refused' in result && result.refused === 'merged_into_case' && result.caseId) {
        await kbConsolidationService.detachFromCase(result.caseId, [change.entryId]);
        result = await restoreEntryVersion(change.entryId, change.versionBefore);
      }
      if ('refused' in result)
        return { ok: false, text: restoreRefusalText(result as KbRestoreRefusal) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, text: getApiErrorMessage(err) ?? 'Could not undo. Try again.' };
  }
};
