import { Link } from 'react-router-dom';
import {
  AUTO_REPLY_CHANNEL_LABEL,
  allowedByWords,
  autoReplySentLabel,
  autoReplyWithheldLabel,
} from '@/features/messages/shell';

export const AUTO_REPLY_SENT = 'message.auto_reply_sent';
export const AUTO_REPLY_WITHHELD = 'message.auto_reply_withheld';

/** The two records an automatic reply leaves, as the action filter and the badge name them. */
/** Both records at once: the automatic replies view of Audit Logs. */
export const AUTO_REPLY_ALL = `${AUTO_REPLY_SENT},${AUTO_REPLY_WITHHELD}`;
/** Where a website chat that never reached the inbox can be read: the widgets' "Chats". */
export const WIDGET_CHATS_PATH = '/settings#integrations/chat-widgets';

/** …opened on one widget's Chats view, on one chat (read by ChatWidgetSettings). */
export const widgetChatPath = (widgetId: number, sessionId: number): string =>
  `${WIDGET_CHATS_PATH}?widget=${widgetId}&chat=${sessionId}`;

export const AUTO_REPLY_ACTION_LABEL: Record<string, string> = {
  [AUTO_REPLY_SENT]: 'Automatic reply → Sent',
  [AUTO_REPLY_WITHHELD]: 'Automatic reply → Held or not sent',
};

type Details = Record<string, unknown> | null;

const text = (details: Details, key: string): string => {
  const value = details?.[key];
  return typeof value === 'string' ? value : '';
};

/**
 * Who wrote the reply, from the record's own fields (backend autoReplyOutcome): a keyword rule
 * names itself (`ruleName` on a sent reply, `ruleNames` on a held one); `source` says the rest —
 * `missing_info` is the AI's question for missing details, anything else the AI's answer.
 */
export const autoReplyWriter = (details: Details): string => {
  const rawNames = details?.['ruleNames'];
  const names = [
    text(details, 'ruleName'),
    ...(Array.isArray(rawNames)
      ? rawNames.filter((name): name is string => typeof name === 'string')
      : []),
  ].filter(Boolean);
  if (names.length > 0)
    return `Keyword rule${names.length > 1 ? 's' : ''} ${names.map((name) => `"${name}"`).join(', ')}`;
  const source = text(details, 'source');
  const path = text(details, 'replyPath');
  if (path === 'acknowledgment' || source === 'acknowledgment')
    return 'Nobody — the mailbox’s fixed receipt confirmation';
  if (path === 'telegram') return 'Telegram bot';
  if (path === 'widget') return 'Website chat bot';
  if (source === 'keyword_rule' || path === 'keyword_rule') return 'Keyword rule';
  if (source === 'missing_info') return 'AI — question for missing details';
  return 'AI';
};

/**
 * An audit row of an automatic reply, readable without opening the JSON: what happened and why
 * (the Activity's own wording), who wrote it, and the thread it is about. The raw record stays
 * under "View" beside it.
 */
export function AuditAutoReplyDetail({
  action,
  entity,
  entityId,
  details,
}: {
  action: string;
  /** `chat_session`: a website chat that is not in the inbox — there is no thread to open. */
  entity?: string;
  entityId: string | number;
  details: Details;
}) {
  const held = action === AUTO_REPLY_WITHHELD;
  const sentence = text(details, 'detail');
  const channel = AUTO_REPLY_CHANNEL_LABEL[text(details, 'channel')];
  const path = text(details, 'replyPath');
  // A keyword rule's and a receipt confirmation's fixed text is the team's own.
  const byTeam =
    text(details, 'ruleName') !== '' ||
    path === 'keyword_rule' ||
    path === 'acknowledgment' ||
    text(details, 'source') === 'keyword_rule';
  const allowed = held ? null : allowedByWords(details?.['allowedBy'], byTeam);
  // A website chat's own page: the widget's Chats, opened on this chat (when the record names
  // both), else the widgets' list.
  const widgetId = details?.['chatWidgetId'];
  const sessionId =
    details?.['chatSessionId'] ?? (entity === 'chat_session' ? entityId : undefined);
  const chatPath =
    typeof widgetId === 'number' && sessionId !== undefined && sessionId !== null
      ? widgetChatPath(widgetId, Number(sessionId))
      : WIDGET_CHATS_PATH;
  const threadId = details?.['conversationId'];
  const widgetOnly =
    entity === 'chat_session' ||
    (details !== null && 'conversationId' in details && threadId === null);
  return (
    <div className="mb-1 space-y-0.5 text-sm" data-testid="audit-auto-reply">
      <p>{held ? autoReplyWithheldLabel(details) : autoReplySentLabel(details)}</p>
      {/* The backend's own sentence for a hold, when it wrote one (a code alone is not shown). */}
      {held && sentence.includes(' ') && <p className="text-muted-foreground">{sentence}</p>}
      {allowed && <p className="text-muted-foreground">Allowed because {allowed}.</p>}
      <p className="text-xs text-muted-foreground">
        Written by: {autoReplyWriter(details)}
        {channel ? ` · ${channel}` : ''}
        {' · '}
        {widgetOnly ? (
          <Link to={chatPath} className="text-primary hover:underline">
            {chatPath === WIDGET_CHATS_PATH ? 'Open website chats' : 'Open this chat'}
          </Link>
        ) : (
          <Link
            to={`/threads/${typeof threadId === 'number' ? threadId : entityId}`}
            className="text-primary hover:underline"
          >
            Open thread
          </Link>
        )}
      </p>
    </div>
  );
}
