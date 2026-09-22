import { describe, it, expect } from 'vitest';
import {
  describeScope,
  groupRefusals,
  REFUSAL_TEXT,
  type BulkResult,
  type RefusalReason,
} from '../bulkActions';
import { describeResult } from '../bulkResultMessage';

describe('refusal wording', () => {
  it('has a sentence for every reason the server can send', () => {
    // A reason with no sentence would render as an empty bullet: "3 " and nothing else.
    const reasons: RefusalReason[] = [
      'not_a_conversation',
      'out_of_scope',
      'already_resolved',
      'in_spam',
      'needs_routing',
      'not_customer_work',
      'no_reply_to_save',
      'already_has_ticket',
      'already_confirmed_spam',
      'security_threat',
      'already_read',
      'already_unread',
    ];
    for (const reason of reasons) {
      expect(REFUSAL_TEXT[reason]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('groups refusals by reason, largest first', () => {
    const grouped = groupRefusals([
      { id: 1, reason: 'no_reply_to_save' },
      { id: 2, reason: 'already_resolved' },
      { id: 3, reason: 'no_reply_to_save' },
    ]);
    expect(grouped[0]).toMatchObject({ reason: 'no_reply_to_save', count: 2 });
    expect(grouped[1]).toMatchObject({ reason: 'already_resolved', count: 1 });
  });
});

describe('describeScope', () => {
  it('distinguishes a partial selection from a whole one', () => {
    // "12 of 15" and "all 15" are different facts and an agent must be able to tell them apart.
    expect(describeScope(12, 15)).toBe('12 of 15 selected');
    expect(describeScope(15, 15)).toBe('all 15 selected');
  });
});

describe('describeResult', () => {
  const result = (over: Partial<BulkResult> = {}): BulkResult => ({
    action: 'resolve',
    applied: [1, 2],
    refused: [],
    failed: [],
    ...over,
  });

  it('names failures rather than folding them into the success count', () => {
    const outcome = describeResult('resolve', result({ failed: [{ id: 9, error: 'boom' }] }));
    expect(outcome.text).toContain('FAILED');
    expect(outcome.tone).toBe('warning');
  });

  it('says the KB capture is RUNNING, not saved', () => {
    // The threads are resolved now; entries appear when extraction finishes. "Saved" would be a
    // promise the run has not kept.
    const outcome = describeResult('resolve_kb', result({ kbJobsQueued: 2 }));
    expect(outcome.text).toContain('running');
    expect(outcome.text).not.toContain('saved');
  });

  it('reports the skipped threads with their reason', () => {
    const outcome = describeResult(
      'resolve_kb',
      result({ refused: [{ id: 5, reason: 'no_reply_to_save' }] })
    );
    expect(outcome.text).toContain('1 skipped');
    expect(outcome.text).toContain(REFUSAL_TEXT.no_reply_to_save);
  });

  it('names the ticket a create_ticket run produced', () => {
    const outcome = describeResult('create_ticket', result({ ticketId: 77 }));
    expect(outcome.text).toContain('#77');
  });

  it('does not claim work when nothing was applied', () => {
    const outcome = describeResult('resolve', result({ applied: [] }));
    expect(outcome.text).toContain('Nothing to');
  });
});
