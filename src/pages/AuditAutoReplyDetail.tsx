import { Link } from 'react-router-dom';
import { autoReplySentLabel, autoReplyWithheldLabel } from '@/features/messages/shell';

export const AUTO_REPLY_SENT = 'message.auto_reply_sent';
export const AUTO_REPLY_WITHHELD = 'message.auto_reply_withheld';

/** The two records an automatic reply leaves, as the action filter and the badge name them. */
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
  if (source === 'keyword_rule') return 'Keyword rule';
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
  entityId,
  details,
}: {
  action: string;
  entityId: string | number;
  details: Details;
}) {
  const held = action === AUTO_REPLY_WITHHELD;
  const sentence = text(details, 'detail');
  return (
    <div className="mb-1 space-y-0.5 text-sm" data-testid="audit-auto-reply">
      <p>{held ? autoReplyWithheldLabel(details) : autoReplySentLabel(details)}</p>
      {/* The backend's own sentence for a hold, when it wrote one (a code alone is not shown). */}
      {held && sentence.includes(' ') && <p className="text-muted-foreground">{sentence}</p>}
      <p className="text-xs text-muted-foreground">
        Written by: {autoReplyWriter(details)}
        {' · '}
        <Link to={`/threads/${entityId}`} className="text-primary hover:underline">
          Open thread
        </Link>
      </p>
    </div>
  );
}
