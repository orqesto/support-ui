import { describe, it, expect } from 'vitest';
import {
  describeGroupAction,
  formatFailedAt,
  formatJobCount,
  formatMemoryBreakdown,
  formatMemoryFigures,
  formatWorkspace,
} from '../failureAnalysis.format';
import type { QueueFailureGroup } from '@/services/platform.service';

const group: QueueFailureGroup = {
  reason: 'invalid input value for enum ticket_priority: "High" (22P02)',
  count: 9,
  queues: [
    { name: 'ai-analysis', count: 8 },
    { name: 'ai-reanalyze', count: 1 },
  ],
  organizations: [{ id: 21, count: 9 }],
  firstFailedAt: 1_000,
  lastFailedAt: 2_000,
  sample: [],
  jobs: Array.from({ length: 9 }, (_, index) => ({ queue: 'ai-analysis', id: String(index) })),
};

describe('failure analysis formatting', () => {
  it('renders a dash for a missing timestamp and a locale string otherwise', () => {
    expect(formatFailedAt(null)).toBe('—');
    expect(formatFailedAt(Number.NaN)).toBe('—');
    expect(formatFailedAt(0)).not.toBe('—');
  });

  it('labels workspaces and counts jobs', () => {
    expect(formatWorkspace(21)).toBe('org 21');
    expect(formatWorkspace(null)).toBe('no workspace');
    expect(formatJobCount(1)).toBe('1 job');
    expect(formatJobCount(9)).toBe('9 jobs');
  });

  it('confirms a bulk action by verb, count and queues', () => {
    expect(describeGroupAction('retry', group)).toBe('Retry 9 jobs in ai-analysis, ai-reanalyze?');
    expect(describeGroupAction('remove', group)).toBe('Remove 9 jobs in ai-analysis, ai-reanalyze?');
  });

  it('explains a memory percentage with the figures behind it', () => {
    expect(formatMemoryFigures({ used: 1020, total: 3584, limitSource: 'cgroup' })).toBe(
      '1,020 of 3,584 MB (container limit)'
    );
    expect(formatMemoryFigures({ used: 335, total: 7937, limitSource: 'host' })).toBe(
      '335 of 7,937 MB (host memory, no container limit)'
    );
    // The backend sized itself — the total is NOT host memory (2026-09-16).
    expect(formatMemoryFigures({ used: 619, total: 6963, limitSource: 'budget' })).toBe(
      '619 of 6,963 MB (automatic: 85% of free memory, at least 2,048 MB)'
    );
    // A value this build does not know claims neither.
    expect(formatMemoryFigures({ used: 1, total: 2, limitSource: 'future' })).toBe('1 of 2 MB (memory limit)');
    expect(formatMemoryFigures(null)).toBeNull();
    expect(formatMemoryBreakdown({ rssMB: 1020, heapUsedMB: 210, externalMB: 700, arrayBuffersMB: 12 })).toBe(
      'heap 210 MB · native 712 MB · other 98 MB'
    );
    expect(formatMemoryBreakdown(undefined)).toBeNull();
  });
});
