/**
 * Activity-tab timeline: turns the thread's audit entries, notes and in-session
 * events into one chronological feed. Extracted from MessagePanelTabs so the
 * label mapping can be unit-tested (and to keep that component under max-lines).
 */
import { holdNoteLabel, holdNoteText, isHoldNote } from '@/lib/holdNote';
import { formatDay } from '@/lib/utils';
import {
  ASK_CHECK_REASON,
  ASK_WITHHELD_REASON,
  RULE_PLACEHOLDER_UNFILLED,
  WITHHELD_REASON,
  WOULD_SEND,
  autoReplyReasonLabel,
  autoReplyReasonWords,
} from './autoReplyReasons';
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
  // An old reply left "Sending…" was ended without being confirmed (the stale-send sweep).
  'message.reply_unconfirmed': 'An old reply was never confirmed as sent',
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
  // The same reply's delivery story: the reply's own dot.
  'message.reply_unconfirmed': 'out',
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
  // Where it went out, when the record says (backend 2026-11-23): a mailbox's fixed receipt
  // confirmation, the Telegram bot, the website chat.
  const path = details?.['replyPath'];
  if (path === 'acknowledgment' || details?.['source'] === 'acknowledgment')
    return 'Receipt confirmation sent automatically';
  if (path === 'telegram') return 'The Telegram bot answered';
  if (path === 'widget') return 'The website chat answered on its own';
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

/**
 * Why the AI's own reply was not sent (`source: 'ai_reply'`), where it is not a failed send: the
 * customer wrote again first, the spam check, or the send gate held it (the hold's own code).
 */
const AI_REPLY_WITHHELD_REASON: Record<string, string> = {
  newer_message: WITHHELD_REASON.newer_message,
  spam_verdict: WITHHELD_REASON.spam_verdict,
  reply_unchecked: 'the reply could not be checked',
  restricted_topic: WITHHELD_REASON.restricted_topic,
  hold_phrase: 'the reply contains a phrase this workspace holds',
  no_customer_request: 'the message is not a customer request',
  needs_lookup_or_action: 'answering needs a lookup or an action',
  refusal: 'the reply only declined the question',
  promises_follow_up: 'the reply promised a follow-up',
  does_not_answer: 'the reply did not answer the question',
  unsupported_by_sources: 'the reply said more than the knowledge base does',
  not_from_knowledge: 'the reply was not written from the knowledge base',
  source_other_team: "the reply was written from another team's knowledge",
};

/** A reason this bundle does not know (a newer backend): words, never the raw code. */
export const WITHHELD_REASON_UNKNOWN = 'it was held for a person';

/** A reply that was handed over for sending and may have reached the customer all the same. */
export const MAY_BE_DELIVERED = 'check before replying — the customer may already have it';
export const AI_REPLY_UNCERTAIN = `The automatic reply may not have been delivered: ${MAY_BE_DELIVERED}.`;
export const AI_REPLY_FAILED = 'The automatic reply could not be delivered.';
export const AUTO_REPLY_SENT_UNRECORDED =
  'The automatic reply was sent, but could not be recorded on the thread — check before replying, the customer already has it';

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
      : (known(ASK_WITHHELD_REASON, reason) ?? autoReplyReasonWords(reason));
  if (why) return `${ASK_NOT_SENT}: ${why}`;
  // A newer backend's outcome: its own sentence when it sent one, never a bare code.
  const sentence = reason === ASK_MODEL_CHECK ? '' : textOf(details, ['detail']);
  return sentence.includes(' ')
    ? `${ASK_NOT_SENT}. ${sentence}`
    : `${ASK_NOT_SENT}: ${WITHHELD_REASON_UNKNOWN}`;
};

/** The longest `why` an Activity line or an Audit row quotes (the backend caps it at 200 too). */
export const HOLD_WHY_MAX = 200;

/**
 * The check's own one line on why it held the reply (`details.why`: the meaning check on a keyword
 * rule's reply, the send gate's hold — "the reply states an amount with a unit of measure
 * (built-in hold rule)"), trimmed and capped; null when the record has none or it is not a sentence (one word
 * reads as a code, and a code is never shown).
 */
