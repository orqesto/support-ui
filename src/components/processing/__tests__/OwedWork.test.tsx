/**
 * "What's holding this check" under a stalled check: read only when opened (never on a poll), one
 * general line per stage with ticket links, merged-away tickets named plainly, and the empty,
 * loading and error states. Every sentence is general, so it stays true in every backend state.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ServiceModule from '@/services/importProgress.service';
import { makeRun } from './fixtures';
import { conv, empty, failWith, owedOf, owedOfOld, retryOf, stalled } from './owedFixtures';

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

describe('What is holding this check', () => {
  it('is read when opened, once — never on the panel poll', async () => {
    const { rerender } = render(draw());
    expect(calls).toEqual([]);
    await openHolding();
    expect(calls).toEqual(['owed:7:run-1']);
    rerender(draw(stalled({ found: 4 })));
    rerender(draw(stalled({ found: 5 })));
    await act(() => Promise.resolve());
    expect(calls).toEqual(['owed:7:run-1']);
  });

  it('shows a loading line while it reads', () => {
    owedAnswer = () => new Promise(() => {});
    render(draw());
    fireEvent.click(screen.getByRole('button', { name: /What's holding this check/ }));
    expect(screen.getByTestId('owed-loading')).toHaveTextContent(
      'Reading what this check still owes'
    );
  });

  it('is offered only under a stalled check, and only with the mailbox', () => {
    render(draw(makeRun()));
    expect(screen.queryByTestId('owed-work')).toBeNull();
    cleanup();
    render(draw(stalled({ outcome: 'running', active: true, problems: [] })));
    expect(screen.queryByTestId('owed-work')).toBeNull();
    cleanup();
    render(
      <MemoryRouter>
        <RunDetails run={stalled()} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('owed-work')).toBeNull();
    cleanup();
    render(draw(stalled({ problems: [] })));
    expect(screen.queryByTestId('owed-work')).toBeNull();
    cleanup();
    render(draw(stalled()));
    expect(screen.getByTestId('owed-work')).toBeInTheDocument();
  });

  it('one line per stage in the panel words and units, each ticket a link', async () => {
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          decided: { count: 3, hiddenCount: 0, conversations: [conv(1)] },
          analysis: { count: 2, hiddenCount: 0, conversations: [conv(2)] },
          embedding: { count: 1, hiddenCount: 0, conversations: [conv(4401)] },
          kb: { count: 1, hiddenCount: 0, conversations: [conv(55, null)] },
        })
      );
    render(draw());
    await openHolding();
    expect(screen.getByTestId('owed-decided')).toHaveTextContent(/^Checked: 3 messages — SUP-1$/);
    expect(screen.getByTestId('owed-analysis')).toHaveTextContent(
      /^AI analysis: 2 messages — SUP-2$/
    );
    expect(screen.getByTestId('owed-embedding')).toHaveTextContent(
      /^Search index: 1 conversation — SUP-4401$/
    );
    expect(screen.getByTestId('owed-kb')).toHaveTextContent(
      /^Knowledge base: 1 conversation — #55$/
    );
    expect(
      within(screen.getByTestId('owed-embedding')).getByRole('link', { name: 'SUP-4401' })
    ).toHaveAttribute('href', '/messages?id=SUP-4401');
    expect(
      within(screen.getByTestId('owed-kb')).getByRole('link', { name: '#55' })
    ).toHaveAttribute('href', '/messages?id=55');
  });

  it('says "and more" by the stage ticket count, never at exactly the listed number', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => conv(100 + index));
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          decided: { count: 90, hiddenCount: 0, conversationCount: 25, conversations: twenty },
          analysis: { count: 60, hiddenCount: 0, conversationCount: 20, conversations: twenty },
          embedding: { count: 6, hiddenCount: 2, conversationCount: 6, conversations: [conv(5)] },
          kb: { count: 3, hiddenCount: 2, conversationCount: 3, conversations: [conv(6)] },
        })
      );
    render(draw());
    await openHolding();
    expect(screen.getByTestId('owed-decided')).toHaveTextContent(/SUP-119 and more$/);
    // Exactly 20 tickets, all listed: no "and more".
    expect(screen.getByTestId('owed-analysis')).toHaveTextContent(/SUP-119$/);
    expect(screen.getByTestId('owed-embedding')).toHaveTextContent(
      /^Search index: 6 conversations — SUP-5 and more · some in departments you can't see$/
    );
    expect(screen.getByTestId('owed-kb')).toHaveTextContent(
      /^Knowledge base: 3 conversations — SUP-6 · some in departments you can't see$/
    );
  });

  it('the #924 shape (no ticket count): a message stage never says "and more"; a conversation stage does by its count', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => conv(100 + index));
    owedAnswer = () =>
      Promise.resolve(
        owedOfOld({
          decided: { count: 90, conversations: twenty },
          embedding: { count: 25, conversations: twenty },
        })
      );
    render(draw());
    await openHolding();
    expect(screen.getByTestId('owed-decided')).toHaveTextContent(/SUP-119$/);
    expect(screen.getByTestId('owed-embedding')).toHaveTextContent(/SUP-119 and more$/);
  });

  it('the #924 shape (no hiddenCount, no canRetry) still lists, and offers no Retry', async () => {
    owedAnswer = () => Promise.resolve(owedOfOld());
    render(draw());
    await openHolding();
    expect(screen.getByTestId('owed-embedding')).toHaveTextContent(
      /^Search index: 1 conversation — SUP-4401$/
    );
    expect(screen.queryByRole('button', { name: /^Retry$/ })).toBeNull();
  });

  it('a merged-away ticket is named plainly; only a live move target is linked', async () => {
    const tomb = (id: number, extra: Record<string, unknown>) => ({
      ...conv(id),
      deleted: true,
      mergedIntoConversationId: 900 + id,
      ...extra,
    });
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          decided: {
            count: 5,
            hiddenCount: 0,
            conversations: [
              tomb(40, {
                mergeOutcome: 'move',
                mergedIntoLive: true,
                mergeTargetId: 90,
                mergeTargetPublicId: 'SUP-90',
              }),
              tomb(41, {
                mergeOutcome: 'move',
                mergedIntoLive: false,
                mergeTargetId: 91,
                mergeTargetPublicId: 'SUP-91',
              }),
              tomb(42, {
                mergeOutcome: 'revive',
                mergedIntoLive: false,
                mergeTargetId: 92,
                mergeTargetPublicId: 'SUP-92',
              }),
              tomb(43, { mergeOutcome: 'restore', mergedIntoLive: false }),
              { ...conv(44), deleted: true, mergedIntoConversationId: null },
            ],
          },
        })
      );
    render(draw());
    await openHolding();
    const line = screen.getByTestId('owed-decided');
    expect(line).toHaveTextContent(
      /^Checked: 5 messages — a merged-away ticket \(merged into SUP-90\), a merged-away ticket, a merged-away ticket, a merged-away ticket, a deleted ticket$/
    );
    expect(within(line).getAllByRole('link')).toHaveLength(1);
    expect(within(line).getByRole('link', { name: 'SUP-90' })).toHaveAttribute(
      'href',
      '/messages?id=SUP-90'
    );
    expect(line).not.toHaveTextContent(/Retry/);
  });

  it('links only a move: any other outcome is never linked, even with a live target named', async () => {
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          decided: {
            count: 1,
            hiddenCount: 0,
            conversations: [
              {
                ...conv(40),
                deleted: true,
                mergedIntoConversationId: 940,
                mergeOutcome: 'revive',
                mergedIntoLive: true,
                mergeTargetId: 92,
                mergeTargetPublicId: 'SUP-92',
              },
            ],
          },
        })
      );
    render(draw());
    await openHolding();
    expect(within(screen.getByTestId('owed-decided')).queryByRole('link')).toBeNull();
  });

  it("a tombstone the backend will leave ('leave') is named plainly: no link, no promise", async () => {
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          decided: {
            count: 1,
            hiddenCount: 0,
            conversations: [
              {
                ...conv(40),
                deleted: true,
                mergedIntoConversationId: 940,
                mergeOutcome: 'leave',
                mergedIntoLive: true,
                mergeTargetId: 93,
                mergeTargetPublicId: 'SUP-93',
              },
            ],
          },
        })
      );
    render(draw());
    await openHolding();
    const line = screen.getByTestId('owed-decided');
    expect(line).toHaveTextContent(/^Checked: 1 message — a merged-away ticket$/);
    expect(within(line).queryByRole('link')).toBeNull();
  });

  it('says nothing is holding it any more when every count is 0, and offers no retry', async () => {
    owedAnswer = () => Promise.resolve(owedOf({ embedding: empty() }));
    render(draw());
    await openHolding();
    expect(screen.getByText('Nothing is holding this check any more.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry$/ })).toBeNull();
  });

  it('offers no Retry when only AI analysis is owed, and says it is not retried here', async () => {
    owedAnswer = () =>
      Promise.resolve(
        owedOf({
          embedding: empty(),
          analysis: { count: 4, hiddenCount: 0, conversations: [conv(2)] },
        })
      );
    render(draw());
    await openHolding();
    expect(screen.queryByRole('button', { name: /^Retry$/ })).toBeNull();
    expect(screen.getByTestId('owed-analysis-only')).toHaveTextContent(
      "AI analysis isn't retried here."
    );
  });

  it('shows the server error, and a 403 in plain words', async () => {
    owedAnswer = failWith(500, 'Database is resting');
    render(draw());
    await openHolding();
    expect(screen.getByRole('alert')).toHaveTextContent('Database is resting');
    cleanup();
    owedAnswer = failWith(403, 'Forbidden');
    render(draw());
    await openHolding();
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to this list.');
  });

  it('offers Retry only when canRetry is true', async () => {
    owedAnswer = () => Promise.resolve(owedOf({}, { canRetry: false }));
    render(draw());
    await openHolding();
    expect(screen.getByTestId('owed-embedding')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry$/ })).toBeNull();
    cleanup();
    owedAnswer = () => Promise.resolve(owedOf());
    render(draw());
    await openHolding();
    expect(screen.getByRole('button', { name: /^Retry$/ })).toBeInTheDocument();
  });

  it('a list read closed and reopened while in flight never prints the stale answer', async () => {
    const answers: ((value: unknown) => void)[] = [];
    owedAnswer = () => new Promise((resolve) => answers.push(resolve));
    render(draw());
    const toggle = screen.getByRole('button', { name: /What's holding this check/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(answers).toHaveLength(2);
    await act(async () => {
      answers[1](owedOf({ embedding: { count: 1, hiddenCount: 0, conversations: [conv(222)] } }));
      await Promise.resolve();
    });
    await act(async () => {
      answers[0](owedOf({ embedding: { count: 1, hiddenCount: 0, conversations: [conv(111)] } }));
      await Promise.resolve();
    });
    expect(await screen.findByRole('link', { name: 'SUP-222' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'SUP-111' })).toBeNull();
  });
});
