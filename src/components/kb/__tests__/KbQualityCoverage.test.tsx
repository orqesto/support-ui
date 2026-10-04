/**
 * KB quality review — the coverage line. It exists because a bound must report that it bit: the
 * review checks a few hundred entries a night, and a review that stopped makes no suggestions
 * either, so "no suggestions" must never read as "the knowledge base is clean".
 */
import { describe, expect, it } from 'vitest';
import { describeQualityStatus, QUALITY_STALL_DAYS } from '../KbQualityCoverage';
import { normaliseQualityStatus, type KbQualityStatus } from '@/services/kbQuality.service';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const status = (over: Partial<KbQualityStatus['coverage']> = {}, state: KbQualityStatus['state'] = 'on'): KbQualityStatus => ({
  state,
  coverage: { entries: 50_000, checked: 1_200, notYet: 48_770, unassessed: 30, rewritesWaiting: 0, lastCheckedAt: '2026-10-10T05:10:00.000Z', ...over },
});

describe('describeQualityStatus', () => {
  it('says how much has been checked and how much has not', () => {
    const { variant, text } = describeQualityStatus(status(), NOW);
    expect(variant).toBe('default');
    expect(text).toContain('Checked 1,200 of 50,000 learned entries (2%).');
    expect(text).toContain('48,770 not checked yet');
    expect(text).toContain('30 could not be assessed');
  });

  it(`warns when nothing was checked for more than ${QUALITY_STALL_DAYS} days while entries still wait`, () => {
    const { variant, text } = describeQualityStatus(status({ lastCheckedAt: '2026-10-01T05:00:00.000Z' }), NOW);
    expect(variant).toBe('warning');
    expect(text).toMatch(/Nothing has been checked since .* the review may be failing/);
  });

  it('CONTROL — an old last check is not a stall when everything is checked', () => {
    const { variant } = describeQualityStatus(
      status({ checked: 50_000, notYet: 0, unassessed: 0, lastCheckedAt: '2026-09-01T05:00:00.000Z' }),
      NOW
    );
    expect(variant).toBe('default');
  });

  it('warns when the review is on but nothing was ever checked', () => {
    const { variant, text } = describeQualityStatus(status({ checked: 0, lastCheckedAt: null }), NOW);
    expect(variant).toBe('warning');
    expect(text).toContain('Nothing has been checked yet');
  });

  it('names each state where the review does not run', () => {
    expect(describeQualityStatus(status({}, 'off'), NOW).text).toContain('is off');
    expect(describeQualityStatus(status({}, 'dry_run'), NOW).text).toContain('calibration');
    const noProvider = describeQualityStatus(status({}, 'no_provider'), NOW);
    expect(noProvider.variant).toBe('warning');
    expect(noProvider.text).toContain('no usable AI provider');
  });
});

describe('normaliseQualityStatus', () => {
  it('is null for an unknown state or no body — the line is then not shown', () => {
    expect(normaliseQualityStatus(undefined)).toBeNull();
    expect(normaliseQualityStatus({ state: 'maybe', coverage: {} })).toBeNull();
  });

  it('reads a missing or negative count as 0', () => {
    expect(normaliseQualityStatus({ state: 'on', coverage: { entries: 5, checked: -1 } })?.coverage).toEqual({
      entries: 5,
      checked: 0,
      notYet: 0,
      unassessed: 0,
      rewritesWaiting: 0,
      lastCheckedAt: null,
    });
  });
});
