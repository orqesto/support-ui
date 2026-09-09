import { describe, expect, it } from 'vitest';
import { contradictionChecksToRender } from '../ContradictionAlert';
import type { ContradictionCheckMetadata } from '@/types/ai';

/**
 * The Conflict tab drew the same finding twice. Both backend writers store the headline result
 * under `contradictionCheck` AND the intra-message result under its own key, and when the intra
 * check is the one that fired those are the same check — verified on a real row, where the two
 * metadata values were byte-identical.
 *
 * The storage is correct and must stay: `autoReplyService` and `suggestedAnswerController` read
 * the intra key alone to decide whether to tell the model a contradiction was found. So the
 * duplicate is collapsed at render time, which also repairs threads whose metadata was written
 * long before this fix.
 */

const check = (over: Partial<ContradictionCheckMetadata> = {}): ContradictionCheckMetadata =>
  ({
    checkedAt: '2026-09-07T18:57:04.000Z',
    triggeredBy: 'auto_pattern',
    result: {
      hasContradiction: true,
      confidence: 'high',
      contradictions: [
        {
          currentStatement: 'It says on its way and expected on the 14th September?',
          originalStatement: 'the package is already delivered.',
          explanation: 'These are mutually exclusive statuses.',
          confidence: 'high',
        },
      ],
    },
    ...over,
  }) as ContradictionCheckMetadata;

describe('contradictionChecksToRender', () => {
  it('draws one alert when both keys hold the same check', () => {
    const same = check();

    expect(contradictionChecksToRender(same, same)).toHaveLength(1);
  });

  it('draws one alert when the two records render identically but differ as JSON', () => {
    // The manual path wraps the selected result to add a normalised `contradictions[]` while the
    // intra key keeps the raw shape, so a whole-object comparison would call these different.
    const intra = check();
    const cross = check({
      result: { ...check().result, explanation: 'legacy top-level field, not rendered as an item' },
    });

    expect(contradictionChecksToRender(intra, cross)).toHaveLength(1);
  });

  // CONTROL. A dedupe that collapses everything would pass the two assertions above and destroy
  // the feature: the thread check and the intra check finding DIFFERENT things is the case the
  // tab exists for.
  it('draws both when the checks found different things', () => {
    const intra = check();
    const cross = check({
      result: {
        ...check().result,
        contradictions: [
          {
            currentStatement: 'I have not received this.',
            originalStatement: 'the package is returned.',
            explanation: 'Returned to the warehouse cannot also be received by the customer.',
            confidence: 'high',
          },
        ],
      },
    });

    expect(contradictionChecksToRender(intra, cross)).toHaveLength(2);
  });

  // CONTROL. Two runs at different times that found the same thing are two observations; hiding
  // the second would hide information rather than a duplicate.
  it('draws both when the same finding comes from two separate checks', () => {
    const first = check();
    const second = check({ checkedAt: '2026-09-08T09:00:00.000Z', triggeredBy: 'manual_request' });

    expect(contradictionChecksToRender(first, second)).toHaveLength(2);
  });

  it('ignores a check with nothing to draw, and returns nothing when neither has items', () => {
    const empty = check({ result: { hasContradiction: false, confidence: 'low' } } as Partial<ContradictionCheckMetadata>);

    expect(contradictionChecksToRender(check(), empty)).toHaveLength(1);
    expect(contradictionChecksToRender(empty, empty)).toHaveLength(0);
  });

  // The commonest row shape by far — 60 of the 61 checked conversations in the dev database
  // carry `contradictionCheck` alone. It must still draw.
  it('draws the cross-message check when there is no intra check at all', () => {
    expect(contradictionChecksToRender(undefined, check())).toHaveLength(1);
  });

  it('returns nothing when neither key is present', () => {
    expect(contradictionChecksToRender(undefined, undefined)).toHaveLength(0);
  });
});
