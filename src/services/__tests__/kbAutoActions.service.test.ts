import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  agreementAt,
  candidateBands,
  kbAutoActionsService,
  normaliseOverview,
  normaliseRemovedPage,
  normaliseSample,
  normaliseSettings,
  wouldRemoveAt,
} from '../kbAutoActions.service';

describe('kbAutoActions math', () => {
  const rows = [
    { percent: 50, count: 1 },
    { percent: 90, count: 3 },
    { percent: 100, count: 2 },
  ];

  it('counts every candidate at or above the bar', () => {
    expect(wouldRemoveAt(rows, 90)).toBe(5);
    expect(wouldRemoveAt(rows, 91)).toBe(2);
    expect(wouldRemoveAt(rows, 50)).toBe(6);
    expect(wouldRemoveAt([], 70)).toBe(0);
  });

  it('agreement sums decisions at or above the bar; no decisions ⇒ no rate', () => {
    const decisions = [
      { percent: 60, agreed: 1, disagreed: 4 },
      { percent: 95, agreed: 8, disagreed: 2 },
    ];
    expect(agreementAt(decisions, 95)).toEqual({ agreed: 8, total: 10, rate: 0.8 });
    expect(agreementAt(decisions, 60)).toEqual({ agreed: 9, total: 15, rate: 0.6 });
    expect(agreementAt(decisions, 99)).toEqual({ agreed: 0, total: 0, rate: null });
  });
});

describe('kbAutoActions normalisation (older or partial backend)', () => {
  it('reads an empty or malformed overview as Shadow (the backend default) with nothing waiting', () => {
    for (const raw of [undefined, null, 'html', { settings: { remove: { mode: 'weird' } } }]) {
      const overview = normaliseOverview(raw);
      expect(overview.settings.remove.mode).toBe('shadow');
      expect(overview.settings.remove.threshold).toBe(0.9);
      expect(overview.candidates.removableByPercent).toEqual([]);
      expect(overview.agreement.byPercent).toEqual([]);
      expect(overview.autoRemoved.lastRun).toBeNull();
    }
  });

  it('clamps the threshold into 50–100%', () => {
    expect(
      normaliseOverview({ settings: { remove: { mode: 'auto', threshold: 0.2 } } }).settings
    ).toEqual({ remove: { mode: 'auto', threshold: 0.5 } });
  });

  it('drops sample and removed rows without an id and defaults their fields', () => {
    expect(normaliseSample({ items: [{ question: 'x' }, { suggestionId: 3 }] }).items).toEqual([
      {
        suggestionId: 3,
        entryId: 0,
        publicId: null,
        subject: 'qa',
        question: '',
        answer: '',
        reasons: [],
        note: '',
        confidence: null,
        approved: false,
        personApproved: false,
      },
    ]);
    const page = normaliseRemovedPage({ items: [{ entryId: 9, reasons: ['outdated', 4] }] });
    expect(page.items[0].reasons).toEqual(['outdated']);
    expect(page).toMatchObject({ page: 1, pageSize: 25, total: 0 });
  });

  it('a missing or unknown mode falls back to Shadow, never Off; known modes are kept', () => {
    for (const raw of [undefined, {}, { remove: {} }, { remove: { mode: 'later' } }])
      expect(normaliseSettings(raw).remove.mode).toBe('shadow');
    expect(normaliseSettings({ remove: { mode: 'off' } }).remove.mode).toBe('off');
    expect(normaliseSettings({ remove: { mode: 'auto' } }).remove.mode).toBe('auto');
  });

  it('never offers a 0% suggestion in the sample', () => {
    const sample = normaliseSample({
      items: [
        { suggestionId: 1, confidence: 0 },
        { suggestionId: 2, confidence: 0.01 },
        { suggestionId: 3, confidence: 0.9 },
      ],
    });
    expect(sample.items.map((item) => item.suggestionId)).toEqual([2, 3]);
  });

  it('lists every band in order, unscored last, with the default bands when none are sent', () => {
    const overview = normaliseOverview({
      candidates: { byBand: { '70to80': 4, unscored: 2, lt50: 'x' } },
      bands: [{ key: 'broken' }],
    });
    expect(candidateBands(overview)).toEqual([
      { key: 'lt50', label: 'Under 50%', count: 0 },
      { key: '50to70', label: '50–70%', count: 0 },
      { key: '70to80', label: '70–80%', count: 4 },
      { key: '80to90', label: '80–90%', count: 0 },
      { key: '90to95', label: '90–95%', count: 0 },
      { key: 'gte95', label: '95% and over', count: 0 },
      { key: 'unscored', label: 'No score yet', count: 2 },
    ]);
  });

  it("uses the server's bands when it sends them", () => {
    const overview = normaliseOverview({
      candidates: { byBand: { low: 1, high: 5 } },
      bands: [
        { key: 'low', from: 0, to: 0.6 },
        { key: 'high', from: 0.6, to: 1 },
      ],
    });
    expect(candidateBands(overview).map((row) => [row.label, row.count])).toEqual([
      ['Under 60%', 1],
      ['60% and over', 5],
      ['No score yet', 0],
    ]);
  });
});

