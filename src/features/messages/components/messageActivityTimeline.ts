/**
 * Activity-tab timeline: turns the thread's audit entries, notes and in-session
 * events into one chronological feed. Extracted from MessagePanelTabs so the
 * label mapping can be unit-tested (and to keep that component under max-lines).
 */
import { holdNoteLabel, holdNoteText, isHoldNote } from '@/lib/holdNote';
import { formatDay } from '@/lib/utils';
import type { MessageActivityEntry, MessageNote } from '@/services/message.service';

/**
 * What kind of thing happened, for the row's dot (v4 `.a-dot.in/.out/.note/.ai`, else plain).
 * ⛔ Derived ONLY from what the data says: the audit action, a note, or an in-session note edit.
 * `ai`: an automatic answer sent to the customer (`message.auto_reply_sent`, 2026-11-13: the AI's
 * answer or a keyword rule's prepared reply). Auto-routing is rule-based and stays `other`.
 * `hold`: a hold note (the thread went on or came off hold) — violet, the On-hold colour, never
 * the amber of a note someone typed.
 */
export type ActivityKind = 'in' | 'out' | 'note' | 'hold' | 'ai' | 'other';

export type TimelineItem = { label: string; time: string; who: string; kind: ActivityKind };

/** The dot's colour per kind. Theme tokens only, so it holds in dark mode. */
export const ACTIVITY_DOT: Record<ActivityKind, string> = {
  in: 'bg-primary-solid',
  out: 'bg-success',
  note: 'bg-warning',
  hold: 'bg-pending',
  ai: 'bg-ai',
  other: 'bg-border-strong',
};

const ACTION_LABEL: Record<string, string> = {
  'message.reply': 'Reply sent',
  'message.assign': 'Assigned',
  'message.create': 'Message received',
  'message.delete': 'Thread deleted',
  'message.compose_new': 'New message composed',
  'message.manual_route': 'Manually routed',
  'ticket.create': 'Ticket created',
  'ticket.resolve': 'Resolved',
  'ticket.reopen': 'Reopened',
  'ticket.assign': 'Ticket assigned',
  'ticket.update': 'Ticket updated',
  'ticket.delete': 'Ticket deleted',
  'ticket.dept_moved': 'Moved to another team',
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
  'message.thanks_kept_finished': 'in',
  'message.reply': 'out',
  // An automatic answer that left: the AI dot, the only audit action the AI authors.
  'message.auto_reply_sent': 'ai',
  // An automatic answer that was held back (a keyword rule matched): same dot, it is its story.
  'message.auto_reply_withheld': 'ai',
  'message.compose_new': 'out',
};

export const activityKindOf = (action: string): ActivityKind => ACTION_KIND[action] ?? 'other';

/**
 * A date in a feed label, in the app's ONE day format (`formatDay`, the viewer's zone) — the
 * format the hold rows use too, so one view never shows a date two ways.
 */
const shortDate = (iso: unknown): string | null => {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatDay(date);
};

type RoutingRuleDetail = {
  value?: string | null;
  deleted?: boolean;
  acceptedBy?: { name?: string } | null;
  acceptedAt?: string | null;
  autoAccepted?: boolean;
  /** The rule's part of the route. Absent from a BE older than the share field. */
  share?: number;
};

/** Routes a rule's score chose (incl. legacy rows with no rule shares): worded "by a rule". */
const RULE_REASONS = new Set(['rule_strong', 'rule_ai_agree', 'rule_decisive']);
/** Routes the embedding similarity chose. */
const SIMILARITY_REASONS = new Set(['embedding_strong', 'embedding_override']);

type LiveRule = RoutingRuleDetail & { value: string };
const isLive = (rule: RoutingRuleDetail | undefined): rule is LiveRule =>
  typeof rule?.value === 'string' && !rule.deleted;
const hasShare = (rule: RoutingRuleDetail): boolean =>
  typeof rule.share === 'number' && Number.isFinite(rule.share);
const shareOf = (rule: RoutingRuleDetail): number =>
  hasShare(rule) ? (rule.share as number) : -Infinity;

/**
 * The live rule that carried the route: the largest share. With no shares (a BE older than the
 * field) this is the first live rule, as before — a strict `>` keeps the earlier rule on a tie.
 */
const leadingLiveRule = (rules: RoutingRuleDetail[]): LiveRule | undefined => {
  let leading: LiveRule | undefined;
  for (const rule of rules.filter(isLive)) {
    if (!leading || shareOf(rule) > shareOf(leading)) leading = rule;
  }
  return leading;
};

