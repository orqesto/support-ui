/**
 * Activity-tab timeline: turns the thread's audit entries, notes and in-session
 * events into one chronological feed. Extracted from MessagePanelTabs so the
 * label mapping can be unit-tested (and to keep that component under max-lines).
 */
import type { MessageActivityEntry, MessageNote } from '@/services/message.service';

export type TimelineItem = { label: string; time: string; who: string; dot: string | undefined };

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

const ACTION_DOT: Record<string, string> = {
  'ticket.resolve': 'bg-green-500/60',
  'ticket.reopen': 'bg-yellow-500/60',
  'message.auto_reopen': 'bg-yellow-500/60',
  'message.auto_client_replied': 'bg-blue-500/60',
};

export function auditEntryLabel(action: string, details: Record<string, unknown> | null): string {
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
    dot: ACTION_DOT[entry.action],
  }));

  const fromNotes: TimelineItem[] = notes.map((note) => ({
    label: 'Internal note',
    time: note.createdAt,
    who: note.user ? `${note.user.firstName} ${note.user.lastName ?? ''}`.trim() : note.authorName,
    dot: 'bg-amber-400/70',
  }));

  const ephemeral: TimelineItem[] = inSession.map((entry) => ({ ...entry, dot: undefined }));

  return [...fromAudit, ...fromNotes, ...ephemeral].sort(
    (itemA, itemB) => new Date(itemA.time).getTime() - new Date(itemB.time).getTime()
  );
}

