import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { isRoutingProposal, learningService, normalizeProposalEvidence } from '../learning.service';

// Shape of the BE's buildRoutingProposalEvidence (routingProposalEvidence.ts). Invented data.
const good = {
  kind: 'propose_rule',
  departments: [
    {
      departmentId: 1,
      ruleId: 10,
      supportCount: 3,
      agents: 2,
      firstAt: '2026-10-05T00:00:00.000Z',
      lastAt: '2026-10-14T00:00:00.000Z',
      conversations: [
        {
          conversationId: 5,
          publicId: 'SUP-5',
          subject: 'Pallet label',
          departmentId: 1,
          routedBy: { id: 9, name: 'Anna Weber' },
          routedAt: '2026-10-14T00:00:00.000Z',
        },
      ],
      redactedCount: 1,
      contradictions: [{ departmentId: 2, count: 2 }],
      replay: {
        matches: 14,
        inDepartment: 13,
        ratio: 0.93,
        lookbackDays: 30,
        at: '2026-10-14T00:00:00.000Z',
        skipped: 0,
        truncated: false,
        recommendation: 'recommended',
      },
      warnOverlap: { ruleId: 44, departmentId: 2, similarity: 0.71 },
    },
  ],
  autoAccept: { mode: 'manual', eligibleInBalanced: true },
};
const dept0 = good.departments[0];
const withDept = (patch: Record<string, unknown>) => ({ ...good, departments: [{ ...dept0, ...patch }] });

describe('normalizeProposalEvidence', () => {
  it('keeps a well-formed block field for field', () => {
    expect(normalizeProposalEvidence(good)).toEqual(good);
  });

  it.each([[undefined], [null], [{}], [{ ...good, departments: 'x' }], [{ ...good, kind: 'resolve_conflict' }]])(
    'reads %j as null (older backend / malformed)',
    (raw) => {
      expect(normalizeProposalEvidence(raw)).toBeNull();
    }
  );

  it('drops a malformed conversation row instead of crashing the card', () => {
    const out = normalizeProposalEvidence(withDept({ conversations: [{ nope: true }, dept0.conversations[0]] }));
    expect(out!.departments[0].conversations).toEqual(dept0.conversations);
  });

  it('keeps a row whose support entry had no time, with routedAt null (never the epoch)', () => {
    const { routedAt: _absent, ...noTime } = dept0.conversations[0];
    const out = normalizeProposalEvidence(
      withDept({ conversations: [noTime, { ...noTime, conversationId: 6, routedAt: null }, { ...noTime, conversationId: 7, routedAt: 'garbage' }] })
    );
    expect(out!.departments[0].conversations.map((row) => [row.conversationId, row.routedAt])).toEqual([
      [5, null],
      [6, null],
      [7, null],
    ]);
  });

  it('reads warnOverlap per department; a malformed one is null; a top-level one is not carried', () => {
    const raw = {
      ...good,
      warnOverlap: { ruleId: 1, departmentId: 1, similarity: 1 },
      departments: [dept0, { ...dept0, departmentId: 3, ruleId: 11, warnOverlap: { ruleId: 'x' } }],
    };
    const out = normalizeProposalEvidence(raw)!;
    expect(out.departments.map((dept) => dept.warnOverlap)).toEqual([dept0.warnOverlap, null]);
    expect(out).not.toHaveProperty('warnOverlap');
  });

  it('reads a replay without skipped/truncated as 0/false and an unknown recommendation as null', () => {
    const { skipped: _s, truncated: _t, ...oldReplay } = dept0.replay;
    const out = normalizeProposalEvidence(withDept({ replay: { ...oldReplay, recommendation: 'maybe', at: 5 } }))!;
    expect(out.departments[0].replay).toEqual({ ...oldReplay, at: null, skipped: 0, truncated: false, recommendation: null });
    expect(normalizeProposalEvidence(withDept({ replay: { matches: 'x' } }))!.departments[0].replay).toBeNull();
  });

  it('reads a truncated replay as truncated (matches is a lower bound)', () => {
    const out = normalizeProposalEvidence(withDept({ replay: { ...dept0.replay, skipped: 2, truncated: true } }))!;
    expect(out.departments[0].replay).toMatchObject({ skipped: 2, truncated: true });
  });

  it('defaults an unknown trust mode to manual and eligibility to false', () => {
    const out = normalizeProposalEvidence({ ...good, autoAccept: { mode: 'yolo', eligibleInBalanced: 'yes' } })!;
    expect(out.autoAccept).toEqual({ mode: 'manual', eligibleInBalanced: false });
  });

  it('drops a department without a rule id and malformed contradictions', () => {
    const raw = {
      ...good,
      departments: [{ departmentId: 4 }, { ...dept0, contradictions: [{ departmentId: 'x', count: 1 }, { departmentId: 2, count: 2 }] }],
    };
    const out = normalizeProposalEvidence(raw)!;
    expect(out.departments).toHaveLength(1);
    expect(out.departments[0].contradictions).toEqual([{ departmentId: 2, count: 2 }]);
  });
});

describe('isRoutingProposal', () => {
  it('is true only for the three routing types', () => {
    expect(isRoutingProposal({ domain: 'routing', suggestionType: 'propose_rule' })).toBe(true);
    expect(isRoutingProposal({ domain: 'routing', suggestionType: 'resolve_routing_disagreement' })).toBe(true);
    expect(isRoutingProposal({ domain: 'routing', suggestionType: 'confirm_learned_rule' })).toBe(true);
    expect(isRoutingProposal({ domain: 'routing', suggestionType: 'resolve_conflict' })).toBe(false);
    expect(isRoutingProposal({ domain: 'spam', suggestionType: 'propose_rule' })).toBe(false);
  });
});

describe('learningService evidence + accept', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    post.mockResolvedValue({ data: { success: true } });
  });

  it('normalizes the proposal block of the evidence response', async () => {
    get.mockResolvedValue({ data: { success: true, data: { evidence: [], ruleA: null, ruleB: null, scannedCount: null, proposal: good } } });
    const out = await learningService.getSuggestionEvidence(7);
    expect(get).toHaveBeenCalledWith('/api/learning/suggestions/7/evidence');
    expect(out.proposal).toEqual(good);
  });

  it('reads an older backend (no proposal key) as proposal null and keeps conflict counts as sent', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { evidence: [], ruleA: null, ruleB: null, scannedCount: 40, skippedCount: 0, redactedCount: null } },
    });
    const out = await learningService.getSuggestionEvidence(8);
    expect(out.proposal).toBeNull();
    expect(out.redactedCount).toBeNull();
    expect(out.scannedCount).toBe(40);
  });

  it('reads a malformed proposal block as null', async () => {
    get.mockResolvedValue({ data: { success: true, data: { evidence: [], ruleA: null, ruleB: null, proposal: { kind: 'propose_rule' } } } });
    expect((await learningService.getSuggestionEvidence(9)).proposal).toBeNull();
  });

  it('sends the chosen department when accepting a disagreement card', async () => {
    await learningService.acceptSuggestion(12, { departmentId: 3 });
    expect(post).toHaveBeenCalledWith('/api/learning/suggestions/12/accept', { departmentId: 3 });
  });

  it('sends no department for a one-argument accept', async () => {
    await learningService.acceptSuggestion(13);
    expect(post).toHaveBeenCalledWith('/api/learning/suggestions/13/accept', {});
  });
});
