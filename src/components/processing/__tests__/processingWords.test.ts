import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeRunProblems } from '../processingWords';
import { makeKbRun, makeRun } from './fixtures';

/**
 * The one line for an OLDER run that still wants attention. It must name the run's current
 * problems (backend `problemsOf`), not whatever its outcome once was: on staging (2026-09-30) a
 * failed run superseded by a later clean one, left with `stalled`, said "1 could not be saved"
 * and never mentioned the work left.
 */
describe('describeRunProblems', () => {
  it('a superseded failure left with work names the work, not the failure', () => {
    const run = makeRun({ outcome: 'failed', failed: 1, problems: ['stalled'] });
    expect(describeRunProblems(run)).toBe(
      'Work is left, and this check ended over 30 minutes ago.'
    );
  });

  it('a failure says what could not be saved, with it or them', () => {
    expect(
      describeRunProblems(makeRun({ outcome: 'failed', failed: 1, problems: ['failed'] }))
    ).toBe('1 message could not be saved; the next check fetches it again.');
    expect(
      describeRunProblems(makeRun({ outcome: 'failed', failed: 3, problems: ['failed'] }))
    ).toBe('3 messages could not be saved; the next check fetches them again.');
  });

  it('a knowledge-base failure is about mining', () => {
    const run = makeKbRun({ outcome: 'failed', failed: 1, problems: ['failed'] });
    expect(describeRunProblems(run)).toBe(
      '1 conversation could not be mined. Re-mine the mailbox to read it again.'
    );
  });

  it('an error run (problem `failed`, nothing counted) says it stopped on an error', () => {
    const run = makeRun({ outcome: 'error', failed: 0, problems: ['failed'] });
    expect(describeRunProblems(run)).toBe(
      'The check stopped on an error. The next check tries again.'
    );
  });

  it('an error run that also counted failures says both, as the run details do', () => {
    const run = makeRun({ outcome: 'error', failed: 2, problems: ['failed'] });
    expect(describeRunProblems(run)).toBe(
      '2 messages could not be saved; the next check fetches them again. The check stopped on an error. The next check tries again.'
    );
  });

  it('a pause, an interruption, and several problems in one line', () => {
    expect(
      describeRunProblems(
        makeRun({ outcome: 'paused', stoppedBy: 'daily_limit', problems: ['paused'] })
      )
    ).toBe("Paused because Gmail's daily limit was reached. The rest follow on the next check.");
    expect(
      describeRunProblems(makeRun({ outcome: 'running', problems: ['interrupted', 'stalled'] }))
    ).toBe(
      'This check stopped before it finished (for example on a restart). Work is left, and this check ended over 30 minutes ago.'
    );
    expect(describeRunProblems(makeKbRun({ outcome: 'running', problems: ['interrupted'] }))).toBe(
      'This mine stopped before it finished (for example on a restart).'
    );
  });

  it('no problems, no line', () => {
    expect(describeRunProblems(makeRun({ outcome: 'failed', failed: 2, problems: [] }))).toBeNull();
  });
});

/**
 * A mine the daily KB token limit paused (backend `kb_token_limit`) waits for the reset and
 * resumes by itself — so it must not say "the rest follow on the next check".
 */
describe('a KB mine paused by the daily KB token limit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T18:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('says the limit was reached and that mining resumes by itself, with the time', () => {
    const line = describeRunProblems(
      makeKbRun({
        outcome: 'paused',
        stoppedBy: 'kb_token_limit',
        resumesAt: '2026-10-01T00:12:00.000Z',
        problems: ['paused'],
      })
    );
    expect(line).toContain('today’s AI limit for KB processing was reached');
    expect(line).toContain('resumes by itself after 00:12 UTC on 2026-10-01 (');
    expect(line).toMatch(/\(\d\d:\d\d your time\)/);
    expect(line).not.toContain('next check');
  });

  it('without a resume time it still names the reset, never a guessed time', () => {
    const line = describeRunProblems(
      makeKbRun({
        outcome: 'paused',
        stoppedBy: 'kb_token_limit',
        problems: ['paused'],
      })
    );
    expect(line).toMatch(/after the daily reset at 00:00 UTC \(\d\d:\d\d your time\)/);
  });

  it('a resume time already passed is said as due then, never as a resume still to come', () => {
    const line = describeRunProblems(
      makeKbRun({
        outcome: 'paused',
        stoppedBy: 'kb_token_limit',
        resumesAt: '2026-09-29T00:12:00.000Z',
        problems: ['paused'],
      })
    );
    expect(line).toContain(
      'Paused by the daily AI limit for KB processing; it was due to resume by itself at 00:12 UTC on 2026-09-29 ('
    );
    expect(line).not.toMatch(/resumes by itself after|today’s/);
  });
});
