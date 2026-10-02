/**
 * Audit pass 5 (FE, LOW-MED): a KB-limit pause the restarted mine could not continue is closed by
 * a newer `{ outcome: 'done', kbThreads: 0, stoppedBy: 'kb_off' | 'no_kb_cutoff' | ... }` record
 * (support-service R4 contract). Read as a plain done it said green "Done · 0 of 0" — a clean empty
 * mine — over an abandoned backlog.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeKbRun, makeRun } from './fixtures';

// The real service method the components could reach (getKbMiningFailures does not exist).
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: { dismissKbFailure: () => Promise.resolve() },
}));

const { RecentRuns } = await import('../RecentRuns');
const { RunDetails } = await import('../RunDetails');
const { describeNotContinued, describeRunProblems, runStatus, runStatusLabel, RUN_STATUS_VARIANT } =
  await import('../processingWords');

const closing = (stoppedBy: string | null) =>
  makeKbRun({
    id: `close-${stoppedBy}`,
    outcome: 'done',
    found: 0,
    saved: 0,
    kbThreads: 0,
    kbThreadsDone: 0,
    kbPairsSaved: 0,
    stoppedBy,
  });

afterEach(() => cleanup());

describe('a paused KB mine closed without continuing', () => {
  it.each([
    ['kb_off', 'the knowledge base was switched off for this mailbox'],
    ['no_kb_cutoff', 'no KB cutoff is set for this mailbox'],
    ['source_deleted', 'the mailbox was removed from Odly'],
  ])('%s: a warning "Stopped", never a green Done', (stoppedBy, why) => {
    const run = closing(stoppedBy);
    expect(runStatus(run)).toBe('not_continued');
    expect(runStatusLabel(run)).toBe('Stopped');
    expect(RUN_STATUS_VARIANT[runStatus(run)]).toBe('warning');
    expect(describeNotContinued(run)).toBe(`Stopped: ${why} — the paused mining did not continue.`);
  });

  it('stoppedBy null (nothing left in scope) is a clean end: still Done', () => {
    const run = closing(null);
    expect(runStatus(run)).toBe('done');
    expect(describeNotContinued(run)).toBeNull();
  });

  it('a mail check that happens to carry the same code is not affected', () => {
    const run = makeRun({ outcome: 'done', stoppedBy: 'kb_off' });
    expect(runStatus(run)).toBe('done');
  });

  it('the run list says the mining did not continue, not "0 of 0 conversations"', () => {
    render(
      <MemoryRouter>
        <RecentRuns runs={[closing('kb_off')]} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText(/Recent checks/));
    const list = screen.getByTestId('recent-runs');
    expect(list.textContent).toContain(
      'KB mining · paused mining not continued: the knowledge base was switched off'
    );
    expect(list.textContent).not.toContain('0 of 0');
    expect(list.textContent).toContain('Stopped');
    expect(list.textContent).not.toContain('Done');
  });

  it('the run details say why, not "Read 0 of 0 conversations"', () => {
    render(<RunDetails run={closing('no_kb_cutoff')} />);
    const details = screen.getByTestId('run-details');
    expect(details.textContent).toContain(
      'Stopped: no KB cutoff is set for this mailbox — the paused mining did not continue.'
    );
    expect(details.textContent).not.toMatch(/Read 0 of/);
    expect(details.textContent).not.toContain('Done');
  });

  it('a close record is not timed: no "Took 0 ms." (FE audit pass 8, NIT)', () => {
    render(<RunDetails run={{ ...closing('kb_off'), processMs: 0 }} />);
    expect(screen.getByTestId('run-details').textContent).not.toMatch(/Took/);
  });

  // Each guard alone (pass 17 follow-up, NIT): with processMs 0 the zero-work guard hid "Took" too.
  it('a close record is not timed even with a processing time recorded', () => {
    render(<RunDetails run={{ ...closing('kb_off'), processMs: 1_500 }} />);
    expect(screen.getByTestId('run-details').textContent).not.toMatch(/Took/);
  });

  it('a clean close (stoppedBy null, nothing left in scope) is not timed either (pass 9)', () => {
    render(<RunDetails run={{ ...closing(null), processMs: 0 }} />);
    expect(screen.getByTestId('run-details').textContent).not.toMatch(/Took/);
  });

  it('a pause marker (recordKbRunPaused: processMs 0, threads counted, none read) is not timed (pass 9)', () => {
    // be-toklim-wt 2b678d40 kbRunLedger recordKbRunPaused: outcome 'paused', processMs 0,
    // kbThreads = the counted backlog, kbThreadsDone 0, stoppedBy 'kb_token_limit' (unchanged at
    // 23eb92ef, which also sets `found` to the backlog's messages).
    const marker = makeKbRun({
      ...closing(null),
      id: 'pause-marker',
      outcome: 'paused',
      stoppedBy: 'kb_token_limit',
      found: 55, // the counted backlog's messages (`found: counted.messages`)
      kbThreads: 40,
      kbThreadsDone: 0,
      processMs: 0,
      resumesAt: '2099-10-02T00:00:00.000Z',
      problems: ['paused'],
    });
    render(<RunDetails run={marker} />);
    expect(screen.getByTestId('run-details').textContent).not.toMatch(/Took/);
  });

  it('CONTROL: a real mine that read conversations IS timed', () => {
    const mine = makeKbRun({
      ...closing(null),
      id: 'real-mine',
      kbThreads: 12,
      kbThreadsDone: 12,
      kbPairsSaved: 5,
      processMs: 34_000,
    });
    render(<RunDetails run={mine} />);
    expect(screen.getByTestId('run-details').textContent).toMatch(/Took /);
  });
});

/**
 * R8 contract (d): a resumed mine that threw before recording its run leaves
 * `{ outcome: 'error', stoppedBy: null, kbThreads: 0 }` after the pause (be-toklim-wt 2b678d40
 * kbRunLedger `closeKbRunPause(…, null, 'error')`; runsView gives it `problems: ['failed']`).
 */
