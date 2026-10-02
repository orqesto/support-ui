import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeKbRun, makeRun } from './fixtures';

/**
 * A plain function per test, not a module-level vi.fn: under vitest 4 a rejection returned by a
 * module-level mock failed the test even though the component caught it.
 */
const dismissCalls: [number, number][] = [];
let dismissImpl: () => Promise<void> = () => Promise.resolve();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    dismissKbFailure: (sourceId: number, conversationId: number) => {
      dismissCalls.push([sourceId, conversationId]);
      return dismissImpl();
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { RecentRuns } = await import('../RecentRuns');
const { KbMiningFailures } = await import('../KbMiningFailures');

afterEach(cleanup);

describe('RecentRuns', () => {
  it('lists every run newest first with how it ended, once opened', () => {
    render(
      <RecentRuns
        runs={[
          makeRun({ id: 'new', found: 4, saved: 4 }),
          makeRun({ id: 'old', found: 9, saved: 7, failed: 2, outcome: 'failed' }),
        ]}
      />
    );
    expect(screen.queryByTestId('recent-runs')).toBeNull();
    fireEvent.click(screen.getByText(/Recent checks and mining \(2\)/));
    const items = screen.getByTestId('recent-runs').querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/4 found · 4 saved.*Done/);
    expect(items[1].textContent).toMatch(/9 found · 7 saved · 2 failed.*Not all saved/);
  });

  it('a run still going reads "going through", never "0 saved"', () => {
    render(
      <RecentRuns runs={[makeRun({ outcome: 'running', active: true, found: 40, saved: 0 })]} />
    );
    fireEvent.click(screen.getByText(/Recent checks/));
    const row = screen.getByTestId('recent-runs').textContent ?? '';
    expect(row).toMatch(/going through 40/);
    expect(row).not.toMatch(/0 saved/);
  });

  it('an interrupted record never reads "0 saved"', () => {
    render(
      <RecentRuns runs={[makeRun({ outcome: 'running', active: false, found: 40, saved: 0 })]} />
    );
    fireEvent.click(screen.getByText(/Recent checks/));
    const row = screen.getByTestId('recent-runs').textContent ?? '';
    expect(row).toMatch(/40 to go through, stopped/);
    expect(row).not.toMatch(/0 saved/);
  });

  it('a knowledge-base mine reads as mining, with conversations and Q&A pairs', () => {
    render(
      <RecentRuns
        runs={[
          makeKbRun({
            found: 120,
            kbThreads: 30,
            kbThreadsDone: 30,
            kbPairsSaved: 7,
            kbDocumentsSaved: 2,
          }),
        ]}
      />
    );
    fireEvent.click(screen.getByText(/Recent checks/));
    const row = screen.getByTestId('recent-runs').textContent ?? '';
    expect(row).toMatch(/KB mining · 30 of 30 conversations · 7 Q&A · 2 documents/);
    expect(row).not.toMatch(/found/);
  });

  it('nothing at all when there are no runs', () => {
    const { container } = render(<RecentRuns runs={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('KbMiningFailures', () => {
  beforeEach(() => {
    dismissCalls.length = 0;
    dismissImpl = () => Promise.resolve();
  });

  const failures = [
    { conversationId: 41, at: '2026-09-30T09:00:00Z', error: 'provider 400' },
    { conversationId: 42, at: '2026-09-30T08:00:00Z', error: 'timeout' },
  ];

  const renderIt = (onDismissed = vi.fn(), truncated = false) =>
    render(
      <MemoryRouter>
        <KbMiningFailures
          sourceId={7}
          failures={failures}
          truncated={truncated}
          onDismissed={onDismissed}
        />
      </MemoryRouter>
    );

  it('links each failed thread to its conversation', () => {
    renderIt();
    expect(screen.getByText('#41').closest('a')?.getAttribute('href')).toBe('/messages/41');
    expect(screen.getByText(/could not read 2 conversations/)).toBeTruthy();
  });

  it('Dismiss calls the backend, removes the row and asks the panel to refresh', async () => {
    const onDismissed = vi.fn();
    renderIt(onDismissed);
    fireEvent.click(screen.getAllByText('Dismiss')[0]);
    await waitFor(() => expect(screen.queryByText('#41')).toBeNull());
    expect(dismissCalls).toEqual([[7, 41]]);
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(screen.getByText('#42')).toBeTruthy();
  });

  it('the same thread failing AGAIN after a dismiss is shown again', async () => {
    const onDismissed = vi.fn();
    const { rerender } = renderIt(onDismissed);
    fireEvent.click(screen.getAllByText('Dismiss')[0]);
    await waitFor(() => expect(screen.queryByText('#41')).toBeNull());
    rerender(
      <MemoryRouter>
        <KbMiningFailures
          sourceId={7}
          failures={[{ conversationId: 41, at: '2026-09-30T12:00:00Z', error: 'again' }]}
          truncated={false}
          onDismissed={onDismissed}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('#41')).toBeTruthy();
  });

  it('a failed dismiss keeps the row and says so', async () => {
    dismissImpl = () => Promise.reject(new Error('500'));
    renderIt();
    fireEvent.click(screen.getAllByText('Dismiss')[0]);
    await waitFor(() => expect(screen.getByText(/Not dismissed, try again/)).toBeTruthy());
    expect(screen.getByText('#41')).toBeTruthy();
  });

  it('a truncated list says the newest are shown', () => {
    renderIt(vi.fn(), true);
    expect(screen.getByText(/the newest are shown; older ones were not kept/)).toBeTruthy();
  });
});
