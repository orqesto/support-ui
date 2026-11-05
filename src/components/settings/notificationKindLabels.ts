import type { WorkingHours } from '@/services/notificationSettingsService';

/** Shared choices for the minimum-priority and minimum-severity lines (prefs page, admin page). */
export const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));
export const SEVERITY_OPTIONS = [
  { value: 'warning', label: 'All (warning+)' },
  { value: 'critical', label: 'Critical only' },
];
export const severityLabel = (value: string): string =>
  SEVERITY_OPTIONS.find((opt) => opt.value === value)?.label ?? value;

export const isHours = (val: unknown): val is WorkingHours =>
  typeof val === 'object' && val !== null && Array.isArray((val as WorkingHours).days);

/** Plain-words names for the bell kinds a notification line can switch (line key = `kind:<kind>`). */
export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  conversation_assigned: 'Assigned to me',
  customer_message_on_assigned: 'Customer reply on my thread',
  conversation_reopened: 'Thread reopened',
  hold_recheck_due: 'Hold recheck due',
  new_unassigned_message: 'New unassigned mail',
  sla_message_breach: 'SLA: message breach',
  sla_ticket_first_response: 'SLA: ticket first response',
  sla_ticket_resolution: 'SLA: ticket resolution',
  suspicious_arrival: 'Suspicious mail arrived',
  spam_arrival: 'Spam arrived',
  one_sided_outbound: 'Mail sent but no replies received',
  customer_reply_in_spam: 'Customer reply landed in spam',
  kb_review_pending: 'Knowledge base capture waiting for review',
  kb_consolidation_pending: 'Knowledge base merge waiting for review',
  kb_document_stale: 'Knowledge base document out of date',
  ingestion_dark: 'Mailbox stopped receiving mail',
  ingestion_gap: 'Gap in imported mail',
  ai_provider_down: "Workspace's own AI key failing",
  ai_token_limit_reached: 'AI token limit reached',
  mailbox_address_undeclared: 'Mailbox address not declared',
  slack_connection_broken: 'Slack connection broken',
};

/**
 * Slack words these alerts as the message a channel sees, so a few differ from the bell's names.
 * Every other kind uses the shared name (notificationKindLabels.ts) — one definition, no drift.
 * An entry here must differ from the shared name; the same words twice is a copy that can rot.
 */
export const SLACK_KIND_WORDING: Record<string, string> = {
  new_unassigned_message: 'New customer message on an unassigned conversation',
  customer_message_on_assigned: 'New customer message on an assigned conversation',
  conversation_reopened: 'Conversation reopened by the customer',
  sla_message_breach: 'Conversation SLA about to breach or breached',
  sla_ticket_first_response: 'Ticket first-response SLA about to breach or breached',
  sla_ticket_resolution: 'Ticket resolution SLA about to breach or breached',
  conversation_assigned: 'Conversation assigned to someone',
  customer_reply_in_spam: 'Customer reply landed in the spam folder',
};
export const SLACK_KIND_LABELS: Record<string, string> = {
  ...NOTIFICATION_KIND_LABELS,
  ...SLACK_KIND_WORDING,
};

const sentenceCase = (raw: string): string => {
  const words = raw.replace(/[_:-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw;
};

/** Label for any line key; a key a newer server sends falls back to a words-from-the-key label. */
export const lineLabel = (key: string): string => {
  const NON_KIND: Record<string, string> = {
    onlyAssignedToMe: 'Only threads assigned to me',
    slaMinSeverity: 'Minimum SLA severity',
    minPriority: 'Minimum priority',
    workingHours: 'Working hours',
  };
  if (NON_KIND[key]) return NON_KIND[key];
  const kind = key.startsWith('kind:') ? key.slice(5) : key;
  return NOTIFICATION_KIND_LABELS[kind] ?? sentenceCase(kind);
};
