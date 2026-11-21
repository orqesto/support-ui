import { describe, it, expect } from 'vitest';
import { activityKindOf, auditEntryLabel, buildTimeline } from '../messageActivityTimeline';
import type { MessageActivityEntry } from '@/services/message.service';
import { formatDay } from '@/lib/utils';

// Feed dates are the app's one day format (formatDay, the viewer's zone) — as the hold rows.
const OCT_13 = formatDay('2026-10-13T02:00:00Z');
const OCT_14 = formatDay('2026-10-14T09:00:00Z');
const OCT_15 = formatDay('2026-10-15T08:00:00Z');

const entry = (
  action: string,
  details: Record<string, unknown> | null,
  createdAt = '2026-08-20T10:00:00.000Z'
): MessageActivityEntry =>
  ({
    id: 1,
    action,
    details,
    createdAt,
    userEmail: 'agent@example.com',
    userId: 7,
  }) as MessageActivityEntry;

describe('messageActivityTimeline — read/unread entries', () => {
  // Read state is shared across the org, so "who marked this read" is team-visible
  // history rather than a private toggle — it has to render as words, not as the
  // raw audit action string.
  it('labels a read change in both directions', () => {
    expect(auditEntryLabel('message.read_change', { isRead: true })).toBe('Marked as read');
    expect(auditEntryLabel('message.read_change', { isRead: false })).toBe('Marked as unread');
  });

  it('does not fall through to the raw action name', () => {
    expect(auditEntryLabel('message.read_change', { isRead: true })).not.toBe(
      'message.read_change'
    );
    expect(auditEntryLabel('message.read_change', null)).toBe('Marked as unread');
  });

  it('carries the acting agent into the timeline', () => {
    const [item] = buildTimeline([entry('message.read_change', { isRead: true })], [], []);
    expect(item.label).toBe('Marked as read');
    expect(item.who).toBe('agent@example.com');
  });

  it('still renders unmapped actions verbatim', () => {
    expect(auditEntryLabel('message.something_new', null)).toBe('message.something_new');
  });
});

describe('messageActivityTimeline — reopen entries written by the repairs', () => {
  it('every entry a repair writes reads as one neutral label, whatever its reason or how', () => {
    for (const via of ['lost_job_repair', 'bounce_repair'])
      for (const details of [
        {
          reason: 'stranded_mail_restored',
          how: 'restored',
          fromStatus: 'closed',
          toStatus: 'closed',
        },
        { reason: 'customer_replied', how: 'restored', fromStatus: 'closed', toStatus: 'open' },
        { reason: 'customer_replied', how: 'revived', fromStatus: 'open', toStatus: 'open' },
        { reason: 'customer_replied', how: 'reopened', fromStatus: 'resolved', toStatus: 'open' },
      ])
        expect(auditEntryLabel('message.auto_reopen', { ...details, via })).toBe(
          'Restored by a repair — mail left on a merged-away ticket'
        );
  });

  it('a thank-you that kept the thread finished says so (owner 2026-10-30)', () => {
    expect(auditEntryLabel('message.thanks_kept_finished', { status: 'closed' })).toBe(
      'Customer said thanks — kept closed'
    );
  });

  it('a thank-you the reply check found needs no reply sets the thread back, and says so (N1)', () => {
    expect(
      auditEntryLabel('message.thanks_kept_finished', {
        status: 'resolved',
        reason: 'no_reply_verdict',
      })
    ).toBe('Customer said thanks — no reply needed, back to resolved');
    // Control: the save's own thanks keeps its words.
    expect(
      auditEntryLabel('message.thanks_kept_finished', {
        status: 'resolved',
        reason: 'customer_thanks_only',
      })
    ).toBe('Customer said thanks — kept resolved');
  });

  it('a normal customer reopen keeps its words', () => {
    expect(auditEntryLabel('message.auto_reopen', { fromStatus: 'resolved' })).toBe(
      'Customer replied — reopened from resolved'
    );
  });
});

