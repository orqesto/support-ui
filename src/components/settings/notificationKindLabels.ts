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

const sentenceCase = (raw: string): string => {
  const words = raw.replace(/[_:-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw;
};

/** Label for any line key; a key a newer server sends falls back to a words-from-the-key label. */
export const lineLabel = (key: string): string => {
  const NON_KIND: Record<string, string> = {
    onlyAssignedToMe: 'Only conversations assigned to me',
    slaMinSeverity: 'Minimum SLA severity',
    minPriority: 'Minimum priority',
    workingHours: 'Working hours',
  };
  if (NON_KIND[key]) return NON_KIND[key];
  const kind = key.startsWith('kind:') ? key.slice(5) : key;
  return NOTIFICATION_KIND_LABELS[kind] ?? sentenceCase(kind);
};
