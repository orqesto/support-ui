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
  autoReplyReasonLabel,
  autoReplyReasonWords,
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
];
const KEYWORD_RULE = ['would_send', 'sender_reply_limit'];
const MISSING_INFO = ['would_send'];
const TELEGRAM = [
  'plan-not-entitled',
  'restricted_topic',
  'refusal_held',
  'reply_unchecked',
  'rule_based_fallback',
  'no_knowledge_offered_support',
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
    const words = autoReplyReasonWords(code);
    expect(words).not.toBeNull();
    expect(words).toMatch(/ /);
    expect(showsACode(words ?? '', code)).toBe(false);
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
  it('says the check passed, with the numbers when stored, or that it was a fixed text', () => {
    expect(allowedByWords({ gate: 'passed', confidence: 0.93, threshold: 0.9 })).toBe(
      'it passed the check every automatic reply goes through (confidence 93%, needed 90%)'
    );
    expect(allowedByWords({ gate: 'passed' })).toBe(
      'it passed the check every automatic reply goes through'
    );
    expect(allowedByWords({ gate: 'fixed_text' })).toBe(
      'a fixed text written by your team, sent as it is'
    );
  });

  it('CONTROL: a record that does not say gives nothing', () => {
    expect(allowedByWords(undefined)).toBeNull();
    expect(allowedByWords({ gate: 'something_else' })).toBeNull();
  });
});
