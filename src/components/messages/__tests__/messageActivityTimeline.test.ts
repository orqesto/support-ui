import { describe, it, expect } from 'vitest';
import { auditEntryLabel, buildTimeline } from '../messageActivityTimeline';
import type { MessageActivityEntry } from '@/services/message.service';

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
      'Routed to Support by rule "loading dock" (accepted by Anna Weber, 14 Oct)',
    ],
    [
      {
        reason: 'rule_strong',
        departmentName: dept,
        rules: [
          { ...rule, acceptedBy: null, acceptedAt: '2026-10-14T09:00:00Z', autoAccepted: true },
        ],
      },
      'Routed to Support by rule "loading dock" (accepted automatically, 14 Oct)',
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
        'Routed to Support by rule "pallet label" (accepted by Anna Weber, 15 Oct)'
      );
      expect(label('embedding_override', [accepted(0.417), manual(1, 'invoice', 0.083)])).toBe(
        'Routed to Support by rule "pallet label" (accepted by Anna Weber, 15 Oct)'
      );
    });

    it('similarity route whose largest share is an auto-accepted rule names it', () => {
      expect(label('embedding_strong', [manual(1, 'invoice', 0.2), autoAccepted(0.6)])).toBe(
        'Routed to Support by rule "pallet label" (accepted automatically, 13 Oct)'
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
      ).toBe('Routed to Support by rule "pallet label" (accepted by Anna Weber, 15 Oct)');
    });

    it('rule route names the largest-share live rule, not the first', () => {
      expect(
        label('rule_strong', [manual(1, 'invoice', 0.1), deleted(0.8), manual(2, 'freight', 0.6)])
      ).toBe('Routed to Support by rule "freight"');
      expect(label('rule_ai_agree', [manual(1, 'invoice', 0.1), accepted(0.9)])).toBe(
        'Routed to Support by rule "pallet label" (accepted by Anna Weber, 15 Oct)'
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
