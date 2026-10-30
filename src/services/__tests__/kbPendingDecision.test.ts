import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  kbService,
  normaliseAutoChange,
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
      expiresAt: null,
    });
  });
  it('keeps when it expires, and an expired capture that still waits', () => {
    expect(
      normalisePendingDecision({
        suggestionId: 4,
        kind: 'approve_capture',
        reasons: [],
        canDecide: true,
        expiresAt: '2026-11-01T00:00:00.000Z',
        expired: true,
      })
    ).toMatchObject({ expiresAt: '2026-11-01T00:00:00.000Z', expired: true });
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
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
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
    expect(result.data.filters).toEqual({
      status: 'needs_decision',
      decisionStatuses: false,
      autoRemovedStatus: false,
      autoChangedStatus: false,
      statusApplied: false,
    });
    expect(result.data.entries[0].setAsideReason).toBe('other');
  });

  it('a backend that applies the decision statuses ⇒ true', async () => {
    answer({ status: 'needs_decision', decisionStatuses: true });
    const result = await kbService.getAll({ status: 'needs_decision' });
    expect(result.data.filters?.decisionStatuses).toBe(true);
    expect(result.data.filters?.statusApplied).toBe(true);
  });

  it('"Removed automatically" is applied only on a backend that says so (autoRemovedStatus)', async () => {
    answer({ status: 'auto_removed', decisionStatuses: true });
    expect((await kbService.getAll({ status: 'auto_removed' })).data.filters?.statusApplied).toBe(
      false
    );
    answer({ status: 'auto_removed', decisionStatuses: true, autoRemovedStatus: true });
    expect((await kbService.getAll({ status: 'auto_removed' })).data.filters?.statusApplied).toBe(
      true
    );
  });

  it('"Changed automatically" is applied only on a backend that says so (autoChangedStatus)', async () => {
    answer({ status: 'auto_changed', decisionStatuses: true });
    const old = await kbService.getAll({ status: 'auto_changed' });
    expect(old.data.filters?.statusApplied).toBe(false);
    answer({ status: 'auto_changed', decisionStatuses: true, autoChangedStatus: true });
    const next = await kbService.getAll({ status: 'auto_changed' });
    expect(next.data.filters?.statusApplied).toBe(true);
  });
});

describe('normaliseAutoChange', () => {
  it('keeps a saved answer approved automatically, which is sent back for review', () => {
    expect(
      normaliseAutoChange({
        action: 'approveCaptures',
        at: '2026-10-20T02:00:00.000Z',
        confidence: 0.95,
        undo: 'return_to_review',
        suggestionId: 12,
      })
    ).toEqual({
      action: 'approveCaptures',
      at: '2026-10-20T02:00:00.000Z',
      confidence: 0.95,
      undo: 'return_to_review',
      suggestionId: 12,
    });
  });
  it('an action this app does not know ⇒ null', () => {
    expect(normaliseAutoChange({ action: 'archive', undo: 'restore' })).toBeNull();
  });
  it('absent or an undo this app cannot run ⇒ null (no button, never a guess)', () => {
    expect(normaliseAutoChange(undefined)).toBeNull();
    expect(normaliseAutoChange({ action: 'remove', undo: 'something_new' })).toBeNull();
  });
  it('keeps a well-formed change; a null date stays null', () => {
    expect(
      normaliseAutoChange({
        action: 'hold',
        at: null,
        confidence: 0.9,
        undo: 'release_hold',
        suggestionId: 9,
      })
    ).toEqual({ action: 'hold', at: null, confidence: 0.9, undo: 'release_hold', suggestionId: 9 });
  });
});
