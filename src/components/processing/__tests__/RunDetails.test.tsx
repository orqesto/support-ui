/**
 * The facts the old tiles carried (owner, 2026-09-26: keep Failed, Paused, Skipped/duplicates,
 * Timing + linked replies) as sentences that stay true in every state a run can be in.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunDetails } from '../RunDetails';
import { makeRun } from './fixtures';

afterEach(cleanup);

describe('RunDetails', () => {
  it('counts what the run found and saved, and duplicates as already in Odly', () => {
    render(<RunDetails run={makeRun({ found: 12, saved: 10, duplicates: 2 })} />);
    expect(screen.getByText(/12 new messages found, 10 saved, 2 already in Odly\./)).toBeTruthy();
  });

  it('IMAP cannot know duplicates (null): no duplicates line, never "0 already"', () => {
    render(<RunDetails run={makeRun({ channel: 'imap', duplicates: null })} />);
    expect(screen.queryByText(/already in Odly/)).toBeNull();
    expect(screen.getByText(/3 new messages found, 3 saved\./)).toBeTruthy();
  });

  it('a failed save says it is fetched again', () => {
    render(<RunDetails run={makeRun({ failed: 2, outcome: 'failed', problems: ['failed'] })} />);
    expect(
      screen.getByText(/2 messages could not be saved; the next check fetches them again/)
    ).toBeTruthy();
    expect(screen.getByText('Not all saved')).toBeTruthy();
  });

  it('a pause names the cause the backend gave', () => {
    render(
      <RunDetails
        run={makeRun({ outcome: 'paused', stoppedBy: 'daily_limit', problems: ['paused'] })}
      />
    );
    expect(screen.getByText(/Paused because Gmail's daily limit was reached/)).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
  });

  it('a pause under load without a code says the server was busy', () => {
    render(
      <RunDetails run={makeRun({ outcome: 'paused', deferred: true, problems: ['paused'] })} />
    );
    expect(screen.getByText(/Paused because the server was busy/)).toBeTruthy();
  });

  it('an unknown stop code gets the generic line, not a guessed cause', () => {
    render(<RunDetails run={makeRun({ outcome: 'paused', stoppedBy: 'something_new' })} />);
    expect(screen.getByText(/Stopped before it had looked at everything/)).toBeTruthy();
  });

  it('a record left "running" that is not active reads "Did not finish", never "0 saved" (pass 3, H-B)', () => {
    render(
      <RunDetails
        run={makeRun({
          outcome: 'running',
          active: false,
          finishedAt: null,
          found: 40,
          saved: 0,
          problems: ['interrupted'],
        })}
      />
    );
    expect(screen.getByText('Did not finish')).toBeTruthy();
    expect(screen.queryByText('Running')).toBeNull();
    expect(screen.getByText(/Set out to go through 40 messages/)).toBeTruthy();
    expect(screen.queryByText(/0 saved/)).toBeNull();
    expect(screen.getByText(/stopped before it finished/)).toBeTruthy();
  });

  it('CONTROL: an active run reads Running', () => {
    render(<RunDetails run={makeRun({ outcome: 'running', active: true, finishedAt: null })} />);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText(/Checking since/)).toBeTruthy();
  });

  it('stalled says nothing has moved, and its badge says Stalled, not Done', () => {
    render(<RunDetails run={makeRun({ workRemaining: true, problems: ['stalled'] })} />);
    expect(screen.getByText(/Work is left, and this check ended over 30 minutes ago/)).toBeTruthy();
    expect(screen.getByText('Work left')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('a run still going says what it is going through, never "0 saved" (audit pass 2, H2)', () => {
    render(
      <RunDetails
        run={makeRun({
          outcome: 'running',
          active: true,
          finishedAt: null,
          found: 150,
          saved: 0,
          stages: null,
        })}
      />
    );
    expect(screen.getByText(/Going through 150 messages/)).toBeTruthy();
    expect(screen.queryByText(/0 saved/)).toBeNull();
  });

  it('linked replies, awaiting routing, KB entries and timing each get a line', () => {
    const base = makeRun();
    render(
      <RunDetails
        run={makeRun({
          linked: 2,
          fetchMs: 1200,
          processMs: 450,
          kbEntries: { qaPairs: 3, documents: 1 },
          stages: { ...base.stages!, awaitingRouting: 1 },
        })}
      />
    );
    expect(screen.getByText(/2 replies linked to existing tickets/)).toBeTruthy();
    expect(screen.getByText(/1 message is waiting for someone to route it/)).toBeTruthy();
    expect(
      screen.getByText(/Knowledge base: 4 entries from these messages \(3 Q&A, 1 docs\)/)
    ).toBeTruthy();
    expect(screen.getByText(/Fetched in 1\.2 s, processed in 450 ms\./)).toBeTruthy();
  });

  it('stages nothing was queued for are not drawn as a finished 0 / 0', () => {
    render(<RunDetails run={makeRun()} />);
    const rows = screen.getAllByTestId('run-stage').map((row) => row.textContent);
    expect(rows).toHaveLength(3); // checked, analysis, index — KB queued 0
    expect(rows.join()).not.toMatch(/Knowledge base/);
    expect(rows[0]).toMatch(/Checked.*3 \/ 3/);
  });

  it('no timing line when neither time is known', () => {
    render(<RunDetails run={makeRun()} />);
    expect(screen.queryByText(/Fetched in|Processed in/)).toBeNull();
  });

  describe('a knowledge-base mine (channel kb)', () => {
    const kbRun = (over: Parameters<typeof makeRun>[0] = {}) =>
      makeRun({
        channel: 'kb',
        found: 120,
        saved: 0,
        duplicates: null,
        kbThreads: 30,
        kbThreadsDone: 30,
        kbPairsSaved: 7,
        kbEntries: { qaPairs: 7, documents: 0 },
        stages: {
          decided: { queued: 0, done: 0 },
          analysis: { queued: 0, done: 0 },
          embedding: { queued: 0, done: 0 },
          kb: { queued: 30, done: 30 },
          awaitingRouting: 0,
        },
        ...over,
      });

    it('says what it read and saved — never "new messages found, 0 saved"', () => {
      render(<RunDetails run={kbRun()} />);
      expect(screen.getByText(/Knowledge-base mining/)).toBeTruthy();
      expect(
        screen.getByText(/Read 30 of 30 conversations \(120 messages\); 7 new Q&A pairs saved/)
      ).toBeTruthy();
      expect(screen.queryByText(/new messages found/)).toBeNull();
      expect(screen.queryByText(/entries from these messages/)).toBeNull();
    });

    it('documents saved from attachments are named apart from Q&A pairs', () => {
      render(<RunDetails run={kbRun({ kbPairsSaved: 7, kbDocumentsSaved: 2 })} />);
      expect(screen.getByText(/7 new Q&A pairs and 2 documents saved/)).toBeTruthy();
    });

    it('while mining, documents saved so far are named too', () => {
      render(
        <RunDetails
          run={kbRun({
            outcome: 'running',
            active: true,
            finishedAt: null,
            kbPairsSaved: 0,
            kbDocumentsSaved: 2,
          })}
        />
      );
      expect(screen.getByText(/2 documents saved so far/)).toBeTruthy();
    });

    it('while mining, says what it is reading', () => {
      render(
        <RunDetails
          run={kbRun({ outcome: 'running', active: true, finishedAt: null, kbThreadsDone: 12 })}
        />
      );
      expect(
        screen.getByText(/Reading 30 conversations \(120 messages\) for Q&A pairs/)
      ).toBeTruthy();
      expect(screen.queryByText(/Going through/)).toBeNull();
    });

    it('failed conversations are named as not mined, with the way to read them again', () => {
      render(<RunDetails run={kbRun({ outcome: 'failed', failed: 3, problems: ['failed'] })} />);
      expect(screen.getByText(/Went through 30 of 30 conversations/)).toBeTruthy();
      expect(
        screen.getByText(
          /3 conversations could not be mined\. Re-mine the mailbox to read them again/
        )
      ).toBeTruthy();
      expect(screen.getByText('Not all mined')).toBeTruthy();
      expect(screen.queryByText(/could not be saved/)).toBeNull();
    });

    it('a mine that ended on an error says so, in its own words', () => {
      render(<RunDetails run={kbRun({ outcome: 'error', problems: ['failed'] })} />);
      expect(screen.getByText(/The mine stopped on an error/)).toBeTruthy();
      expect(screen.queryByText(/The check stopped on an error/)).toBeNull();
    });
  });
});
