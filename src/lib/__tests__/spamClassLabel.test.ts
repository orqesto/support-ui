/**
 * taco COR-SUP-2654, 2026-09-18: the AI tab's CLASS tile said "Legit" beside a SUSPICIOUS
 * badge, because it read `isSpam` alone and a suspicious verdict also has `isSpam: false`.
 */
import { describe, it, expect } from 'vitest';
import { spamClassLabel } from '../messageHelpers';

describe('spamClassLabel', () => {
  it('names a suspicious verdict as Suspicious, not Legit', () => {
    expect(spamClassLabel({ isSpam: false, category: 'suspicious' })).toBe('Suspicious');
  });

  it('names solicitation, which is also isSpam=false', () => {
    expect(spamClassLabel({ isSpam: false, category: 'solicitation' })).toBe('Solicitation');
  });

  it('keeps Legit for a legitimate verdict and Spam for spam', () => {
    expect(spamClassLabel({ isSpam: false, category: 'legitimate' })).toBe('Legit');
    expect(spamClassLabel({ isSpam: true, category: 'spam' })).toBe('Spam');
  });

  it('falls back on isSpam when an older row has no category', () => {
    expect(spamClassLabel({ isSpam: false })).toBe('Legit');
    expect(spamClassLabel({ isSpam: true })).toBe('Spam');
    expect(spamClassLabel({})).toBe('Unknown');
  });

  it('shows an unknown future category verbatim rather than calling it Legit', () => {
    expect(spamClassLabel({ isSpam: false, category: 'competitive' })).toBe('competitive');
  });
});
