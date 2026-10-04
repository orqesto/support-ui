/**
 * KB quality review — the detail is normalised so a missing or odd field reads as "not known",
 * never a crash (the FE can reach production before the backend that serves this route).
 */
import { describe, expect, it } from 'vitest';
import { normaliseQualityDetail } from '../kbQuality.service';

describe('normaliseQualityDetail', () => {
  it('passes a well-formed detail through', () => {
    const detail = normaliseQualityDetail(
      {
        suggestionId: 5,
        status: 'pending',
        verdict: 'improve',
        reasons: ['raw_email'],
        note: 'an email',
        proposed: { question: 'Q?', answer: 'A.' },
        rewriteProblem: null,
        entry: { id: 9, publicId: 'KB-9', question: 'q', answer: 'a', approved: true, timesReferenced: 2, date: '2026-10-01', conversationId: 3, conversationPublicId: 'SUP-3' },
        editedSinceProposed: false,
        stillEligible: true,
        canDecide: true,
      },
      5
    );
    expect(detail).toEqual(
      expect.objectContaining({ verdict: 'improve', reasons: ['raw_email'], proposed: { question: 'Q?', answer: 'A.' }, canDecide: true })
    );
    expect(detail.entry).toEqual(expect.objectContaining({ id: 9, publicId: 'KB-9', timesReferenced: 2, conversationId: 3 }));
  });

  it('reads an empty or foreign body as "not known" — never permissive', () => {
    const detail = normaliseQualityDetail(undefined, 5);
    expect(detail).toEqual({
      suggestionId: 5,
      status: 'pending',
      verdict: 'remove',
      reasons: [],
      note: '',
      proposed: null,
      rewriteProblem: null,
      entry: null,
      editedSinceProposed: false,
      stillEligible: false,
      canDecide: false,
    });
  });

  it('drops a half proposal, a non-string reason and an unknown rewrite problem', () => {
    const detail = normaliseQualityDetail(
      { verdict: 'improve', proposed: { question: 'Q?' }, reasons: ['raw_email', 7], rewriteProblem: 'exploded', entry: { publicId: 'KB-1' } },
      8
    );
    expect(detail.proposed).toBeNull();
    expect(detail.reasons).toEqual(['raw_email']);
    expect(detail.rewriteProblem).toBeNull();
    // An entry with no id cannot be named or linked.
    expect(detail.entry).toBeNull();
  });
});