describe('routing.decision entries (spec §4.5)', () => {
  const rule = {
    id: 1,
    type: 'body_contains',
    value: 'loading dock',
    deleted: false,
    autoAccepted: false,
  };
  const dept = 'Support';
  it.each([
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [
          {
            ...rule,
            acceptedBy: { userId: 9, name: 'Anna Weber' },
            acceptedAt: '2026-10-14T09:00:00Z',
          },
        ],
      },
      `Routed to Support by rule "loading dock" (accepted by Anna Weber, ${OCT_14})`,
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [
          { ...rule, acceptedBy: null, acceptedAt: '2026-10-14T09:00:00Z', autoAccepted: true },
        ],
      },
      `Routed to Support by rule "loading dock" (accepted automatically, ${OCT_14})`,
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [{ ...rule, acceptedBy: null, acceptedAt: null }],
      },
      'Routed to Support by rule "loading dock"',
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [{ ...rule, acceptedBy: { name: 'Anna Weber' }, acceptedAt: 'not-a-date' }],
      },
      'Routed to Support by rule "loading dock" (accepted by Anna Weber)',
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [{ ...rule, acceptedBy: null, acceptedAt: 'not-a-date', autoAccepted: true }],
      },
      'Routed to Support by rule "loading dock" (accepted automatically)',
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [
          {
            id: 2,
            type: null,
            value: null,
            deleted: true,
            acceptedBy: null,
            acceptedAt: null,
            autoAccepted: false,
          },
        ],
      },
      'Routed to Support by a rule that has since been deleted',
    ],
    [
      { reason: 'rule_strong', departmentName: dept, rules: [{ ...rule, deleted: true }] },
      'Routed to Support by a rule that has since been deleted',
    ],
    [{ reason: 'rule_ai_agree', departmentName: dept, rules: [] }, 'Routed to Support by a rule'],
    [{ reason: 'rule_decisive', departmentName: dept, rules: [] }, 'Routed to Support by a rule'],
    [{ reason: 'rule_strong', departmentName: dept }, 'Routed to Support by a rule'],
    [
      { reason: 'embedding_strong', departmentName: dept, rules: [] },
      'Routed to Support by similarity to earlier threads',
    ],
    [
      { reason: 'embedding_override', departmentName: dept, rules: [] },
      'Routed to Support by similarity to earlier threads',
    ],
    [
      { reason: 'ai_primary', departmentName: dept, rules: [] },
      'Routed to Support by the AI classifier',
    ],
    [
      { reason: 'single_dept_rescue', departmentName: dept, rules: [] },
      'Routed to Support automatically',
    ],
    [{ reason: 'is_default', departmentName: dept, rules: [] }, 'Routed to Support automatically'],
    [
      { reason: 'some_future_reason', departmentName: dept, rules: [] },
      'Routed to Support automatically',
    ],
    [{ departmentName: dept }, 'Routed to Support automatically'],
    [
      { reason: 'ai_primary', departmentName: null, rules: [] },
      'Routed to a team by the AI classifier',
    ],
    [
      { reason: 'sole_department', departmentName: dept, rules: [] },
      'Routed to Support — the only team for this mailbox',
    ],
    [
      { reason: 'sender_history', departmentName: dept, rules: [] },
      'Routed to Support — where this sender’s mail usually goes',
    ],
  ])('%j', (details, label) => {
    expect(auditEntryLabel('routing.decision', details)).toBe(label);
  });

  it('survives null details', () => {
    expect(auditEntryLabel('routing.decision', null)).toBe('Routed to a team automatically');
  });

  describe('the rule that carried the route (largest share, §9)', () => {
    // Staging 2026-10-15: embedding_strong with shares {1:.083, 2:.083, 4:.208, 12:.208, 733:.417};
    // 733 was a just-accepted learned rule. BE lists rules largest share first, but the label
    // must not depend on that order.
    const manual = (id: number, value: string, share?: number) => ({
      id,
      type: 'body_contains',
      value,
      deleted: false,
      acceptedBy: null,
      acceptedAt: null,
      autoAccepted: false,
      ...(share === undefined ? {} : { share }),
    });
    const accepted = (share?: number) => ({
      ...manual(733, 'pallet label', share),
      acceptedBy: { userId: 9, name: 'Anna Weber' },
      acceptedAt: '2026-10-15T08:00:00Z',
    });
    const autoAccepted = (share?: number) => ({
      ...manual(734, 'pallet label', share),
      acceptedAt: '2026-10-13T02:00:00Z',
      autoAccepted: true,
    });
    const deleted = (share: number) => ({
      id: 99,
      type: null,
      value: null,
      deleted: true,
      acceptedBy: null,
      acceptedAt: null,
      autoAccepted: false,
      share,
    });
    const label = (reason: string, rules: unknown[]) =>
      auditEntryLabel('routing.decision', { reason, departmentName: 'Support', rules });

    it('similarity route whose largest share is an accepted rule names it (the staging case)', () => {
      const rules = [
        manual(1, 'invoice', 0.083),
        manual(2, 'freight', 0.083),
        manual(4, 'customs', 0.208),
        manual(12, 'delivery', 0.208),
        accepted(0.417),
      ];
      expect(label('embedding_strong', rules)).toBe(
        `Routed to Support by rule "pallet label" (accepted by Anna Weber, ${OCT_15})`
      );
      expect(label('embedding_override', [accepted(0.417), manual(1, 'invoice', 0.083)])).toBe(
        `Routed to Support by rule "pallet label" (accepted by Anna Weber, ${OCT_15})`
      );
    });

    it('similarity route whose largest share is an auto-accepted rule names it', () => {
      expect(label('embedding_strong', [manual(1, 'invoice', 0.2), autoAccepted(0.6)])).toBe(
        `Routed to Support by rule "pallet label" (accepted automatically, ${OCT_13})`
      );
    });

    it('similarity route whose largest share is a manual (never accepted) rule stays similarity', () => {
      expect(label('embedding_strong', [accepted(0.2), manual(1, 'invoice', 0.5)])).toBe(
        'Routed to Support by similarity to earlier threads'
      );
    });

    it('similarity route skips a deleted rule with the largest share and judges the largest live one', () => {
      expect(
        label('embedding_strong', [deleted(0.9), manual(1, 'invoice', 0.05), accepted(0.05)])
      ).toBe('Routed to Support by similarity to earlier threads');
      expect(
        label('embedding_strong', [deleted(0.9), accepted(0.3), manual(1, 'invoice', 0.1)])
      ).toBe(`Routed to Support by rule "pallet label" (accepted by Anna Weber, ${OCT_15})`);
    });

    it('rule route names the largest-share live rule, not the first', () => {
      expect(
        label('rule_strong', [manual(1, 'invoice', 0.1), deleted(0.8), manual(2, 'freight', 0.6)])
      ).toBe('Routed to Support by rule "freight"');
      expect(label('rule_ai_agree', [manual(1, 'invoice', 0.1), accepted(0.9)])).toBe(
        `Routed to Support by rule "pallet label" (accepted by Anna Weber, ${OCT_15})`
      );
      expect(label('rule_decisive', [manual(1, 'invoice', 0.1), manual(2, 'freight', 0.9)])).toBe(
        'Routed to Support by rule "freight"'
      );
    });

    it('older BE without share: rule route names the first live rule, similarity stays similarity', () => {
      expect(
        label('rule_strong', [
          { ...deleted(0), share: undefined },
          manual(1, 'invoice'),
          accepted(),
        ])
      ).toBe('Routed to Support by rule "invoice"');
      expect(label('embedding_strong', [accepted(), manual(1, 'invoice')])).toBe(
        'Routed to Support by similarity to earlier threads'
      );
    });
  });

  it('places the routing entry (appended last by the BE) by createdAt, leaving the rest in order', () => {
    const routing = {
      ...entry(
        'routing.decision',
        { reason: 'ai_primary', departmentName: 'Support', rules: [] },
        '2026-08-20T10:00:01.000Z'
      ),
      id: -5,
      userEmail: null,
      userId: null,
    };
    const items = buildTimeline(
      [
        entry('message.create', null, '2026-08-20T10:00:00.000Z'),
        entry('ticket.resolve', null, '2026-08-20T12:00:00.000Z'),
        routing,
      ],
      [],
      []
    );
    expect(items.map((item) => item.label)).toEqual([
      'Message received',
      'Routed to Support by the AI classifier',
      'Resolved',
    ]);
    expect(items[1].who).toBe('System');
  });
});

