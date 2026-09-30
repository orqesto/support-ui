import { describe, expect, it } from 'vitest';
import { describeRunProblems } from '../processingWords';
import { makeRun } from './fixtures';

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
    const run = makeRun({ channel: 'kb', outcome: 'failed', failed: 1, problems: ['failed'] });
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
    expect(
      describeRunProblems(makeRun({ channel: 'kb', outcome: 'running', problems: ['interrupted'] }))
    ).toBe('This mine stopped before it finished (for example on a restart).');
  });

  it('no problems, no line', () => {
    expect(describeRunProblems(makeRun({ outcome: 'failed', failed: 2, problems: [] }))).toBeNull();
  });
});
