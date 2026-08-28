/**
 * Does this integration mean mail can actually reach the workspace?
 *
 * Lives here, exported, because the wizard gates "Finish setup" on it and the Channels step
 * reports it — and when the two kept their own copies they were wrong in the same way at
 * the same time. One definition, imported twice.
 *
 * ⛔ Do NOT re-add `&& !integration.isKnowledgeBase`. A mailbox marked as a Knowledge Base
 * source is still a connected channel: everything arriving after its cutoff is live mail,
 * and the largest client deployment runs a single mailbox badged both Support and Knowledge
 * Base. Excluding them made onboarding contradict its own tip — which asks the user to tick
 * "Use as Knowledge Base source" — by hiding the mailbox they had just added and refusing
 * to start the trial with "connect a channel".
 */
export type ConnectableIntegration = { type: string; isKnowledgeBase?: boolean };

/** Channel types that can receive customer messages. */
const CHANNEL_TYPES = new Set(['gmail', 'email', 'telegram', 'slack']);

export const isConnectedChannel = (integration: ConnectableIntegration): boolean =>
  CHANNEL_TYPES.has(integration.type);
