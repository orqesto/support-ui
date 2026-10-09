/**
 * FE-3a panel words for the two new KB stops: `kb_full` (user action: make room) and
 * `ai_unavailable` (nothing mined; retried by the next Re-mine or automatically).
 */
import { describe, expect, it } from 'vitest';
import { describePause, describeRunProblems, isKbLimitPause, runStatus } from '../processingWords';
import { makeKbRun } from './fixtures';

const KB_FULL =
  'Stopped: the knowledge base is full (plan limit). The remaining conversations are mined when there is room — remove KB items or raise the plan, then press Re-mine.';

const kbFull = () =>
  makeKbRun({ outcome: 'paused', problems: ['paused'], stoppedBy: 'kb_full', resumesAt: null });
const aiDown = (over = {}) =>
  makeKbRun({
    outcome: 'failed',
    problems: ['failed'],
    stoppedBy: 'ai_unavailable',
    aiSkipped: 0,
    aiReason: 'rate_limited',
    ...over,
  });

describe('kb_full', () => {
  it('says the plan limit and the way out, never "resumes by itself"', () => {
    expect(describePause(kbFull())).toBe(KB_FULL);
    expect(describeRunProblems(kbFull())).toBe(KB_FULL);
    expect(describePause(kbFull())).not.toMatch(/resumes by itself/i);
    expect(isKbLimitPause(kbFull())).toBe(false);
  });
  it('CONTROL: the daily-limit pause still resumes by itself', () => {
    const run = makeKbRun({
      outcome: 'paused',
      problems: ['paused'],
      stoppedBy: 'kb_token_limit',
      resumesAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(describePause(run)).toMatch(/resumes by itself/);
  });
});

describe('ai_unavailable', () => {
  it('re_mine and absent retry both say the next Re-mine; automatic says retried automatically', () => {
    const reMine =
      "Stopped: AI was unavailable (this workspace's hourly AI allowance is used up). Conversations not yet mined stay unmined and will be mined by the next Re-mine.";
    const auto =
      "Stopped: AI was unavailable (this workspace's hourly AI allowance is used up). Conversations not yet mined stay unmined and will be retried automatically.";
    expect(describePause(aiDown({ retry: 're_mine' }))).toBe(reMine);
    expect(describePause(aiDown())).toBe(reMine);
    expect(describePause(aiDown({ retry: 'automatic' }))).toBe(auto);
    expect(describeRunProblems(aiDown({ retry: 'automatic' }))).toContain('retried automatically');
    expect(describeRunProblems(aiDown({ retry: 're_mine' }))).not.toContain('automatically');
  });
  it('never prints the raw reason code', () => {
    expect(describePause(aiDown({ aiReason: 'provider_quota' }))).not.toContain('provider_quota');
    expect(describePause(aiDown({ aiReason: 'brand_new_code' }))).not.toContain('brand_new_code');
  });
  it('G10n: it is NOT a limit pause', () => {
    expect(isKbLimitPause(aiDown())).toBe(false);
    expect(runStatus(aiDown())).toBe('failed');
  });
  it('a plain failed KB mine says nothing about AI', () => {
    const run = makeKbRun({ outcome: 'failed', problems: ['failed'], failed: 2, stoppedBy: null });
    expect(describePause(run)).toBeNull();
    expect(describeRunProblems(run)).not.toMatch(/AI was unavailable/);
  });
});
