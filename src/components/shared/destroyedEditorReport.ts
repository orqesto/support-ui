import type { Editor } from '@tiptap/core';
import { logger } from '@/lib/logger';
import { clientErrorService } from '@/services/clientError.service';

/**
 * RichTextEditor skips an editor TipTap has destroyed instead of crashing (2026-11: a ticket page
 * showed "Something went wrong" on a phone). What destroys it while the reply box still holds it
 * was never reproduced, so a skip must REPORT that it happened — a guard that bites in silence
 * would hide the trigger for good.
 *
 * Only a real destroy counts: `isDestroyed` is also true for an editor that is merely not on the
 * page, so the editor's own `destroy` event marks it. One report per editor.
 */
const destroyedEditors = new WeakSet<Editor>();
const reportedEditors = new WeakSet<Editor>();

/** Watch `editor` for a destroy; returns the cleanup for a useEffect. */
export const trackEditorDestroy = (editor: Editor): (() => void) => {
  const mark = () => {
    destroyedEditors.add(editor);
  };
  editor.on('destroy', mark);
  return () => {
    editor.off('destroy', mark);
  };
};

/** Called when the guard skipped `editor`; reports once if TipTap really destroyed it. */
export const noteSkippedEditor = (editor: Editor): void => {
  if (!destroyedEditors.has(editor) || reportedEditors.has(editor)) return;
  reportedEditors.add(editor);
  const where = new Error('RichTextEditor skipped a destroyed editor');
  logger.warn('[editor] skipped a destroyed editor', where);
  clientErrorService.report({
    message: '[editor] skipped a destroyed editor (guarded, no crash)',
    stack: where.stack,
  });
};
