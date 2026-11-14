import { COMPOSER_TOOL } from '../messageDetailConstants';

/*
  v4 mobile (M7). What may stay open on an outside press: a menu, list, dialog or sheet the
  composer opened (AI panel options, the similar-messages dialog, a select menu) is not "outside".
*/
export const KEEPS_COMPOSER_OPEN =
  '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';

/** Inputs that take typed text — where a focus means the agent is about to write. */
export const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);
export const isTextEntry = (target: EventTarget): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return (
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
};

// v3 ".ibtn" — shared with Compose new message (messageDetailConstants).
export const IBTN = COMPOSER_TOOL;
// Between the toolbar's three groups — write (AI draft, Translate), insert (Templates, Attach),
// find (KB) — so the row reads as three groups of tools, not a run of buttons.
export const TOOL_DIVIDER = 'w-px h-4 bg-border mx-0.5 max-sm:hidden';
// The open toolbar on a phone: tools wrap, 6px apart; the AI draft button is tool-sized too.
export const PHONE_TOOLS = 'max-sm:gap-1.5 max-sm:[&_button]:min-h-9';
// At rest on a phone: only the AI draft button — the off note, undo and messages wait for open.
export const AI_AT_REST =
  '[&>span]:hidden [&>div]:hidden [&>p]:hidden [&>button:not([data-ai-draft])]:hidden [&>button]:!h-10 sm:[&>button]:!h-8 [&>button]:!rounded-full [&>button]:!px-3.5 [&>button]:!text-[13px]';
