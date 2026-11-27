import { getApiErrorMessage } from '@/lib/errorMessages';

// Messages only the settings rule/category dialogs show. They live here, not in lib/errorMessages,
// so they stay out of the main chunk.

/** Shown in a rule dialog when a save fails and there is no server copy that is safe to display. */
export const RULE_SAVE_FAILED_MESSAGE = 'Could not save the rule. Try again.';

/**
 * Plain-text line for a refused rule save: the server's own message for a 4xx (409 duplicate,
 * 400 validation), the generic line for a 5xx, a network failure or an empty body.
 */
export const getRuleSaveErrorMessage = (err: unknown): string =>
  getApiErrorMessage(err) ?? RULE_SAVE_FAILED_MESSAGE;

/**
 * Toast line for a rule on/off switch that failed with nothing safe to show from the server
 * (5xx, network, a 2xx without the saved row). A 4xx shows `getApiErrorMessage` instead.
 */
export const RULE_TOGGLE_FAILED_MESSAGE = 'Could not update the rule. Try again.';

/** Shown in an editor reopened on a rule whose earlier save has not answered yet. */
export const EARLIER_SAVE_PENDING_NOTICE =
  'Saving your earlier change to this rule… If this takes long, reload the page.';
/** Shown when an earlier save of the open rule landed after the person had typed in it. */
export const RULE_CHANGED_UNDERNEATH_NOTICE =
  'This rule was just saved by your earlier change. Fields you edited here keep your text; the others now show the saved values.';
/** Shown in a reopened editor when the earlier save it waited for was refused or failed. */
export const earlierSaveFailedNotice = (reason: string): string =>
  `Your earlier change was not saved. ${reason}`;
/** A list reload after a write failed: what is shown may be old. */
export const RULES_RELOAD_FAILED_MESSAGE =
  'Could not reload the rules, so the list may be out of date. Editing reloads it first.';
/** The page's first load failed: there is no list to be out of date yet. */
export const RULES_LOAD_FAILED_MESSAGE = 'Could not load the rules. Reload the page to try again.';
export const CATEGORIES_LOAD_FAILED_MESSAGE =
  'Could not load the categories. Reload the page to try again.';
export const CATEGORIES_RELOAD_FAILED_MESSAGE =
  'Could not reload the categories, so the list may be out of date. Editing reloads it first.';
export const CATEGORY_SAVE_PENDING_NOTICE =
  'Saving your earlier change to this category… If this takes long, reload the page.';
export const CATEGORY_CHANGED_UNDERNEATH_NOTICE =
  'This category was just saved by your earlier change. Fields you edited here keep your text; the others now show the saved values.';
