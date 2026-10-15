/**
 * Activity-tab timeline: turns the thread's audit entries, notes and in-session
 * events into one chronological feed. Extracted from MessagePanelTabs so the
 * label mapping can be unit-tested (and to keep that component under max-lines).
 */
import type { MessageActivityEntry, MessageNote } from '@/services/message.service';

/**
 * What kind of thing happened, for the row's dot (v4 `.a-dot.in/.out/.note/.ai`, else plain).
 * ⛔ Derived ONLY from what the data says: the audit action, a note, or an in-session note edit.
 * `ai` has no source today — no audit action the activity endpoint returns is authored by the AI
 * (auto-routing is rule-based and stays `other`) — so nothing maps to it until one exists.
 */
export type ActivityKind = 'in' | 'out' | 'note' | 'ai' | 'other';

export type TimelineItem = { label: string; time: string; who: string; kind: ActivityKind };

/** The dot's colour per kind. Theme tokens only, so it holds in dark mode. */
export const ACTIVITY_DOT: Record<ActivityKind, string> = {
  in: 'bg-primary-solid',
  out: 'bg-success',
  note: 'bg-warning',
  ai: 'bg-ai',
  other: 'bg-border-strong',
};

const ACTION_LABEL: Record<string, string> = {
  'message.reply': 'Reply sent',
  'message.assign': 'Assigned',
  'message.create': 'Message received',
  'message.delete': 'Message deleted',
  'message.compose_new': 'New message composed',
  'message.manual_route': 'Manually routed',
  'ticket.create': 'Ticket created',
  'ticket.resolve': 'Resolved',
  'ticket.reopen': 'Reopened',
  'ticket.assign': 'Ticket assigned',
  'ticket.update': 'Ticket updated',
  'ticket.delete': 'Ticket deleted',
  'ticket.dept_moved': 'Moved department',
  // System-authored transitions — nobody clicked these, so they carry a NULL userId and
  // render with "System" as the actor. Phrased as what the system observed, not as a
  // command, so the feed reads as an explanation for a status the agent did not set.
  'message.auto_client_replied': 'Customer replied — reopened for response',
  'message.auto_route': 'Routed automatically',
};

/**
 * Audit actions that ARE a message arriving or leaving. Everything else (status, assignment,
 * routing, labels, read state…) is `other`. The two auto actions are written when a CUSTOMER
 * message arrives on the thread, so they count as inbound.
 */
const ACTION_KIND: Record<string, ActivityKind> = {
  'message.create': 'in',
  'message.auto_client_replied': 'in',
  'message.auto_reopen': 'in',
  'message.reply': 'out',
  'message.compose_new': 'out',
};

export const activityKindOf = (action: string): ActivityKind => ACTION_KIND[action] ?? 'other';

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortDate = (iso: unknown): string | null => {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : SHORT_DATE.format(date);
};

type RoutingRuleDetail = {
  value?: string | null;
  deleted?: boolean;
  acceptedBy?: { name?: string } | null;
  acceptedAt?: string | null;
  autoAccepted?: boolean;
};

/** Routes a rule's score chose (incl. legacy rows with no rule shares): worded "by a rule". */
const RULE_REASONS = new Set(['rule_strong', 'rule_ai_agree', 'rule_decisive']);
/** Routes the embedding similarity chose. */
const SIMILARITY_REASONS = new Set(['embedding_strong', 'embedding_override']);

/**
 * The synthetic entry GET /activity appends for an automatic route (spec 2026-10-14 §3.9).
 * The wording follows the REASON, never whether `rules` is empty: legacy rule rows carry no
 * shares and must not read as a similarity route. Unknown reasons fall back to "automatically".
 */
