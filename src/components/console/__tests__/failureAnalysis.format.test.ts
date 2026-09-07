import { describe, it, expect } from 'vitest';
import { describeGroupAction, formatFailedAt, formatJobCount, formatWorkspace } from '../failureAnalysis.format';
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
});
