/**
 * The retry of what a stalled check owes: a dry run, then a confirm (double-click safe); per stage
 * "N will be retried" / "N retried", one general line for whatever is held back, truncated and
 * failed in general words; late answers never printed over a closed section or a newer check.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ServiceModule from '@/services/importProgress.service';
import { decidedOf, failWith, owedOf, retryOf, stageRetry, stalled } from './owedFixtures';

// Plain functions swapped per test: a rejection from a module-level vi.fn fails the run in
// vitest 4 even when the component catches it. The real normalisers run, so an older backend's
// answer is read as the app reads it.
let owedAnswer: () => Promise<unknown>;
let retryAnswer: (dryRun: boolean) => Promise<unknown>;
const calls: string[] = [];

vi.mock('@/services/importProgress.service', async (importOriginal) => {
  const actual = await importOriginal<typeof ServiceModule>();
  return {
    ...actual,
    importProgressService: {
      ...actual.importProgressService,
      owed: async (sourceId: number, runId: string) => {
        calls.push(`owed:${sourceId}:${runId}`);
        return actual.normaliseRunOwed(await owedAnswer());
      },
      retryOwed: async (_sourceId: number, _runId: string, dryRun: boolean) => {
        calls.push(`retry:${dryRun}`);
        return actual.normaliseRetryOwed(await retryAnswer(dryRun));
      },
    },
  };
});

const { RunDetails } = await import('../RunDetails');

let retried = 0;
const draw = (run: ServiceModule.RunView = stalled(), sourceId: number | undefined = 7) => (
  <MemoryRouter>
    <RunDetails run={run} sourceId={sourceId} onRetried={() => (retried += 1)} />
  </MemoryRouter>
);

const openHolding = async () => {
  fireEvent.click(screen.getByRole('button', { name: /What's holding this check/ }));
  await waitFor(() => expect(screen.queryByTestId('owed-loading')).toBeNull());
};

beforeEach(() => {
  calls.length = 0;
  retried = 0;
  owedAnswer = () => Promise.resolve(owedOf());
  retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun));
});
afterEach(cleanup);

const startRetry = async () => {
  render(draw());
  await openHolding();
  fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
  return screen.findByTestId('retry-plan');
};

describe('Retry', () => {
  it('dry run first, writes only on the confirm, then reads the list and the panel again', async () => {
    const plan = await startRetry();
    expect(calls).toEqual(['owed:7:run-1', 'retry:true']);
    expect(within(plan).getByTestId('retry-embedding')).toHaveTextContent(
      /^Search index: 1 conversation will be retried$/
    );
    expect(within(plan).queryByText(/late automatic reply/)).toBeNull();
    owedAnswer = () =>
      Promise.resolve(owedOf({ embedding: { count: 0, hiddenCount: 0, conversations: [] } }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-embedding')).toHaveTextContent(
      /^Search index: 1 conversation retried$/
    );
    await waitFor(() =>
      expect(calls).toEqual(['owed:7:run-1', 'retry:true', 'retry:false', 'owed:7:run-1'])
    );
    expect(retried).toBe(1);
    expect(await screen.findByText('Nothing is holding this check any more.')).toBeInTheDocument();
  });

  it('checking counts what is settled, the same measure in the dry run and the result', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, {
          decided: decidedOf({ owed: 5, found: 5, handled: 1, queued: dryRun ? 0 : 4 }),
          kb: stageRetry({ owed: 2, queued: 2 }),
        })
      );
    const plan = await startRetry();
    expect(within(plan).getByTestId('retry-decided')).toHaveTextContent(
      /^Checked: 4 messages will be handled \(moved, restored or queued to be checked\)$/
    );
    expect(within(plan).getByTestId('retry-kb')).toHaveTextContent(
      /^Knowledge base: 2 conversations will be retried$/
    );
    expect(within(plan).getByText(/a customer may get a late automatic reply/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-decided')).toHaveTextContent(
      /^Checked: 4 messages handled$/
    );
  });

  it('a result that settled more than it queued says how many were queued, never an empty result', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, {
          embedding: stageRetry(),
          decided: decidedOf({ owed: 3, found: 3, queued: dryRun ? 0 : 1, rehomed: 2 }),
        })
      );
    await startRetry();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-decided')).toHaveTextContent(
      /^Checked: 3 messages handled — 1 queued to be checked; the rest were settled without one \(for example, waiting for someone to route their ticket\)$/
    );
  });

  it('says "Nothing was retried." when the result did nothing', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(dryRun ? retryOf(true) : retryOf(false, { embedding: stageRetry() }));
    await startRetry();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-none')).toHaveTextContent('Nothing was retried.');
  });

  it('no late-reply warning when every undecided message was already dealt with by someone', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(retryOf(dryRun, { decided: decidedOf({ owed: 2, found: 2, handled: 2 }) }));
    const plan = await startRetry();
    expect(within(plan).queryByTestId('retry-decided')).toBeNull();
    expect(within(plan).queryByText(/late automatic reply/)).toBeNull();
  });

  it('messages a person already dealt with are work: marked as handled, with a confirm', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, {
          embedding: stageRetry(),
          decided: decidedOf({ owed: 2, found: 2, handled: 2 }),
        })
      );
    const plan = await startRetry();
    expect(within(plan).getByTestId('retry-handled')).toHaveTextContent(
      /^Checked: 2 messages will be marked as handled — a person already dealt with them$/
    );
    expect(within(plan).queryByTestId('retry-nothing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-handled')).toHaveTextContent(
      /^Checked: 2 messages marked as handled$/
    );
    expect(within(done).queryByTestId('retry-none')).toBeNull();
  });

  it('held back for now and held back for good are two sentences, each source field in one', async () => {
    const forNow: Record<string, unknown>[] = [
      { decided: decidedOf({ pending: 1 }) },
      { decided: decidedOf({ unreachable: 1, unreachableReason: 'too_new' }) },
      { decided: decidedOf({ unreachable: 1, unreachableReason: 'just_retried' }) },
      {
        decided: decidedOf({
          unreachable: 2,
          unreachableReason: 'mixed',
          unreachableBy: { tooOld: 0, tooNew: 1, justRetried: 1 },
        }),
      },
      { kb: stageRetry({ recentlyRetried: 1 }) },
      { kb: stageRetry({ pending: 1 }) },
      { kb: stageRetry({ busy: 1 }) },
      { embedding: stageRetry({ queued: 1, dropped: 1 }) },
      { kbPendingUnknown: true },
    ];
    const forGood: Record<string, unknown>[] = [
      { decided: decidedOf({ exhausted: 1 }) },
      { decided: decidedOf({ notRepairable: 1 }) },
      { decided: decidedOf({ unreachable: 1, unreachableReason: 'too_old' }) },
      {
        decided: decidedOf({
          unreachable: 1,
          unreachableReason: 'mixed',
          unreachableBy: { tooOld: 1, tooNew: 0, justRetried: 0 },
        }),
      },
      { kb: stageRetry({ exhausted: 1 }) },
      { embedding: stageRetry({ queued: 1, exhausted: 1 }) },
    ];
    for (const [shapes, present, absent] of [
      [forNow, 'retry-held-now', 'retry-held-good'],
      [forGood, 'retry-held-good', 'retry-held-now'],
    ] as const) {
      for (const shape of shapes) {
        retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun, shape));
        const plan = await startRetry();
        expect(within(plan).getByTestId(present)).toBeInTheDocument();
        expect(within(plan).queryByTestId(absent)).toBeNull();
        cleanup();
      }
    }
    // A mixed reason without its breakdown cannot be told apart: both sentences.
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, { decided: decidedOf({ unreachable: 2, unreachableReason: 'mixed' }) })
      );
    let plan = await startRetry();
    expect(within(plan).getByTestId('retry-held-now')).toHaveTextContent(
      "Some items can't be retried right now — try again later."
    );
    expect(within(plan).getByTestId('retry-held-good')).toHaveTextContent(
      "Some items can't be retried by this button (retried the most times allowed, too old, or not repairable here)."
    );
    cleanup();
    retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun));
    plan = await startRetry();
    expect(within(plan).queryByTestId('retry-held-now')).toBeNull();
    expect(within(plan).queryByTestId('retry-held-good')).toBeNull();
  });

  it('knowledge-base items held by a paused workspace get their own sentence; the flag alone says nothing', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, { workspaceBlocked: true, kb: stageRetry({ owed: 1, blocked: 1 }) })
      );
    let plan = await startRetry();
    expect(within(plan).getByTestId('retry-held-paused')).toHaveTextContent(
      "Some knowledge-base items can't be retried while this workspace is paused — retry them after it's active again."
    );
    expect(within(plan).queryByTestId('retry-held-now')).toBeNull();
    expect(within(plan).queryByTestId('retry-held-good')).toBeNull();
    cleanup();
    // The backend sets workspaceBlocked whatever is owed: with no KB item held, no sentence.
    retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun, { workspaceBlocked: true }));
    plan = await startRetry();
    expect(within(plan).queryByTestId('retry-held-paused')).toBeNull();
    expect(within(plan).queryByTestId('retry-held-now')).toBeNull();
    expect(within(plan).queryByTestId('retry-held-good')).toBeNull();
  });

  it('a for-good hold on a merged-away ticket is stated, never with an instruction to open it', async () => {
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          embedding: { count: 0, hiddenCount: 0, conversations: [] },
          decided: {
            count: 1,
            hiddenCount: 0,
            conversations: [
              {
                conversationId: 40,
                publicId: 'SUP-40',
                deleted: true,
                mergedIntoConversationId: 940,
                mergeOutcome: 'restore',
                mergedIntoLive: false,
              },
            ],
          },
        })
      );
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, { embedding: stageRetry(), decided: decidedOf({ owed: 1, exhausted: 1 }) })
      );
    const plan = await startRetry();
    expect(within(plan).getByTestId('retry-held-good')).toHaveTextContent(
      /^Some items can't be retried by this button \(retried the most times allowed, too old, or not repairable here\)\.$/
    );
    expect(screen.queryByText(/open the tickets/)).toBeNull();
  });

  it('says when nothing can be retried, offers no confirm, and Back returns to Retry', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(retryOf(dryRun, { embedding: stageRetry({ owed: 1, exhausted: 1 }) }));
    const plan = await startRetry();
    expect(within(plan).getByTestId('retry-nothing')).toHaveTextContent(
      'Nothing can be retried right now.'
    );
    expect(within(plan).getByTestId('retry-held-good')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm retry/ })).toBeNull();
    fireEvent.click(within(plan).getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('retry-plan')).toBeNull();
    expect(screen.getByRole('button', { name: /^Retry$/ })).toBeInTheDocument();
  });

  it('says "More remain — run Retry again." only from the truncated flag', async () => {
    retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun, { truncated: true }));
    expect(await startRetry()).toHaveTextContent('More remain — run Retry again.');
    cleanup();
    retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun));
    expect(await startRetry()).not.toHaveTextContent(/More remain/);
  });

  it('a dry run that stopped part-way says so, never "nothing can be retried", and offers no confirm', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(retryOf(dryRun, { failed: { stage: 'kb', error: 'Queue is away' } }));
    const plan = await startRetry();
    expect(within(plan).getByTestId('retry-failed')).toHaveTextContent(
      "Couldn't check what a retry would do: Queue is away. Nothing was changed."
    );
    expect(within(plan).queryByTestId('retry-nothing')).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm retry/ })).toBeNull();
  });

  it('a retry that stopped part-way shows what it did and the error, and still refreshes', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        dryRun ? retryOf(true) : retryOf(false, { failed: { stage: 'kb', error: 'queue full' } })
      );
    await startRetry();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm retry/ }));
    const done = await screen.findByTestId('retry-done');
    expect(within(done).getByTestId('retry-embedding')).toHaveTextContent('1 conversation retried');
    expect(within(done).getByTestId('retry-failed')).toHaveTextContent(
      'Retry stopped: queue full. What finished before the error was kept.'
    );
    await waitFor(() => expect(retried).toBe(1));
  });

  it('a 403 says only workspace admins can retry', async () => {
    retryAnswer = failWith(403, 'Only a workspace admin can retry what a check owes');
    render(draw());
    await openHolding();
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only workspace admins can retry.');
  });

  it('a double click on the confirm retries once', async () => {
    let release: (value: unknown) => void = () => {};
    retryAnswer = (dryRun) =>
      dryRun ? Promise.resolve(retryOf(true)) : new Promise((resolve) => (release = resolve));
    await startRetry();
    const confirm = await screen.findByRole('button', { name: /Confirm retry/ });
    // Both clicks inside one act: the second lands before React re-renders the button disabled,
    // so only the in-flight lock can stop it.
    act(() => {
      confirm.click();
      confirm.click();
    });
    await act(() => Promise.resolve());
    expect(calls.filter((call) => call === 'retry:false')).toHaveLength(1);
    expect(confirm).toBeDisabled();
    release(retryOf(false));
    expect(await screen.findByTestId('retry-done')).toBeInTheDocument();
    expect(calls.filter((call) => call === 'retry:false')).toHaveLength(1);
  });

  it('a dry run answered after the section was closed and reopened is not shown', async () => {
    let releaseDry: (value: unknown) => void = () => {};
    retryAnswer = (dryRun) =>
      dryRun ? new Promise((resolve) => (releaseDry = resolve)) : Promise.resolve(retryOf(false));
    render(draw());
    await openHolding();
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    const toggle = screen.getByRole('button', { name: /What's holding this check/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId('owed-loading')).toBeNull());
    await act(async () => {
      releaseDry(retryOf(true));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('retry-plan')).toBeNull();
  });

  it('a dry run answered after the panel switched to another check is not shown under it', async () => {
    let releaseDry: (value: unknown) => void = () => {};
    retryAnswer = (dryRun) =>
      dryRun ? new Promise((resolve) => (releaseDry = resolve)) : Promise.resolve(retryOf(false));
    const { rerender } = render(draw());
    await openHolding();
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    rerender(draw(stalled({ id: 'run-2' })));
    await act(async () => {
      releaseDry(retryOf(true));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('retry-plan')).toBeNull();
    expect(screen.getByRole('button', { name: /What's holding this check/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('closing and reopening during a confirm keeps the outcome of the write', async () => {
    let release: (value: unknown) => void = () => {};
    retryAnswer = (dryRun) =>
      dryRun ? Promise.resolve(retryOf(true)) : new Promise((resolve) => (release = resolve));
    await startRetry();
    fireEvent.click(await screen.findByRole('button', { name: /Confirm retry/ }));
    const toggle = screen.getByRole('button', { name: /What's holding this check/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await act(async () => {
      release(retryOf(false));
      await Promise.resolve();
    });
    expect(await screen.findByTestId('retry-done')).toHaveTextContent('retried');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(await screen.findByTestId('retry-done')).toHaveTextContent('retried');
  });
});
