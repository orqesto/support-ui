import type { MessageEvent } from '@/types';

export type AutoSentMark = { label: string; title: string };

const TITLE = 'Nobody on the team wrote or sent this reply: it went out on its own.';

/**
 * The mark on a reply that went out with no person behind it, read from the event itself:
 * - the receipt confirmation ("we got your message"): `metadata.acknowledgmentReply` (it carries
 *   no `isAutoReply`);
 * - a keyword rule's reply: `source: 'keyword_rule'` / `keywordRule.name`;
 * - the AI's reply: `repliedByAI` — except on mail the backend's own email service recorded
 *   (`source: 'email_service'`), which stamps it on templated mail no model wrote;
 * - anything else a bot sent (`type: 'bot_reply'`, or `isAutoReply`): the plain mark.
 * Null: a person's reply, or a customer's message.
 */
export const autoSentMark = (msg: Pick<MessageEvent, 'type' | 'metadata'>): AutoSentMark | null => {
  if (msg.type === 'inbound') return null;
  const meta = msg.metadata ?? {};
  if (meta.acknowledgmentReply === true) {
    return {
      label: 'Sent automatically · receipt confirmation',
      title: `${TITLE} The mailbox's receipt confirmation.`,
    };
  }
  if (meta.isAutoReply !== true && msg.type !== 'bot_reply') return null;
  const rule = meta.keywordRule as { name?: unknown } | null | undefined;
  const ruleName = typeof rule?.name === 'string' && rule.name ? rule.name : null;
  if (ruleName || meta.source === 'keyword_rule') {
    return {
      label: 'Sent automatically · keyword rule',
      title: ruleName ? `${TITLE} Keyword rule "${ruleName}".` : `${TITLE} A keyword rule.`,
    };
  }
  if (meta.repliedByAI === true && meta.source !== 'email_service') {
    return { label: 'Sent automatically · AI-written', title: `${TITLE} Written by the AI.` };
  }
  return { label: 'Sent automatically', title: TITLE };
};