describe('messageActivityTimeline — auto-reply sent', () => {
  it('names the rule and the keyword that matched', () => {
    expect(
      auditEntryLabel('message.auto_reply_sent', {
        source: 'keyword_rule',
        ruleName: 'Refunds',
        keyword: 'refund',
        toStatus: 'resolved',
      })
    ).toBe('Auto-reply sent by rule "Refunds" (keyword "refund") — resolved');
  });

  it('an AI auto-reply has no rule', () => {
    expect(auditEntryLabel('message.auto_reply_sent', { source: 'ai', toStatus: 'resolved' })).toBe(
      'AI auto-reply sent — resolved'
    );
    expect(
      auditEntryLabel('message.auto_reply_sent', { source: 'ai', toStatus: 'awaiting_response' })
    ).toBe('AI auto-reply sent');
  });

  it('a rule that inserted a knowledge base answer says so', () => {
    expect(
      auditEntryLabel('message.auto_reply_sent', {
        source: 'keyword_rule',
        ruleName: 'Refunds',
        keyword: 'refund',
        knowledgeSource: 'knowledge_base',
        toStatus: 'resolved',
      })
    ).toBe(
      'Auto-reply sent by rule "Refunds" (keyword "refund") with a knowledge base answer — resolved'
    );
  });

  it('the missing-information question says what it asked', () => {
    expect(
      auditEntryLabel('message.auto_reply_sent', {
        source: 'missing_info',
        toStatus: 'awaiting_response',
      })
    ).toBe('Asked the customer for missing information (auto-reply)');
    expect(activityKindOf('message.auto_reply_sent')).toBe('ai');
  });
});