export const holdWhyOf = (details: Record<string, unknown> | null): string | null => {
  const raw = details?.['why'];
  if (typeof raw !== 'string') return null;
  const why = raw.replace(/\s+/g, ' ').trim();
  if (!why.includes(' ')) return null;
  return why.length > HOLD_WHY_MAX ? `${why.slice(0, HOLD_WHY_MAX - 1).trimEnd()}…` : why;
};

/**
 * A keyword rule matched and nothing was sent (BE `message.auto_reply_withheld`): two or more rules
 * matched (`several_rules`), or the matched rule's reply could not go out; or (`source: 'missing_info'`)
 * the email asking for missing information was not sent; or (`source: 'ai_reply'`) the AI's own
 * reply was sent and did not arrive, or may not have. An unknown reason reads "held for a
 * person", never the backend's code.
 */
export function autoReplyWithheldLabel(
  details: Record<string, unknown> | null,
  { withWhy = true }: { withWhy?: boolean } = {}
): string {
  const label = withheldLabel(details);
  // A hold the check explained: its own line after the reason (never on a check-only pass, a
  // sent reply or a failed send — those carry no `why`).
  const why = withWhy ? holdWhyOf(details) : null;
  return why ? `${label} — ${why}` : label;
}

function withheldLabel(details: Record<string, unknown> | null): string {
  const rawNames = details?.['ruleNames'];
  const names = Array.isArray(rawNames)
    ? rawNames.filter((name): name is string => typeof name === 'string' && name.length > 0)
    : [];
  const reason = typeof details?.['reason'] === 'string' ? details['reason'] : '';
  // `uncertain` (with send_failed): the transport cut off, so the email may have gone out.
  const uncertain = reason === 'send_failed' && details?.['uncertain'] === true;
  const path = details?.['replyPath'];
  // The mail went out; only its record on the thread could not be written (the backend counts
  // it as sent).
  if (details?.['sentUnrecorded'] === true) return AUTO_REPLY_SENT_UNRECORDED;
  // Check-only mode: nothing was held — the reply passed and was kept as the draft.
  if (reason === WOULD_SEND) {
    if (details?.['source'] === 'missing_info' || path === 'missing_info')
      return 'The email asking for missing information passed every check and would have been sent — check-only mode, so it was not sent';
    if (names.length > 0 || path === 'keyword_rule') {
      const rule = names.length > 0 ? `Keyword rule ${joinRuleNames(names)}` : 'A keyword rule';
      // A rule that adds a knowledge base answer says where it came from; a plain rule's reply
      // is the team's own text.
      const reply =
        typeof details?.['knowledgeSource'] === 'string' ? 'knowledge base answer' : 'reply';
      return `${rule}: its ${reply} passed every check and would have been sent — check-only mode, so it was not sent`;
    }
    return 'The AI reply passed every check and would have been sent — check-only mode, so it was kept as the draft';
  }
  if (path === 'telegram')
    return `The Telegram bot left this chat for a person: ${autoReplyReasonLabel(reason)}`;
  if (path === 'widget')
    return `The website chat's reply was held for a person: ${autoReplyReasonLabel(reason)}`;
  if (details?.['source'] === 'ai_reply') {
    if (reason !== 'send_failed')
      return `The automatic reply was not sent: ${known(AI_REPLY_WITHHELD_REASON, reason) ?? autoReplyReasonLabel(reason)}`;
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
  const why = known(WITHHELD_REASON, reason) ?? autoReplyReasonWords(reason);
  // The backend's own sentence: for an unfillable placeholder (it says what to do), and for an
  // outcome this bundle does not know — never a bare code.
  const sentence = textOf(details ?? {}, ['detail']);
  if (sentence.includes(' ') && (reason === RULE_PLACEHOLDER_UNFILLED || !why))
    return `${rule} matched but its reply did not go out. ${sentence}`;
  return `${rule} matched but its reply did not go out: ${why ?? WITHHELD_REASON_UNKNOWN}`;
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
