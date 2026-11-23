/**
 * No reason code of an automatic reply is ever shown as a code. Every code the backend's contract
 * (wave 2, 2026-11-23) lists for an automatic reply's record has words of its own, and the two
 * places that say why — the Activity line (also drawn in Audit Logs) and the review flag — print
 * words for each. A code no bundle knows reads "it was held for a person".
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_REPLY_REASON_FILTERS,
  AUTO_REPLY_REASON_UNKNOWN,
  allowedByWords,
  anyAutoReplyReasonLabel,
  autoReplyReasonLabel,
  autoReplyReasonWords,
  reasonFilterQuery,
} from '../autoReplyReasons';
import { autoReplySentLabel, autoReplyWithheldLabel } from '../messageActivityTimeline';
import { NEEDS_REVIEW_REASON_LABELS } from '../aiFlagCopy';

/** The contract's reason codes, per writer (§2 "Who writes what"). */
const EMAIL_AI = [
  'would_send',
  'restricted_topic',
  'reply_unchecked',
  'needs_lookup_or_action',
  'no_customer_request',
  'promises_follow_up',
  'does_not_answer',
  'unsupported_by_sources',
  'not_from_knowledge',
  'spam_verdict',
  'low_confidence',
  'partial_answer',
  'plan_not_entitled',
  'plan_allotment_reached',
  'refusal',
  'gate:blocked_source_link',
  'gate:blocked_dept_setting',
  'gate:blocked_escalation_phrase',
  'gate:blocked_reply_hygiene',
  'send_gate:not_from_knowledge',
  'sender_reply_limit',
  'newer_message',
  'send_failed',
  'settings_changed',
];
const KEYWORD_RULE = ['would_send', 'sender_reply_limit'];
const MISSING_INFO = ['would_send', 'settings_changed', 'plan_limit'];
const TELEGRAM = [
  'plan-not-entitled',
  'restricted_topic',
  'refusal_held',
  'reply_unchecked',
  'rule_based_fallback',
  'no_knowledge_offered_support',
  // The contract's closed set for a Telegram turn (`other` carries no words of its own).
  'success',
  'greeting_rule_match',
  'clarification_needed',
  'order_status',
  'order_status_during_handoff',
  'out_of_scope',
  'escalation_requested',
  'escalation_confirmed',
  'escalation_confirmed_delayed',
  'delayed_escalation_confirmed',
  'low_confidence_offered_support',
  'low_confidence',
  'no_answer',
  'out_of_scope_held',
  'low_relevance_hallucination',
  'generation_failed',
  'send_failed',
  'flood',
  'error',
  'plan-allotment-reached',
  'needs_lookup_or_action',
  'promises_follow_up',
  'unsupported_by_sources',
  'no_customer_request',
  'does_not_answer',
];
const WIDGET = [
  'answered',
  'reply_unchecked',
  'restricted_topic',
  'needs_lookup_or_action',
  'blocked_gate',
  'promises_follow_up',
  'unsupported_by_sources',
];
/** The review-flag codes the contract's fixed rules set (no new code was added in the wave). */
const REVIEW_FLAGS = ['ai_reply_limit', 'restricted_topic', 'does_not_answer', 'reply_unchecked'];

const ALL = [...new Set([...EMAIL_AI, ...KEYWORD_RULE, ...MISSING_INFO, ...TELEGRAM, ...WIDGET])];
/** A code on screen: the code itself, or anything shaped like one. */
const showsACode = (text: string, code: string) =>
  (/[_:-]/.test(code) && text.includes(code)) ||
  /[a-z]+_[a-z_]+|[a-z]+:[a-z]/.test(text.replace(/check-only/g, ''));

describe('every reason code of the contract has words', () => {
  it.each(ALL)('%s', (code) => {
    const words = anyAutoReplyReasonLabel(code);
    expect(words).not.toBe(AUTO_REPLY_REASON_UNKNOWN);
    expect(words).toMatch(/ /);
    expect(showsACode(words, code)).toBe(false);
  });

  it('a Telegram turn stored as `other` (its own code is in `rawReason`) reads as held for a person', () => {
    expect(anyAutoReplyReasonLabel('other')).toBe(AUTO_REPLY_REASON_UNKNOWN);
    expect(
      autoReplyWithheldLabel({ replyPath: 'telegram', reason: 'other', rawReason: 'x_y' })
    ).toBe('The Telegram bot left this chat for a person: it was held for a person');
  });

  it('CONTROL: a code nobody knows reads as held for a person, never as itself', () => {
    expect(autoReplyReasonWords('brand_new_code')).toBeNull();
    expect(autoReplyReasonLabel('brand_new_code')).toBe(AUTO_REPLY_REASON_UNKNOWN);
    expect(autoReplyReasonLabel(undefined)).toBe(AUTO_REPLY_REASON_UNKNOWN);
  });

  it('the filter offers "would have been sent" first, and only codes that have words', () => {
    expect(AUTO_REPLY_REASON_FILTERS[0]).toEqual({
      value: 'would_send',
      label: 'Would have been sent (check-only mode)',
    });
    for (const option of AUTO_REPLY_REASON_FILTERS) {
      expect(autoReplyReasonWords(option.value)).not.toBeNull();
      expect(showsACode(option.label, option.value)).toBe(false);
    }
  });
});