export function routingDecisionLabel(details: Record<string, unknown> | null): string {
  const dept =
    typeof details?.['departmentName'] === 'string' ? details['departmentName'] : 'a department';
  const reason = details?.['reason'];
  if (reason === 'sole_department')
    return `Routed to ${dept} — the only department for this mailbox`;
  if (reason === 'sender_history')
    return `Routed to ${dept} — where this sender’s mail usually goes`;
  if (reason === 'ai_primary') return `Routed to ${dept} by the AI classifier`;
  if (typeof reason === 'string' && SIMILARITY_REASONS.has(reason))
    return `Routed to ${dept} by similarity to earlier conversations`;
  if (typeof reason !== 'string' || !RULE_REASONS.has(reason))
    return `Routed to ${dept} automatically`;
  const rules = Array.isArray(details?.['rules']) ? (details['rules'] as RoutingRuleDetail[]) : [];
  const rule =
    rules.find((entry) => typeof entry?.value === 'string' && !entry.deleted) ?? rules[0];
  if (!rule) return `Routed to ${dept} by a rule`;
  if (rule.deleted || typeof rule.value !== 'string')
    return `Routed to ${dept} by a rule that has since been deleted`;
  const when = shortDate(rule.acceptedAt);
  const by = rule.acceptedBy?.name
    ? ` (accepted by ${rule.acceptedBy.name}${when ? `, ${when}` : ''})`
    : rule.autoAccepted
      ? ` (accepted automatically${when ? `, ${when}` : ''})`
      : '';
  return `Routed to ${dept} by rule "${rule.value}"${by}`;
}

export function auditEntryLabel(action: string, details: Record<string, unknown> | null): string {
  if (action === 'routing.decision') return routingDecisionLabel(details);
  if (action === 'message.status_change') {
    const from = details?.['from'] as string | undefined;
    const to = details?.['to'] as string | undefined;
    return to ? `Status changed${from ? ` from ${from}` : ''} to ${to}` : 'Status changed';
  }
  if (action === 'message.priority_change') {
    const to = details?.['to'] as string | undefined;
    return to ? `Priority set to ${to}` : 'Priority changed';
  }
  if (action === 'message.category_change') {
    return details?.['to'] ? 'Category assigned' : 'Category removed';
  }
  if (action === 'message.auto_reopen') {
    const from = details?.['fromStatus'] as string | undefined;
    if (details?.['reason'] === 'promoted_from_orphan') return 'Surfaced — real customer reply';
    // A repair (lost-job / bounce) moved or restored mail left on a merged-away ticket: one neutral
    // label, true of every shape it writes — never said as a customer reply or a reopen.
    const via = details?.['via'];
    if (via === 'lost_job_repair' || via === 'bounce_repair')
      return 'Restored by a repair — mail left on a merged-away ticket';
    return `Customer replied — reopened${from ? ` from ${from}` : ''}`;
  }
  // Read state is shared org-wide (one agent reading a thread reads it for the
  // team), so it belongs in the thread's history rather than being a private
  // toggle — that is why it is logged and rendered here at all.
  if (action === 'message.read_change') {
    return details?.['isRead'] === true ? 'Marked as read' : 'Marked as unread';
  }
  if (action === 'message.update') {
    const detail = typeof details?.['action'] === 'string' ? details['action'] : '';
    if (detail === 'mark_processed') return 'Marked as processed';
    if (detail === 'mark_suspicious') return 'Marked as suspicious';
    if (detail === 'move_to_spam') return 'Moved to spam';
    if (detail === 'mark_unprocessed') return 'Marked as unprocessed';
    if (detail === 'approve') return 'Approved';
    return 'Message updated';
  }
  return ACTION_LABEL[action] ?? action;
}

export function buildTimeline(
  activity: MessageActivityEntry[],
  notes: MessageNote[],
  inSession: { label: string; who: string; time: string }[]
): TimelineItem[] {
  const fromAudit: TimelineItem[] = activity.map((entry) => ({
    label: auditEntryLabel(entry.action, entry.details),
    time: entry.createdAt,
    who: entry.userEmail ?? 'System',
    kind: activityKindOf(entry.action),
  }));

  const fromNotes: TimelineItem[] = notes.map((note) => ({
    label: 'Internal note',
    time: note.createdAt,
    who: note.user ? `${note.user.firstName} ${note.user.lastName ?? ''}`.trim() : note.authorName,
    kind: 'note',
  }));

  // In-session entries are the agent's own note edits and deletions (MessageDetail).
  const ephemeral: TimelineItem[] = inSession.map((entry) => ({ ...entry, kind: 'note' }));

  return [...fromAudit, ...fromNotes, ...ephemeral].sort(
    (itemA, itemB) => new Date(itemA.time).getTime() - new Date(itemB.time).getTime()
  );
}
