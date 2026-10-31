import { kbRef } from '@/lib/kbConsolidation';
import type { KbUndoBlock, KbUndoBlockReason } from '@/services/kbEngine.types';

const REASON: Record<KbUndoBlockReason, string> = {
  changed_after: 'was changed by someone after your answer',
  gone: 'no longer exists',
  text_redacted: 'had its text removed (personal data), so it cannot be put back',
  not_in_case: 'is no longer in that case',
};

/** "#KB-12 was changed by someone after your answer." for each blocking entry. */
export const undoBlockedText = (blocked: KbUndoBlock[]): string =>
  `Nothing was undone. ${blocked
    .map(
      (block) =>
        `${kbRef(block.publicId, block.entryId)} ${REASON[block.reason] ?? 'cannot be put back'}.`
    )
    .join(' ')}`;

export const UNDO_REFUSAL_TEXT = {
  not_answered: 'This question was not answered here, so there is nothing to undo.',
  already_undone: 'This answer was already undone.',
  nothing_to_undo: 'There is nothing to undo: this answer changed nothing.',
  other: 'This answer cannot be undone.',
} as const;

export const UNDO_FORBIDDEN_TEXT = 'Only the person who answered, or an admin, can undo this.';
