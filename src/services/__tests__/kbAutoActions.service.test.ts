import { describe, it, expect } from 'vitest';
import {
  agreementAt,
  normaliseOverview,
  normaliseRemovedPage,
  normaliseSample,
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
  it('reads an empty or malformed overview as Off with nothing waiting', () => {
    for (const raw of [undefined, null, 'html', { settings: { remove: { mode: 'weird' } } }]) {
      const overview = normaliseOverview(raw);
      expect(overview.settings.remove.mode).toBe('off');
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
});