describe('per-action overview (optional: an older backend sends none)', () => {
  it('an overview without actions reads as no actions, not as four empty ones', () => {
    const overview = normaliseOverview({ settings: { remove: { mode: 'auto', threshold: 0.9 } } });
    expect(overview.actions).toBeNull();
    expect(overview.transientSkips).toBe(0);
  });

  it('reads every field defensively and keeps only the known actions', () => {
    const overview = normaliseOverview({
      transientSkips: 2,
      actions: {
        hold: {
          mode: 'weird',
          threshold: null,
          agreement: { decided: 4, agreed: 3, rate: 0.75, atThreshold: null },
          gate: { allowed: false, needRated: 16, rate: 0.75, reason: 'not_enough_rated' },
          wouldAct: 2,
          actedLast90d: 1,
          blockedBy: ['kb.consolidation_enabled', 7],
        },
        approveMined: { mode: 'auto', threshold: 0.85 },
        unknown: { mode: 'auto' },
      },
    });
    expect(overview.transientSkips).toBe(2);
    expect(Object.keys(overview.actions ?? {}).sort()).toEqual(['approveMined', 'hold']);
    expect(overview.actions?.hold).toEqual({
      mode: 'shadow',
      threshold: null,
      agreement: { decided: 4, agreed: 3, rate: 0.75, atThreshold: null },
      gate: { allowed: false, needRated: 16, rate: 0.75, reason: 'not_enough_rated' },
      wouldAct: 2,
      actedLast90d: 1,
      blockedBy: ['kb.consolidation_enabled'],
    });
    // A missing gate never reads as "allowed" for an action the backend did not vouch for.
    expect(overview.actions?.approveMined?.gate.allowed).toBe(false);
    expect(overview.actions?.approveMined?.threshold).toBe(0.85);
    expect(overview.actions?.approveMined?.blockedBy).toEqual([]);
  });

  it('falls back to the last scoring run for transientSkips', () => {
    expect(normaliseOverview({ scoring: { lastRun: { transientSkips: 3 } } }).transientSkips).toBe(
      3
    );
  });

  it('keeps a sample row that has an entry but no suggestion (mined approvals)', () => {
    const sample = normaliseSample({
      items: [{ entryId: 9, suggestionId: null, confidence: 0.9 }],
    });
    expect(sample.items.map((item) => [item.entryId, item.suggestionId])).toEqual([[9, null]]);
  });
});

describe('kbAutoActionsService requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for the sample of one action', async () => {
    api.get.mockResolvedValue({ data: { data: { items: [] } } });
    await kbAutoActionsService.getSample(30, 'hold');
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/sample', {
      params: { limit: 30, action: 'hold' },
    });
  });

  it('rate posts the rating and nothing else', async () => {
    api.post.mockResolvedValue({ data: { data: {} } });
    await kbAutoActionsService.rate('hold', 5, false);
    expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/ratings', {
      action: 'hold',
      entryId: 5,
      agreed: false,
    });
  });

  it('a partial patch sends only the actions given', async () => {
    api.patch.mockResolvedValue({
      data: { data: { settings: { remove: { mode: 'shadow', threshold: 0.9 } } } },
    });
    await kbAutoActionsService.patchSettings({ hold: { mode: 'auto' } });
    expect(api.patch).toHaveBeenCalledWith('/api/knowledge-base/auto-actions/settings', {
      hold: { mode: 'auto' },
    });
  });

  it('reads the gate refusal off a 409', () => {
    expect(
      kbAutoActionsService.gateRefusal({
        status: 409,
        data: {
          code: 'AUTOMATION_NEEDS_SAMPLE',
          action: 'hold',
          needRated: 2,
          rate: null,
          reason: 'not_enough_rated',
        },
      })
    ).toEqual({ action: 'hold', needRated: 2, rate: null, reason: 'not_enough_rated' });
    expect(kbAutoActionsService.gateRefusal({ status: 409, data: { code: 'OTHER' } })).toBeNull();
    expect(kbAutoActionsService.gateRefusal(new Error('x'))).toBeNull();
  });
});
