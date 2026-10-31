import { useRef, useState } from 'react';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { kbAutoActionsService } from '@/services/kbAutoActions.service';
import type { KBEntry, KbAutoChange, KbAutoUndo } from '@/services/kb.service';
import { kbQualityService } from '@/services/kbQuality.service';
import { restoreEntryVersion } from '@/services/kbEngine.service';
import { restoreRefusalText } from './activity/kbActivityCopy';

/** What each undo is called on a row of "Changed automatically". */
export const AUTO_UNDO_LABEL: Record<KbAutoUndo, string> = {
  restore: 'Restore',
  undo_clean: 'Undo clean-up',
  release_hold: 'Use it again',
  unapprove_mined: 'Un-approve',
  return_to_review: 'Send back for review',
};
export const AUTO_UNDO_TITLE: Record<KbAutoUndo, string> = {
  restore: 'Restore — puts the entry back as it was before it was removed',
  undo_clean: 'Undo clean-up — puts the original text back',
  release_hold: 'Use it again — the AI uses this answer again',
  return_to_review:
    'Send back for review — not used in answers until someone approves it; it waits under Question for you.',
  // Un-approve puts it back to Not live yet; it is not hidden or rejected.
  unapprove_mined: 'Un-approve — back to Not live yet; a person decides on it',
};

/** What each automatic change is called on its row. */
export const AUTO_CHANGE_KIND_LABELS: Record<KbAutoChange['action'], string> = {
  remove: 'Removed by the engine',
  hold: 'Set aside by the engine',
  cleanPersonalData: 'Personal details removed by the engine',
  approveMined: 'Made live by the engine (learned from mail)',
  approveCaptures: 'Made live by the engine (saved by a person)',
};

export type KbAutoRestore = {
  restore: (id: number) => void;
  /** Undo the automatic change on a "Changed automatically" row, by its own `autoChange.undo`. */
  undo: (entry: KBEntry) => void;
  /** Rows whose restore / undo is in flight: their button is disabled until it answers. */
  pending: ReadonlySet<number>;
};

/** The undo a row offers, or null: none known, or the suggestion it runs through is missing. */
export const autoUndoOf = (entry: KBEntry): KbAutoUndo | null => {
  const change = entry.autoChange;
  if (!change) return null;
  if (
    (change.undo === 'undo_clean' || change.undo === 'release_hold') &&
    change.suggestionId === null
  )
    return null;
  return change.undo;
};

/** Shown on a disabled Undo: someone changed the entry after the engine. */
export const UNDO_BLOCKED_TEXT = 'Someone changed this entry after the engine — undo by hand.';

/** The undo would be refused (someone changed the entry after the engine): shown disabled. */
export const undoBlocked = (entry: KBEntry): boolean =>
  entry.autoChange?.undoBlocked === 'changed_after';

/** The undos that run by version first (the server hands off to the action's own undo). */
const BY_VERSION: readonly KbAutoUndo[] = ['restore', 'undo_clean', 'release_hold'];

/**
 * Undo an automatic change. Where the change has an entry version (`undoVersion`), the version
 * restore runs it: the server hands off to the action's own undo and refuses, naming them, when
 * someone changed the entry after the engine. `unapprove_mined` (back to Not live yet, owner
 * decision) and `return_to_review` always use their own route. A version restore that answers
 * "use the action's own undo" falls back to it.
 */
export const runAutoUndo = async (entry: KBEntry, undo: KbAutoUndo): Promise<string> => {
  const version = entry.autoChange?.undoVersion ?? null;
  if (version !== null && BY_VERSION.includes(undo)) {
    const result = await restoreEntryVersion(entry.id, version);
    if (!result.refused) return 'Undone';
    if (result.refused !== 'use_action_undo') throw new Error(restoreRefusalText(result));
  }
  return runUndo(entry, undo);
};

const runUndo = async (entry: KBEntry, undo: KbAutoUndo): Promise<string> => {
  const suggestionId = entry.autoChange?.suggestionId ?? null;
  if (undo === 'restore') {
    await kbAutoActionsService.restore(entry.id);
    return 'Restored';
  }
  if (undo === 'return_to_review') {
    try {
      await kbAutoActionsService.returnApprovedCapture(entry.id);
    } catch (err) {
      // 409: it is no longer an automatic approval (sent back, or a person decided on it).
      // Plain words, never the raw server text.
      if (apiErrorStatus(err) === 409)
        throw new Error('This answer changed since: it was sent back, or a person decided on it.');
      throw err;
    }
    return 'Sent back for review';
  }
  if (undo === 'unapprove_mined') {
    try {
      await kbAutoActionsService.unapproveMined(entry.id);
    } catch (err) {
      if (apiErrorStatus(err) === 409)
        throw new Error(
          'This answer changed since: a person or the engine edited it, or it was undone.'
        );
      throw err;
    }
    return 'Un-approved';
  }
  if (suggestionId === null) throw new Error('This change cannot be undone from here.');
  if (undo === 'release_hold') {
    await kbQualityService.keep(suggestionId);
    return 'The AI uses this answer again';
  }
  const result = await kbQualityService.undo(suggestionId);
  if (result.outcome === 'refused')
    throw new Error(
      result.status === 409
        ? 'The entry was changed after the clean-up, so the original text was not put back.'
        : 'Nothing to undo: this text was not cleaned automatically, or it was already put back.'
    );
  return 'The original text is back';
};

/**
 * Restore / undo for the "Changed automatically" and "Removed automatically" lists. A removed
 * entry's Restore goes through the Automatic actions restore route (put back as it was), which an
 * Approve would not do — Approve also marks an entry the removal found unapproved as approved.
 *
 * Undefined unless the server APPLIED the status to the rows on screen: an older backend ignores
 * the status, and its rows (rejected by a person, say) have no automatic change to undo — every
 * other list keeps its own buttons. One call per row at a time.
 */
export const useKbAutoRestore = (
  canReview: boolean,
  filterStatus: KbFilterStatus,
  appliedStatus: { requested: KbFilterStatus; applied: boolean } | null,
  reread: () => void
): KbAutoRestore | undefined => {
  const inFlight = useRef(new Set<number>());
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const settle = (id: number) => {
    inFlight.current.delete(id);
    setPending(new Set(inFlight.current));
  };
  const enabled =
    canReview &&
    (filterStatus === 'auto_removed' || filterStatus === 'auto_changed') &&
    appliedStatus?.requested === filterStatus &&
    appliedStatus.applied;
  if (!enabled) return undefined;
  const run = (id: number, call: () => Promise<string>, failure: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setPending(new Set(inFlight.current));
    call().then(
      (done) => {
        settle(id);
        toast.success(done);
        reread();
      },
      (err: unknown) => {
        settle(id);
        toast.error(failure, { description: apiErrorMessage(err, 'Please try again.') });
        // A refused undo can mean the entry moved on meanwhile: show it as it is now.
        reread();
      }
    );
  };
  const restore = (id: number) =>
    run(
      id,
      async () => {
        await kbAutoActionsService.restore(id);
        return 'Restored';
      },
      'Could not restore'
    );
  const undo = (entry: KBEntry) => {
    const kind = autoUndoOf(entry);
    if (!kind || undoBlocked(entry)) return;
    run(
      entry.id,
      () => runAutoUndo(entry, kind),
      `Could not ${AUTO_UNDO_LABEL[kind].toLowerCase()}`
    );
  };
  return { restore, undo, pending };
};
