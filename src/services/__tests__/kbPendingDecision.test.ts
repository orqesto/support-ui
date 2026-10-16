import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  kbService,
  normalisePendingDecision,
  normaliseSetAsideReason,
} from '@/services/kb.service';

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

describe('normaliseSetAsideReason', () => {
  it('absent ⇒ null; known ⇒ kept; unknown ⇒ other (a readable label, never an empty badge)', () => {
    expect(normaliseSetAsideReason(undefined)).toBeNull();
    expect(normaliseSetAsideReason(null)).toBeNull();
    expect(normaliseSetAsideReason('raw_email')).toBe('raw_email');
    expect(normaliseSetAsideReason('some_new_reason')).toBe('other');
  });
});

describe('kbService.getAll filters.decisionStatuses', () => {
  afterEach(() => vi.restoreAllMocks());
  const answer = (filters: Record<string, unknown>) =>
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          entries: [{ id: 1, setAsideReason: 'some_new_reason' }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          filters,
        },
      },
    });

  it('an older backend (echoes the status, no flag) ⇒ false', async () => {
    answer({ status: 'needs_decision' });
    const result = await kbService.getAll({ status: 'needs_decision' });
    expect(result.data.filters).toEqual({ status: 'needs_decision', decisionStatuses: false });
    expect(result.data.entries[0].setAsideReason).toBe('other');
  });

  it('a backend that applies the decision statuses ⇒ true', async () => {
    answer({ status: 'needs_decision', decisionStatuses: true });
    const result = await kbService.getAll({ status: 'needs_decision' });
    expect(result.data.filters?.decisionStatuses).toBe(true);
  });
});
