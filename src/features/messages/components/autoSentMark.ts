import type { MessageEvent } from '@/types';

export type AutoSentMark = { label: string; title: string };

const TITLE = 'Nobody on the team wrote or sent this reply: it went out on its own.';

/**
 * The mark on a reply that went out with no person behind it, read from the event's own stamp
 * (backend: `metadata.isAutoReply` on every automatic reply's event). Who wrote it is said when
 * the event says so: a keyword rule (`source: 'keyword_rule'`, `keywordRule.name`) or the AI
 * (`repliedByAI`). Anything else automatic — a bot's turn on a chat channel, an older event —
 * gets the plain mark. Null: a person's reply, or a customer's message.
 */
export const autoSentMark = (msg: Pick<MessageEvent, 'type' | 'metadata'>): AutoSentMark | null => {
  if (msg.type === 'inbound') return null;
  const meta = msg.metadata;
  if (meta?.isAutoReply !== true) return null;
  const rule = meta.keywordRule as { name?: unknown } | null | undefined;
  const ruleName = typeof rule?.name === 'string' && rule.name ? rule.name : null;
  if (ruleName || meta.source === 'keyword_rule') {
    return {
      label: 'Sent automatically · keyword rule',
      title: ruleName ? `${TITLE} Keyword rule "${ruleName}".` : `${TITLE} A keyword rule.`,
    };
  }
  if (meta.repliedByAI === true) {
    return { label: 'Sent automatically · AI-written', title: `${TITLE} Written by the AI.` };
  }
  return { label: 'Sent automatically', title: TITLE };
};
