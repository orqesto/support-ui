import { describe, expect, it } from 'vitest';
import { normalisePendingDecision } from '@/services/kb.service';

describe('normalisePendingDecision', () => {
  it('absent (older backend) ⇒ null', () => {
    expect(normalisePendingDecision(undefined)).toBeNull();
    expect(normalisePendingDecision(null)).toBeNull();
  });
  it('an unknown kind ⇒ null, never a guess', () => {
    expect(normalisePendingDecision({ suggestionId: 4, kind: 'split', reasons: [] })).toBeNull();
  });
  it('keeps a well-formed decision; canDecide defaults to false when absent', () => {
    expect(
      normalisePendingDecision({ suggestionId: 4, kind: 'remove', reasons: ['no_answer', 7] })
    ).toEqual({
      suggestionId: 4,
      kind: 'remove',
      reasons: ['no_answer'],
      canDecide: false,
    });
  });
});
