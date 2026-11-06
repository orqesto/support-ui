/*
 * What a cancelled paid subscription does (owner decision 8, 2026-10-23): at the end of the paid
 * period the workspace moves to the Free plan — it is not locked. What exists keeps working; nothing
 * new is added above Free's limits (decision 3).
 */

export const MOVES_TO_FREE_SENTENCE =
  "After that the workspace moves to the Free plan: everything you have keeps working, and nothing new can be added above Free's limits.";

/** The toast after a cancel. */
export const cancelledToast = (accessEnd: string): string =>
  `Subscription cancelled. You keep full access until ${accessEnd}; then the workspace moves to the Free plan.`;

/** The confirm dialog's sentence. */
export const cancelConfirmText = (accessEnd: string | null): string =>
  accessEnd
    ? `Your workspace keeps every feature until ${accessEnd}, and nothing is charged after that. ${MOVES_TO_FREE_SENTENCE} You can undo this at any time before then.`
    : `Your workspace keeps every feature until the end of the period you have paid for. ${MOVES_TO_FREE_SENTENCE} You can undo this at any time before then.`;

/** A failed renewal, on the Subscription page. */
export const PAST_DUE_TEXT =
  'Your last payment did not go through. Update your payment method to keep your plan.';

/** A failed renewal, for a member who cannot pay. */
export const PAST_DUE_AGENT_TEXT =
  'The last payment for this workspace did not go through. Ask an admin to update the payment method.';
