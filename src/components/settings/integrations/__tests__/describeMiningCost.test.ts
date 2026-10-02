import { describe, expect, it } from 'vitest';
import { describeMiningCost } from '../SourceKbStrip';

const base = {
  threadsToMine: 1_200,
  tokensPerThread: { value: 1_000, threadsMeasured: 40, windowDays: 30 },
  estimatedTokens: 1_200_000,
  daysAtLimit: 1,
  limit: { limit: 5_000_000, source: 'default' },
  spentToday: 0,
  enforced: true,
};

// A backlog the BE really forecasts as 3 days (be-toklim-wt 23eb92ef `daysToMine`: 1.2M tokens at
// 500k a day, none spent ⇒ 1 + ceil(700k / 500k) = 3) — not `daysAtLimit: 3` beside a 5M limit
// the same 1.2M fits in today (FE fix round 15, fixture realism).
const threeDays = { ...base, daysAtLimit: 3, limit: { limit: 500_000, source: 'platform' } };

describe('describeMiningCost — the Re-mine confirmation', () => {
  it('states the count, the measured cost, and that it fits today', () => {
    const line = describeMiningCost(base);
    expect(line).toContain((1_200).toLocaleString());
    expect(line).toContain((1_200_000).toLocaleString());
    expect(line).toContain('measured on this workspace');
    expect(line).toContain('fits in today');
  });

  it('several days, workspace STOPPED at its limit: says it pauses and resumes after the reset', () => {
    const line = describeMiningCost({ ...threeDays, enforced: true });
    expect(line).toContain('about 3 days');
    expect(line).toMatch(/pauses each day .* after the reset at 00:00 UTC \(\d\d:\d\d your time\)/);
  });

  it('several days, own key measured only: never promises a pause (F2)', () => {
    const line = describeMiningCost({ ...threeDays, enforced: false });
    expect(line).toContain('about 3 days');
    expect(line).toContain('does not pause');
    expect(line).not.toContain('pauses each day');
  });

  // BE R17 `enforcementLookupFailed` is also a fresh read that disagreed with the cached answer:
  // the words hold for both (pass 19, LOW).
  it('several days, AI settings unreadable or disagreeing: `enforced` is a fallback — unknown, never a pause or "does not pause"', () => {
    for (const enforced of [true, false]) {
      const line = describeMiningCost({
        ...threeDays,
        enforced,
        enforcementLookupFailed: true,
      });
      expect(line).toContain(
        'That is about 3 days of the daily KB limit; this workspace’s AI settings or the platform limit settings could not be read or disagree with the answer in use — whether the limit stops work is unknown.'
      );
      expect(line).not.toContain('could not read this');
      expect(line).not.toContain('pauses each day');
      expect(line).not.toContain('does not pause');
    }
  });

  it('not measured: the count, and says the cost is unknown — never a guessed figure', () => {
    const line = describeMiningCost({ ...base, tokensPerThread: null, estimatedTokens: null });
    expect(line).toContain('not measured yet');
    expect(line).not.toMatch(/about [\d,.]+ tokens/);
  });

  it('no KB cutoff: says a cutoff must be set, not "already mined" (F1)', () => {
    const line = describeMiningCost({
      ...base,
      threadsToMine: 0,
      sources: [{ sourceId: 1, threadsInScope: 0, threadsToMine: 0, noCutoff: true }],
    });
    expect(line).toContain('no KB cutoff');
    expect(line).not.toContain('already mined');
  });

  it('nothing in scope: says there is nothing to read, not "already mined" (F1)', () => {
    const line = describeMiningCost({
      ...base,
      threadsToMine: 0,
      sources: [{ sourceId: 1, threadsInScope: 0, threadsToMine: 0, noCutoff: false }],
    });
    expect(line).toContain('nothing to read');
    expect(line).not.toContain('already mined');
  });

  it('older backend without `sources`: claims neither "already mined" nor a cutoff', () => {
    const line = describeMiningCost({ ...base, threadsToMine: 0 });
    expect(line).toContain('No conversation is waiting');
    expect(line).not.toContain('already mined');
  });

  it('nothing to mine, and no forecast at all, are each said plainly', () => {
    expect(
      describeMiningCost({
        ...base,
        threadsToMine: 0,
        sources: [{ sourceId: 1, threadsInScope: 12, threadsToMine: 0, noCutoff: false }],
      })
    ).toContain('already mined');
    expect(describeMiningCost(undefined)).toContain('no estimate could be loaded');
  });
});
