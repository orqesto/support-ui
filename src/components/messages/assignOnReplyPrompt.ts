/**
 * Whether sending a reply should first ask the agent about ownership, and what to ask.
 *
 * Owner decision 2026-09-07 (taco: "responding in thread doesn't make you assignee"):
 *  - a thread nobody owns → ask every time: "Assign this thread to you?"
 *  - a colleague's thread  → ask: "Take over from <name>, or just reply?"
 *  - your own thread       → nothing to ask
 *  - workspace setting `assignOnReply` off → never ask, never assign
 *
 * The agent's answer travels with the reply as `assign: 'me' | 'none'`; the backend applies
 * it (assignOnReply.ts there). Pure so the rule is testable without rendering.
 */
export type AssignOnReplyPrompt = { kind: 'claim' } | { kind: 'takeover'; ownerName: string };

export const decideAssignOnReplyPrompt = (input: {
  assigneeId: number | null | undefined;
  assigneeName?: string | null;
  currentUserId: number | null;
  /** `settings.assignOnReply`; absent (older backend) reads as on. */
  assignOnReply: boolean | undefined;
}): AssignOnReplyPrompt | null => {
  if (input.assignOnReply === false) return null;
  if (input.currentUserId === null) return null;
  if (input.assigneeId === null || input.assigneeId === undefined) return { kind: 'claim' };
  if (input.assigneeId === input.currentUserId) return null;
  return { kind: 'takeover', ownerName: input.assigneeName?.trim() || 'a colleague' };
};

/** Reads the workspace setting off the organization payload; absent means on. */
export const readAssignOnReplySetting = (
  organization: { settings?: Record<string, unknown> | null } | null | undefined
): boolean | undefined => {
  const value = organization?.settings?.assignOnReply;
  return typeof value === 'boolean' ? value : undefined;
};
