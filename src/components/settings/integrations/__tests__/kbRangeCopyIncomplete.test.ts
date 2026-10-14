import { describe, expect, it } from 'vitest';
import type { KbRangeCount, KbRangeEstimate } from '@/services/integrations.service';
import { costLine, historyLine, recentLine } from '../kbRangeCopy';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const count = (over: Partial<KbRangeCount> = {}): KbRangeCount => ({
  inRange: 1200,
  inOdly: 300,
  toFetch: 900,
  unverifiable: 0,
  notCompared: 0,
  capped: false,
  cappedBy: null,
  timedOut: false,
  approximate: false,
  from: null,
  to: null,
  ...over,
});
const estimate = (over: Partial<KbRangeEstimate> = {}): KbRangeEstimate => ({
  newThreads: 100,
  backlogThreads: 20,
  threadsToMine: 120,
  threadsBasis: 'distinct_threads',
  tokensPerThread: 2500,
  estimatedTokens: 300000,
  daysAtLimit: 1,
  limit: 500000,
  spentToday: 0,
  enforced: true,
  ...over,
});

/** A count that stopped early is not a count of zero (2026-10). */
describe('kbRangeCopy — incomplete counts', () => {
  it('an incomplete count that found nothing missing yet says "not known", never 0', () => {
    // A customer's workspace, 2026-10: 10,500 listed, 1,000 compared (all in Odly), 9,500 not
    // compared — the dialog said "at least 0 to fetch" and "≈0 tokens".
    const partial = count({
      inRange: 10500,
      inOdly: 1000,
      toFetch: 0,
      notCompared: 9500,
      capped: true,
      cappedBy: 'time',
      timedOut: true,
      approximate: true,
    });
    const history = historyLine(partial);
    expect(history).toContain('not known yet how many to fetch');
    expect(history).not.toMatch(/\b0 to fetch/);
    const zero = estimate({
      newThreads: 0,
      backlogThreads: 0,
      threadsToMine: 0,
      estimatedTokens: 0,
    });
    const cost = costLine(zero, 'managed', 0, partial);
    expect(cost).toBe(
      'Token cost: cannot be estimated — the count stopped before it found which messages are missing.'
    );
    expect(cost).not.toMatch(/≈0/);
    // A real lower bound stays one.
    expect(historyLine(count({ timedOut: true, toFetch: 40, notCompared: 9 }))).toContain(
      'at least 40 to fetch'
    );
    expect(costLine(estimate(), 'managed', 0, partial)).toMatch(/^At least ≈300,000 tokens/);
    // A complete count of nothing missing is a real 0.
    expect(costLine(zero, 'managed', 0, count({ toFetch: 0 }))).not.toMatch(/cannot be estimated/);
  });

  it('recent line: says "since the cutoff" only when the backend started the window there', () => {
    const cutoff = '2026-09-16T10:00:00.000Z';
    // A backend that counts recent mail after the cutoff: `from` is the cutoff.
    expect(recentLine(count({ toFetch: 12, from: cutoff }), 180, cutoff)).toBe(
      `Recent re-check (mail since the cutoff, ${day(cutoff)}): 12 not in Odly will be imported as regular mail.`
    );
    // The window starts after the cutoff (N days ago): the last N days.
    expect(recentLine(count({ toFetch: 12, from: '2026-10-07T09:00:00.000Z' }), 7, cutoff)).toBe(
      'Recent re-check (last 7 days): 12 not in Odly will be imported as regular mail.'
    );
    // An older backend counts the whole last N days (from before the cutoff): no claim about it.
    expect(recentLine(count({ toFetch: 12, from: '2026-04-17T09:00:00.000Z' }), 180, cutoff)).toBe(
      'Recent re-check (last 180 days): 12 not in Odly will be imported as regular mail.'
    );
  });
});