describe('messageActivityTimeline — auto-reply withheld', () => {
  const withheld = (reason: string, ruleNames: string[]) =>
    auditEntryLabel('message.auto_reply_withheld', {
      reason,
      ruleIds: ruleNames.map((_name, index) => index + 1),
      ruleNames,
    });

  it('several rules matched: names them, naturally joined', () => {
    expect(withheld('several_rules', ['Refunds', 'Shipping'])).toBe(
      'No auto-reply: rules "Refunds" and "Shipping" both matched'
    );
    expect(withheld('several_rules', ['Refunds', 'Shipping', 'Returns'])).toBe(
      'No auto-reply: rules "Refunds", "Shipping" and "Returns" all matched'
    );
  });

  it('a matched rule whose reply did not go out says why, in plain words', () => {
    expect(withheld('send_failed', ['Refunds'])).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: the email could not be sent'
    );
    expect(withheld('kb_below_threshold', ['Refunds'])).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: no knowledge base answer was sure enough'
    );
    expect(withheld('plan_allotment_reached', ['Refunds'])).toBe(
      `Keyword rule "Refunds" matched but its reply did not go out: the plan's auto-reply limit`
    );
    expect(withheld('kb_placeholder_in_plain_rule', ['Refunds'])).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: the reply still holds {{kb_answer}}'
    );
    // The reply check held the knowledge base answer (2026-11-20).
    expect(withheld('kb_refusal', ['Refunds'])).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: the knowledge base answer only declined the question'
    );
    expect(withheld('kb_reply_unchecked', ['Refunds'])).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: the knowledge base answer could not be checked'
    );
  });

  // The send gate's reasons (2026-11-20), as the backend's keywordSendGate / keywordAutoReply name them.
  it.each([
    ['kb_restricted_topic', 'the customer asks about a subject a person must answer'],
    ['restricted_topic', 'the customer asks about a subject a person must answer'],
    ['kb_no_customer_request', 'the message is not a customer request'],
    ['kb_needs_lookup_or_action', 'answering needs a lookup or an action'],
    ['kb_promises_follow_up', 'the knowledge base answer promised a follow-up'],
    ['kb_does_not_answer', 'the knowledge base answer did not answer the question'],
    ['kb_unsupported_by_sources', 'the answer said more than the knowledge base does'],
    ['kb_content_unchecked', 'the knowledge base answer could not be checked'],
    ['question_unchecked', 'the question could not be checked for a restricted topic'],
  ])('send gate: %s says why in words', (reason, why) => {
    expect(withheld(reason, ['Refunds'])).toBe(
      `Keyword rule "Refunds" matched but its reply did not go out: ${why}`
    );
  });

  it.each([['some_new_reason'], [''], ['toString']])(
    'an unknown reason (%s) reads "held for a person", never the raw code',
    (reason) => {
      expect(withheld(reason, ['Refunds'])).toBe(
        'Keyword rule "Refunds" matched but its reply did not go out: it was held for a person'
      );
    }
  );

  // The email asking for missing information, withheld (BE followUpEmailHelper → source missing_info:
  // `reason` = the outcome, `detail` = the backend's own sentence, the facts beside them).
  const askWithheld = (reason: string, facts: Record<string, unknown> = {}) =>
    auditEntryLabel('message.auto_reply_withheld', {
      ...facts,
      reason,
      ruleIds: [],
      ruleNames: [],
      source: 'missing_info',
    });
  const ASK = 'The email asking for missing information was not sent: ';

  it.each([
    ['ask_unchecked', "the email's questions could not be checked"],
    ['check failed', "the email's questions could not be checked"],
    [
      'restricted_topic',
      'the customer asks about a subject a person must answer, so nothing was asked automatically',
    ],
    ['no_customer_request', 'the message is not a customer request'],
    ['not_only_asking', 'a question in the email did more than ask for a detail'],
  ])('ask email held by its check: %s', (checkReason, why) => {
    expect(
      askWithheld('blocked_missing_info_model_check', {
        checkReason,
        detail: 'The check of the questions held the email.',
      })
    ).toBe(`${ASK}${why}`);
  });

  // Every withheld outcome the backend stores for the missing-info email.
  it.each([
    [
      'blocked_missing_info_guard',
      'the email the AI wrote did not pass the checks on its questions',
    ],
    ['blocked_reply_hygiene', 'the email did not pass the checks every automatic reply passes'],
    ['nothing_to_ask', 'the AI had no question to ask, or could not write one'],
    ['blocked_unsupported_language', 'the email is in a language the question is not written in'],
    ['blocked_degraded_analysis', 'the AI could not read this email properly'],
    ['blocked_pre_gate', 'this thread is not one that gets an automatic reply'],
    [
      'blocked_escalation_phrase',
      "the customer's email contains a phrase that stops automatic replies",
    ],
    ['thread_locked', 'another reply was in progress'],
    ['ai_reply_limit', 'the limit on automatic replies to this thread or this sender was reached'],
    ['plan_allotment_reached', "this month's automatic replies are used up"],
    ['plan_not_entitled', 'the plan does not include automatic replies'],
    ['workspace_blocked', 'the workspace is waiting for a plan'],
    ['ai_drafts_off', 'AI drafts are off'],
    ['no_thread', 'there is no customer message to answer'],
    ['send_failed', 'the email could not be sent'],
    ['spam_verdict', 'the spam check did not clear this email'],
    ['pre_send_timeout', 'a step before sending took too long'],
  ])('ask email not sent: %s', (reason, why) => {
    expect(askWithheld(reason, { detail: 'A sentence the backend wrote.' })).toBe(`${ASK}${why}`);
  });

  it('ask email that may have gone out says so, and to check before replying', () => {
    expect(
      askWithheld('send_failed', {
        uncertain: true,
        detail: 'The email may not have been delivered.',
      })
    ).toBe(
      'The email asking for missing information may not have been delivered: check before replying — the customer may already have it'
    );
    // CONTROL — a plain failure, and `uncertain` beside another outcome, do not say it.
    expect(askWithheld('send_failed', { uncertain: false })).toBe(
      `${ASK}the email could not be sent`
    );
    expect(askWithheld('thread_locked', { uncertain: true })).toBe(
      `${ASK}another reply was in progress`
    );
  });

  it('ask email: an outcome this bundle does not know reads as the backend sentence, or "held for a person" — never a code, never a keyword rule', () => {
    expect(askWithheld('some_new_outcome', { detail: 'A new rule held the email.' })).toBe(
      'The email asking for missing information was not sent. A new rule held the email.'
    );
    for (const label of [
      askWithheld('some_new_outcome'),
      // The backend writes the bare outcome as `detail` when it has no sentence for it.
      askWithheld('some_new_outcome', { detail: 'some_new_outcome' }),
      askWithheld('blocked_missing_info_model_check', { checkReason: 'some_new_reason' }),
      askWithheld('blocked_missing_info_model_check'),
      // A keyword-only reason is not borrowed for the ask email.
      askWithheld('kb_refusal'),
    ]) {
      expect(label).toBe(`${ASK}it was held for a person`);
    }
  });

  // The AI's own reply was handed over for sending and did not arrive (BE autoReplyNotSent).
  const aiReply = (reason: string, uncertain?: boolean) =>
    auditEntryLabel('message.auto_reply_withheld', {
      ...(uncertain !== undefined && { uncertain }),
      reason,
      ruleIds: [],
      ruleNames: [],
      source: 'ai_reply',
    });

  it('AI reply not delivered: certain and uncertain read differently', () => {
    expect(aiReply('send_failed', true)).toBe(
      'The automatic reply may not have been delivered: check before replying — the customer may already have it.'
    );
    expect(aiReply('send_failed', false)).toBe('The automatic reply could not be delivered.');
    expect(aiReply('send_failed')).toBe('The automatic reply could not be delivered.');
    expect(aiReply('some_new_reason', true)).toBe(
      'The automatic reply was not sent: it was held for a person'
    );
  });

  it('keyword rule reply that may have gone out says so', () => {
    expect(
      auditEntryLabel('message.auto_reply_withheld', {
        uncertain: true,
        reason: 'send_failed',
        ruleIds: [1],
        ruleNames: ['Refunds'],
      })
    ).toBe(
      'Keyword rule "Refunds" matched but its reply may not have been delivered: check before replying — the customer may already have it'
    );
    // CONTROL — a plain failure keeps its sentence.
    expect(
      auditEntryLabel('message.auto_reply_withheld', {
        uncertain: false,
        reason: 'send_failed',
        ruleIds: [1],
        ruleNames: ['Refunds'],
      })
    ).toBe(
      'Keyword rule "Refunds" matched but its reply did not go out: the email could not be sent'
    );
  });

  it('CONTROL — the same reason without the missing_info source is a keyword rule line', () => {
    expect(withheld('plan_not_entitled', [])).toBe(
      "A keyword rule matched but its reply did not go out: the plan's auto-reply limit"
    );
  });

  it('is shown with the auto-reply dot, as a system entry', () => {
    expect(activityKindOf('message.auto_reply_withheld')).toBe('ai');
  });
});