const isAccepted = (rule: RoutingRuleDetail): boolean =>
  !!rule.acceptedBy || rule.autoAccepted === true;

/** `by rule "<value>" (accepted by <name>, <date>)` — the parenthetical only when accepted. */
const byRule = (dept: string, rule: LiveRule): string => {
  const when = shortDate(rule.acceptedAt);
  const by = rule.acceptedBy?.name
    ? ` (accepted by ${rule.acceptedBy.name}${when ? `, ${when}` : ''})`
    : rule.autoAccepted
      ? ` (accepted automatically${when ? `, ${when}` : ''})`
      : '';
  return `Routed to ${dept} by rule "${rule.value}"${by}`;
};

/**
 * The synthetic entry GET /activity appends for an automatic route (spec 2026-10-14 §3.9, §9).
 * The wording follows the REASON, never whether `rules` is empty: legacy rule rows carry no
 * shares and must not read as a similarity route. Unknown reasons fall back to "automatically".
 * A similarity route whose largest-share live rule is an ACCEPTED rule names that rule (§9): the
 * accepted rule is what carried it. Without shares (older BE) a similarity route keeps the
 * similarity wording — the stored order cannot say which rule led.
 */
export function routingDecisionLabel(details: Record<string, unknown> | null): string {
  const dept =
    typeof details?.['departmentName'] === 'string' ? details['departmentName'] : 'a team';
  const reason = details?.['reason'];
  if (reason === 'sole_department') return `Routed to ${dept} — the only team for this mailbox`;
  if (reason === 'sender_history')
    return `Routed to ${dept} — where this sender’s mail usually goes`;
  if (reason === 'ai_primary') return `Routed to ${dept} by the AI classifier`;
  const rules = Array.isArray(details?.['rules']) ? (details['rules'] as RoutingRuleDetail[]) : [];
  const leading = leadingLiveRule(rules);
  if (typeof reason === 'string' && SIMILARITY_REASONS.has(reason)) {
    return leading && hasShare(leading) && isAccepted(leading)
      ? byRule(dept, leading)
      : `Routed to ${dept} by similarity to earlier threads`;
  }
  if (typeof reason !== 'string' || !RULE_REASONS.has(reason))
    return `Routed to ${dept} automatically`;
  if (leading) return byRule(dept, leading);
  return rules.length > 0
    ? `Routed to ${dept} by a rule that has since been deleted`
    : `Routed to ${dept} by a rule`;
}

/**
 * A status as the feed says it. `pending` in a status change is the On-hold overlay (the hold
 * dialog sets it; the thread's own status is left alone), so it reads "On hold", as the app calls it.
 */
const statusWord = (status: unknown): string | undefined => {
  if (typeof status !== 'string' || !status) return undefined;
  return status === 'pending' ? 'On hold' : status;
};

/**
 * An auto-reply went to the customer (BE `message.auto_reply_sent`, 2026-11-13): a keyword rule's
 * prepared reply names its rule and the keyword that matched; otherwise it was the AI's answer.
 */
export function autoReplySentLabel(details: Record<string, unknown> | null): string {
  const ruleName = details?.['ruleName'];
  const keyword = details?.['keyword'];
  const resolved = details?.['toStatus'] === 'resolved' ? ' — resolved' : '';
  if (typeof ruleName === 'string' && ruleName) {
    const matched = typeof keyword === 'string' && keyword ? ` (keyword "${keyword}")` : '';
    const withKb =
      typeof details?.['knowledgeSource'] === 'string' ? ' with a knowledge base answer' : '';
    return `Auto-reply sent by rule "${ruleName}"${matched}${withKb}${resolved}`;
  }
  // The AI's "need more information" question (the status is left as it was).
  if (details?.['source'] === 'missing_info')
    return `Asked the customer for missing information (auto-reply)${resolved}`;
  return `AI auto-reply sent${resolved}`;
}