describe('a KB mine that ended on an error before reading anything', () => {
  const errored = () =>
    makeKbRun({
      ...closing(null),
      id: 'close-error',
      outcome: 'error',
      processMs: 0,
      problems: ['failed'],
    });

  it('the list and details say it stopped on an error before reading — not "0 of 0", not timed', () => {
    render(
      <MemoryRouter>
        <RecentRuns runs={[errored()]} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText(/Recent checks/));
    const list = screen.getByTestId('recent-runs').textContent ?? '';
    expect(list).toContain('KB mining · stopped on an error before reading any conversation');
    expect(list).not.toContain('0 of 0');
    expect(list).toContain('Error');
    cleanup();
    render(<RunDetails run={errored()} />);
    const details = screen.getByTestId('run-details').textContent ?? '';
    expect(details).toContain('The mine stopped on an error before it read any conversation.');
    expect(details).not.toMatch(/Read 0 of|Took|Paused|resume/);
  });

  it('an error before reading is not timed even with a processing time recorded', () => {
    render(<RunDetails run={{ ...errored(), processMs: 1_500 }} />);
    expect(screen.getByTestId('run-details').textContent).not.toMatch(/Took/);
  });

  // Pass 17 follow-up, LOW: listed as an older problem it is worded as the list and details do.
  it('as an older problem it also says "before it read any conversation"', () => {
    expect(describeRunProblems(errored())).toBe(
      'The mine stopped on an error before it read any conversation. Re-mine the mailbox to try again.'
    );
  });

  it('CONTROL: an error after reading keeps its counts and its time', () => {
    const run = makeKbRun({
      ...errored(),
      kbThreads: 40,
      kbThreadsDone: 12,
      processMs: 2_000,
    });
    render(<RunDetails run={run} />);
    const details = screen.getByTestId('run-details').textContent ?? '';
    expect(details).toContain('Read 12 of 40 conversations');
    expect(details).toContain('The mine stopped on an error.');
    expect(details).toMatch(/Took 2\.0 s/);
  });
});