describe('the Activity line (also the Audit Logs row) never prints a code', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ...EMAIL_AI.map((reason): [string, Record<string, unknown>] => [
      `email AI · ${reason}`,
      { source: 'ai_reply', replyPath: 'ai', channel: 'email', reason, ruleIds: [], ruleNames: [] },
    ]),
    ...KEYWORD_RULE.map((reason): [string, Record<string, unknown>] => [
      `keyword rule · ${reason}`,
      { replyPath: 'keyword_rule', channel: 'email', reason, ruleIds: [3], ruleNames: ['Refunds'] },
    ]),
    ...MISSING_INFO.map((reason): [string, Record<string, unknown>] => [
      `missing info · ${reason}`,
      { source: 'missing_info', replyPath: 'missing_info', reason, ruleIds: [], ruleNames: [] },
    ]),
    ...TELEGRAM.map((reason): [string, Record<string, unknown>] => [
      `telegram · ${reason}`,
      { replyPath: 'telegram', channel: 'telegram', reason },
    ]),
    ...WIDGET.map((reason): [string, Record<string, unknown>] => [
      `website chat · ${reason}`,
      { replyPath: 'widget', channel: 'chat_widget', reason },
    ]),
    ['a code nobody knows', { source: 'ai_reply', reason: 'brand_new_code' }],
    ['telegram, a code nobody knows', { replyPath: 'telegram', reason: 'brand_new_code' }],
  ];
  it.each(cases)('%s', (_name, details) => {
    const line = autoReplyWithheldLabel(details);
    expect(showsACode(line, String(details.reason))).toBe(false);
    expect(line).toMatch(/ /);
  });

  it('a would-send entry says it passed and was not sent, for each kind of reply', () => {
    expect(autoReplyWithheldLabel({ source: 'ai_reply', reason: 'would_send' })).toBe(
      'The AI reply passed every check and would have been sent — check-only mode, so it was kept as the draft'
    );
    expect(
      autoReplyWithheldLabel({ reason: 'would_send', ruleNames: ['Refunds'], ruleIds: [3] })
    ).toMatch(
      /^Keyword rule "Refunds": its knowledge base answer passed every check and would have been sent/
    );
    expect(autoReplyWithheldLabel({ source: 'missing_info', reason: 'would_send' })).toMatch(
      /^The email asking for missing information passed every check and would have been sent/
    );
  });

  it('a sent entry names where it went out when the record says', () => {
    expect(autoReplySentLabel({ replyPath: 'acknowledgment', source: 'acknowledgment' })).toBe(
      'Receipt confirmation sent automatically'
    );
    expect(autoReplySentLabel({ replyPath: 'telegram', reason: 'success' })).toBe(
      'The Telegram bot answered'
    );
    expect(autoReplySentLabel({ replyPath: 'widget', reason: 'answered' })).toBe(
      'The website chat answered on its own'
    );
    // CONTROL: an entry from before the wave reads as before.
    expect(autoReplySentLabel({ source: 'documentation', toStatus: 'open' })).toBe(
      'AI auto-reply sent'
    );
  });
});

describe('the review flags the fixed rules set have labels', () => {
  it.each(REVIEW_FLAGS)('%s', (code) => {
    expect(NEEDS_REVIEW_REASON_LABELS[code]).toMatch(/ /);
  });
});