/** Why a matched keyword rule's reply did not go out, in plain words (BE autoReplyOutcome). */
const WITHHELD_REASON: Record<string, string> = {
  send_failed: 'the email could not be sent',
  thread_locked: 'another reply was in progress',
  kb_error: 'the knowledge base search failed',
  kb_no_source: 'no knowledge base answer was sure enough',
  kb_below_threshold: 'no knowledge base answer was sure enough',
  kb_not_grounded: 'the knowledge base answer could not be checked',
  ai_drafts_off: 'AI drafts are off',
  plan_not_entitled: "the plan's auto-reply limit",
  plan_allotment_reached: "the plan's auto-reply limit",
  workspace_blocked: 'the workspace is waiting for a plan',
  kb_placeholder_in_plain_rule: 'the reply still holds {{kb_answer}}',
  // The reply check held the knowledge base answer (2026-11-20).
  kb_refusal: 'the knowledge base answer only declined the question',
  kb_reply_unchecked: 'the knowledge base answer could not be checked',
  kb_content_unchecked: 'the knowledge base answer could not be checked',
  // The send gate held the reply (2026-11-20): the knowledge base answer (`kb_…`), or a plain
  // prepared reply for what the customer asked.
  kb_restricted_topic: 'the customer asks about a subject a person must answer',
  kb_no_customer_request: 'the message is not a customer request',
  kb_needs_lookup_or_action: 'answering needs a lookup or an action',
  kb_promises_follow_up: 'the knowledge base answer promised a follow-up',
  kb_does_not_answer: 'the knowledge base answer did not answer the question',
  kb_unsupported_by_sources: 'the answer said more than the knowledge base does',
  restricted_topic: 'the customer asks about a subject a person must answer',
  question_unchecked: 'the question could not be checked for a restricted topic',
};

/** A reason this bundle does not know (a newer backend): words, never the raw code. */
export const WITHHELD_REASON_UNKNOWN = 'it was held for a person';

/** A reply that was handed over for sending and may have reached the customer all the same. */
export const MAY_BE_DELIVERED = 'check before replying — the customer may already have it';
export const AI_REPLY_UNCERTAIN = `The automatic reply may not have been delivered: ${MAY_BE_DELIVERED}.`;
export const AI_REPLY_FAILED = 'The automatic reply could not be delivered.';

/**
 * Why the email asking the customer for missing information was not sent (BE followUpEmailHelper:
 * `source: 'missing_info'`, `reason` = the outcome). Every outcome the backend stores; one this
 * bundle does not know reads as the backend's own sentence (`detail`), or as unknown.
 */
const ASK_WITHHELD_REASON: Record<string, string> = {
  send_failed: WITHHELD_REASON.send_failed,
  thread_locked: WITHHELD_REASON.thread_locked,
  ai_drafts_off: WITHHELD_REASON.ai_drafts_off,
  workspace_blocked: WITHHELD_REASON.workspace_blocked,
  plan_not_entitled: 'the plan does not include automatic replies',
  plan_allotment_reached: "this month's automatic replies are used up",
  ai_reply_limit: 'an automatic reply was already sent on this thread',
  no_thread: 'there is no customer message to answer',
  nothing_to_ask: 'the AI found no detail to ask for',
  pre_send_timeout: 'a step before sending took too long',
  spam_verdict: 'the spam check did not clear this email',
  blocked_pre_gate: 'this thread is not one that gets an automatic reply',
  blocked_escalation_phrase: "the customer's email contains a phrase that stops automatic replies",
  blocked_degraded_analysis: 'the AI could not read this email properly',
  blocked_unsupported_language: 'the email is in a language the question is not written in',
  blocked_missing_info_guard: 'a question the AI wrote did more than ask for a detail',
};

/** `blocked_missing_info_model_check`: what the check on the email found (`checkReason`). */
const ASK_CHECK_REASON: Record<string, string> = {
  ask_unchecked: "the email's questions could not be checked",
  'check failed': "the email's questions could not be checked",
  restricted_topic:
    'the customer asks about a subject a person must answer, so nothing was asked automatically',
  no_customer_request: 'the message is not a customer request',
  not_only_asking: 'a question in the email did more than ask for a detail',
};
const ASK_MODEL_CHECK = 'blocked_missing_info_model_check';
const ASK_NOT_SENT = 'The email asking for missing information was not sent';

