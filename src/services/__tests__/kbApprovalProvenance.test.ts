import { describe, expect, it } from 'vitest';
import { approvalProvenance, type KBEntry } from '@/services/kb.service';

/**
 * The whole point of this normalizer is the difference between a field that is ABSENT and
 * a field that is `null`. The backend carrying `approvedBy` ships separately from this
 * app, so during the gap the key simply is not there — and an approved entry looks exactly
 * the same either way. Rendering "auto-approved" then would be asserting something the API
 * never said, about the one distinction the feature exists to make.
 */

const entry = (overrides: Partial<KBEntry>): KBEntry =>
  ({
    id: 1,
    type: 'qa_pair',
    title: 'Q: do you deliver to Portugal?',
    content: 'Yes.',
    category: 'general',
    departmentId: null,
    qualityScore: 0.9,
    approved: false,
    hidden: false,
    usageCount: 0,
    createdAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  }) as KBEntry;

describe('approvalProvenance', () => {
  it('reports pending for an unapproved entry, whatever the fields say', () => {
    expect(approvalProvenance(entry({ approved: false }))).toBe('pending');
    expect(approvalProvenance(entry({ approved: false, approvedBy: 7 }))).toBe('pending');
  });

  it('reports unreviewed when the backend says approvedBy is null', () => {
    expect(approvalProvenance(entry({ approved: true, approvedBy: null }))).toBe('unreviewed');
  });

  it('reports reviewed when a user id is present', () => {
    expect(approvalProvenance(entry({ approved: true, approvedBy: 7 }))).toBe('reviewed');
  });

  // CONTROL: the version-skew case. Must NOT collapse into 'unreviewed'.
  it('reports unknown when the backend omits the field entirely', () => {
    expect(approvalProvenance(entry({ approved: true }))).toBe('unknown');
  });

  it('reports unknown when the key exists but is undefined', () => {
    expect(approvalProvenance(entry({ approved: true, approvedBy: undefined }))).toBe('unknown');
  });

  // A payload parsed from JSON has no prototype tricks, but the guard reads the key rather
  // than truthiness — pin that 0 is a real user id and not a missing value.
  it('treats user id 0 as reviewed rather than missing', () => {
    expect(approvalProvenance(entry({ approved: true, approvedBy: 0 }))).toBe('reviewed');
  });
});