describe('why a sent reply was allowed', () => {
  it('says the check passed, with the numbers when stored (both 0–1)', () => {
    expect(allowedByWords({ gate: 'passed', confidence: 0.93, threshold: 0.9 })).toBe(
      'it passed the check every automatic reply goes through (confidence 93%, needed 90%)'
    );
    expect(allowedByWords({ gate: 'passed' })).toBe(
      'it passed the check every automatic reply goes through'
    );
    // A number that is not on the 0–1 scale is not guessed at: no number is shown.
    expect(allowedByWords({ gate: 'passed', confidence: 93 })).toBe(
      'it passed the check every automatic reply goes through'
    );
  });

  it('a fixed text is the team’s own only for a keyword rule or a receipt confirmation', () => {
    expect(allowedByWords({ gate: 'fixed_text' }, true)).toBe(
      'a fixed text written by your team, sent as it is'
    );
    // A bot's fixed line (Telegram, the website chat).
    expect(allowedByWords({ gate: 'fixed_text' })).toBe('a fixed text, not written by the AI');
  });

  it('CONTROL: a record that does not say gives nothing', () => {
    expect(allowedByWords(undefined)).toBeNull();
    expect(allowedByWords({ gate: 'something_else' })).toBeNull();
  });
});

describe('the counts card words every code the rows word', () => {
  /** Codes of older holds, of a keyword rule and the missing-info email, and of a Telegram turn. */
  const CARD_CODES = [
    'kb_no_source',
    'kb_below_threshold',
    'kb_not_grounded',
    'kb_content_unchecked',
    'kb_placeholder_in_plain_rule',
    'ai_drafts_off',
    'workspace_blocked',
    'ai_reply_limit',
    'no_thread',
    'nothing_to_ask',
    'pre_send_timeout',
    'blocked_pre_gate',
    'blocked_degraded_analysis',
    'blocked_unsupported_language',
    'blocked_missing_info_guard',
    'blocked_missing_info_model_check',
    'escalation_confirmed_delayed',
    'greeting_rule_match',
    'ai_error',
    ...ALL,
  ];
  it.each(CARD_CODES)('%s', (code) => {
    const words = anyAutoReplyReasonLabel(code);
    expect(words).not.toBe(AUTO_REPLY_REASON_UNKNOWN);
    expect(words).toMatch(/ /);
    expect(/[a-z]+_[a-z_]+/.test(words.replace(/\{\{kb_answer\}\}/g, ''))).toBe(false);
  });

  it('`unknown` (a Telegram turn that left no reason) and a code nobody knows read as held for a person', () => {
    expect(anyAutoReplyReasonLabel('unknown')).toBe(AUTO_REPLY_REASON_UNKNOWN);
    expect(anyAutoReplyReasonLabel('brand_new_code')).toBe(AUTO_REPLY_REASON_UNKNOWN);
  });

  it('CONTROL: the Activity line still does not borrow a keyword rule’s code for the AI reply', () => {
    expect(autoReplyReasonWords('kb_no_source')).toBeNull();
    expect(autoReplyWithheldLabel({ source: 'ai_reply', reason: 'kb_refusal' })).toBe(
      'The automatic reply was not sent: it was held for a person'
    );
  });
});

describe('one reason, every spelling it is stored under', () => {
  it.each([
    ['not_from_knowledge', 'not_from_knowledge,send_gate:not_from_knowledge'],
    ['plan_not_entitled', 'plan_not_entitled,plan-not-entitled'],
    ['refusal', 'refusal,refusal_held,kb_refusal,blocked_gate'],
    [
      'reply_unchecked',
      'reply_unchecked,kb_reply_unchecked,question_unchecked,kb_content_unchecked',
    ],
    ['restricted_topic', 'restricted_topic,kb_restricted_topic'],
  ])('%s', (reason, query) => {
    expect(reasonFilterQuery(reason)).toBe(query);
  });

  it('every spelling of a filter reads as the same words', () => {
    for (const option of AUTO_REPLY_REASON_FILTERS) {
      const words = (reasonFilterQuery(option.value) ?? '')
        .split(',')
        .map((code) => anyAutoReplyReasonLabel(code));
      // `kb_…` spellings word the knowledge base answer instead of "the reply": same reason.
      expect(
        new Set(words.map((text) => text.replace('knowledge base answer', 'reply'))).size
      ).toBeLessThanOrEqual(2);
      expect(words).not.toContain(AUTO_REPLY_REASON_UNKNOWN);
    }
  });

  it('CONTROL: a reason with one spelling is sent as it is; none is none', () => {
    expect(reasonFilterQuery('would_send')).toBe('would_send');
    expect(reasonFilterQuery(undefined)).toBeUndefined();
  });

  it('a reply that was sent but could not be recorded is not called a hold', () => {
    expect(
      autoReplyWithheldLabel({ source: 'ai_reply', reason: 'send_failed', sentUnrecorded: true })
    ).toMatch(/^The automatic reply was sent, but could not be recorded on the thread/);
    // CONTROL: a send that failed reads as before.
    expect(autoReplyWithheldLabel({ source: 'ai_reply', reason: 'send_failed' })).toBe(
      'The automatic reply could not be delivered.'
    );
  });
});