const known = (map: Record<string, string>, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/** "A", "A" and "B", "A", "B" and "C". */
const joinRuleNames = (names: string[]): string => {
  const quoted = names.map((name) => `"${name}"`);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
};

/** The first of `keys` that holds text in `details` (the check's reason was `detail` at first). */
const textOf = (details: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
};

/** The withheld missing-info email, in words. */
const askWithheldLabel = (
  details: Record<string, unknown>,
  reason: string,
  uncertain: boolean
): string => {
  if (uncertain)
    return `The email asking for missing information may not have been delivered: ${MAY_BE_DELIVERED}`;
  const why =
    reason === ASK_MODEL_CHECK
      ? known(ASK_CHECK_REASON, textOf(details, ['checkReason', 'detail']))
      : known(ASK_WITHHELD_REASON, reason);
  if (why) return `${ASK_NOT_SENT}: ${why}`;
  // A newer backend's outcome: its own sentence when it sent one, never a bare code.
  const sentence = reason === ASK_MODEL_CHECK ? '' : textOf(details, ['detail']);
  return sentence.includes(' ')
    ? `${ASK_NOT_SENT}. ${sentence}`
    : `${ASK_NOT_SENT}: ${WITHHELD_REASON_UNKNOWN}`;
};

/**
 * A keyword rule matched and nothing was sent (BE `message.auto_reply_withheld`): two or more rules
 * matched (`several_rules`), or the matched rule's reply could not go out; or (`source: 'missing_info'`)
 * the email asking for missing information was not sent; or (`source: 'ai_reply'`) the AI's own
 * reply was sent and did not arrive, or may not have. An unknown reason reads "held for a
 * person", never the backend's code.
 */
export function autoReplyWithheldLabel(details: Record<string, unknown> | null): string {
  const rawNames = details?.['ruleNames'];
  const names = Array.isArray(rawNames)
    ? rawNames.filter((name): name is string => typeof name === 'string' && name.length > 0)
    : [];
  const reason = typeof details?.['reason'] === 'string' ? details['reason'] : '';
  // `uncertain` (with send_failed): the transport cut off, so the email may have gone out.
  const uncertain = reason === 'send_failed' && details?.['uncertain'] === true;
  if (details?.['source'] === 'ai_reply') {
    if (reason !== 'send_failed')
      return `The automatic reply was not sent: ${WITHHELD_REASON_UNKNOWN}`;
    return uncertain ? AI_REPLY_UNCERTAIN : AI_REPLY_FAILED;
  }
  if (details?.['source'] === 'missing_info') return askWithheldLabel(details, reason, uncertain);
  if (reason === 'several_rules') {
    if (names.length < 2) return 'No auto-reply: more than one keyword rule matched';
    const verb = names.length === 2 ? 'both matched' : 'all matched';
    return `No auto-reply: rules ${joinRuleNames(names)} ${verb}`;
  }
  const rule = names.length > 0 ? `Keyword rule ${joinRuleNames(names)}` : 'A keyword rule';
  if (uncertain)
    return `${rule} matched but its reply may not have been delivered: ${MAY_BE_DELIVERED}`;
  const why = known(WITHHELD_REASON, reason) ?? WITHHELD_REASON_UNKNOWN;
  return `${rule} matched but its reply did not go out: ${why}`;
}

export function auditEntryLabel(action: string, details: Record<string, unknown> | null): string {
  if (action === 'routing.decision') return routingDecisionLabel(details);
  if (action === 'message.auto_reply_sent') return autoReplySentLabel(details);
  if (action === 'message.auto_reply_withheld') return autoReplyWithheldLabel(details);
  if (action === 'message.status_change') {
    const from = statusWord(details?.['from']);
    const to = statusWord(details?.['to']);
    return to ? `Status changed${from ? ` from ${from}` : ''} to ${to}` : 'Status changed';
  }
  if (action === 'message.priority_change') {
    const to = details?.['to'] as string | undefined;
    return to ? `Priority set to ${to}` : 'Priority changed';
  }
  if (action === 'message.category_change') {
    return details?.['to'] ? 'Category assigned' : 'Category removed';
  }
  // The customer only said thanks, so the thread stayed finished (owner 2026-10-30).
  if (action === 'message.thanks_kept_finished') {
    const status = details?.['status'] as string | undefined;
    // The thanks reopened the thread at save; the reply check then found no reply needed and set
    // it back (owner 2026-11-19, N1).
    if (details?.['reason'] === 'no_reply_verdict')
      return `Customer said thanks — no reply needed, back to ${status ?? 'resolved'}`;
    return `Customer said thanks — kept ${status ?? 'resolved'}`;
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
    return 'Thread updated';
  }
  return ACTION_LABEL[action] ?? action;
}

/** "Taken off hold: <cause>" / "Taken off hold by <name> (<cause>)", as the backend writes it. */
const UNHOLD_TEXT = /^Taken off hold(?:: (.+)| by .+ \((.+)\))$/s;

/**
 * The cause of an un-hold, read from the note's text — the backend's own words (holdNoteText.ts,
 * `unholdNoteContent`), which can be more exact than `metadata.cause` ("status changed to
 * resolved"). No copy of the backend's phrase table here: a cause it adds is shown without a
 * frontend change. Null when the text is not that shape.
 */
export const unholdCause = (content: string): string | null => {
  const match = UNHOLD_TEXT.exec(content.trim());
  const cause = (match?.[1] ?? match?.[2])?.trim();
  if (!cause) return null;
  return cause;
};

/**
 * A hold note's Activity row: "On hold until 12 Nov 2026: <reason>" (the viewer's day, built from
 * metadata; plain "On hold" when that is missing) or "Off hold · <cause>" ("Off hold" alone when
 * the cause is unknown).
 */
const holdActivityLabel = (note: MessageNote): string => {
  const label = holdNoteLabel(note);
  if (label !== 'Off hold') return holdNoteText({ ...note, content: label });
  const cause = unholdCause(note.content);
  return cause ? `${label} · ${cause}` : label;
};

/** How far apart a status change and the hold note it wrote may be (same request; slack for a sweep). */
const SAME_EVENT_MS = 60_000;

/**
 * Whether a status change and a hold note are ONE event, told by what the note itself says:
 *  - a change TO `pending` is the hold a `kind: 'hold'` note records;
 *  - a change FROM `pending` is an un-hold (a `kind: 'unhold'` note);
 *  - a change made through the status control writes its un-hold note in the same request, naming
 *    it: "… (status changed to resolved)" (a change to resolved/closed) or "… (reopened)" (to
 *    open). ⚠ The backend's `from` there is the thread's flow status (`awaiting_response`, …),
 *    not `pending`: hold is an overlay on it (messageNotesController.setMessageStatus), so `from`
 *    alone cannot pair it.
 * Any other change is never folded: a resolve right after "Taken off hold: customer replied" is
 * its own row (review of #902).
 */
const sameEvent = (entry: MessageActivityEntry, note: MessageNote): boolean => {
  const kind = note.metadata?.['kind'];
  const { from, to } = entry.details ?? {};
  if (to === 'pending') return kind === 'hold';
  if (kind !== 'unhold') return false;
  if (from === 'pending') return true;
  const cause = unholdCause(note.content);
  return (
    (typeof to === 'string' && cause === `status changed to ${to}`) ||
    (to === 'open' && cause === 'reopened')
  );
};

/**
 * The `message.status_change` entries that ARE a hold or un-hold already shown by its hold note:
 * one hold showed twice ("Status changed from open to On hold" + "On hold until …"). A change
 * pairs with a hold note of the same event (`sameEvent`) within SAME_EVENT_MS, each note used
 * once (nearest first). Status changes with no such note stay.
 */
const statusChangesShownByHoldNotes = (
  activity: MessageActivityEntry[],
  notes: MessageNote[]
): Set<MessageActivityEntry> => {
  const unused = notes.filter(isHoldNote);
  const shown = new Set<MessageActivityEntry>();
  for (const entry of activity) {
    if (entry.action !== 'message.status_change') continue;
    const at = new Date(entry.createdAt).getTime();
    let best = -1;
    let bestGap = Infinity;
    unused.forEach((note, index) => {
      if (!sameEvent(entry, note)) return;
      const gap = Math.abs(new Date(note.createdAt).getTime() - at);
      if (gap <= SAME_EVENT_MS && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best >= 0) {
      unused.splice(best, 1);
      shown.add(entry);
    }
  }
  return shown;
};

export function buildTimeline(
  activity: MessageActivityEntry[],
  notes: MessageNote[],
  inSession: { label: string; who: string; time: string }[]
): TimelineItem[] {
  const shownByNote = statusChangesShownByHoldNotes(activity, notes);
  const fromAudit: TimelineItem[] = activity
    .filter((entry) => !shownByNote.has(entry))
    .map((entry) => ({
      label: auditEntryLabel(entry.action, entry.details),
      time: entry.createdAt,
      who: entry.userEmail ?? 'System',
      kind: activityKindOf(entry.action),
    }));

  const fromNotes: TimelineItem[] = notes.map((note) => {
    const hold = isHoldNote(note);
    return {
      label: hold ? holdActivityLabel(note) : 'Internal note',
      time: note.createdAt,
      who: note.user
        ? `${note.user.firstName} ${note.user.lastName ?? ''}`.trim()
        : note.authorName,
      kind: hold ? 'hold' : 'note',
    };
  });

  // In-session entries are the agent's own note edits and deletions (MessageDetail).
  const ephemeral: TimelineItem[] = inSession.map((entry) => ({ ...entry, kind: 'note' }));

  return [...fromAudit, ...fromNotes, ...ephemeral].sort(
    (itemA, itemB) => new Date(itemA.time).getTime() - new Date(itemB.time).getTime()
  );
}
