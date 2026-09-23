/**
 * The queue history panel on Console → System: which queue it opens on, the range it asks for, and
 * what it says when there is nothing to draw. jsdom lays nothing out, so recharts draws no SVG here;
 * the table view carries the same points and is what these tests read.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { QueueHistorySample, QueueRow } from '@/services/platform.service';

const hookCalls: Array<[string | null, number]> = [];
let hookResult: { isLoading: boolean; isError: boolean; error: unknown; data?: QueueHistorySample[] } = {
  isLoading: false,
  isError: false,
  error: null,
  data: [],
};
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformQueueHistory: (queue: string | null, hours: number) => {
    hookCalls.push([queue, hours]);
    return hookResult;
  },
}));

import { QueueHistoryPanel, defaultHistoryQueue, tableRows } from '../QueueHistoryPanel';

const row = (name: string, waiting: number, prioritized = 0): QueueRow => ({
  name,
  waiting,
  prioritized,
  active: 0,
  completed: 0,
  failed: 0,
  total: waiting + prioritized,
});
const queues = [row('process-message', 0, 16), row('process-kb-message', 256), row('notify', 0)];
const sample = (minute: number, over: Partial<QueueHistorySample> = {}): QueueHistorySample => ({
  at: Date.UTC(2026, 8, 23, 15, minute),
  queued: 200 + minute,
  active: 1,
  failed: 0,
  paused: false,
  finishesPerMinute: 21.97,
  medianRunMs: 106,
  oldestWaitingMs: 12 * 60_000,
  lastFinishedAt: null,
  ...over,
});

beforeEach(() => {
  hookCalls.length = 0;
  hookResult = { isLoading: false, isError: false, error: null, data: [] };
});
afterEach(cleanup);

describe('QueueHistoryPanel', () => {
  it('opens on the queue with the most jobs waiting, counting prioritized ones', () => {
    expect(defaultHistoryQueue(queues)).toBe('process-kb-message');
    expect(defaultHistoryQueue([row('a', 0, 5), row('b', 3)])).toBe('a');
    expect(defaultHistoryQueue([])).toBeNull();
    render(<QueueHistoryPanel queues={queues} />);
    expect(screen.getByLabelText<HTMLSelectElement>('Queue to show history for').value).toBe('process-kb-message');
    expect(hookCalls.at(-1)).toEqual(['process-kb-message', 6]);
  });

  it('asks for the chosen queue and range', () => {
    render(<QueueHistoryPanel queues={queues} />);
    fireEvent.change(screen.getByLabelText('Queue to show history for'), { target: { value: 'notify' } });
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
    expect(hookCalls.at(-1)).toEqual(['notify', 24]);
    expect(screen.getByRole('button', { name: '24 h' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says a backend without the route does not record history, instead of showing an error', () => {
    hookResult = { isLoading: false, isError: true, error: Object.assign(new Error('Not found'), { status: 404 }) };
    render(<QueueHistoryPanel queues={queues} />);
    expect(screen.getByText(/needs a newer backend/)).toBeTruthy();
  });

  it('shows a real failure as one, and an empty record as not-yet-recorded', () => {
    hookResult = { isLoading: false, isError: true, error: Object.assign(new Error('boom'), { status: 500 }) };
    render(<QueueHistoryPanel queues={queues} />);
    expect(screen.getByText(/Couldn.t load the history for process-kb-message/)).toBeTruthy();
    cleanup();
    hookResult = { isLoading: false, isError: false, error: null, data: [] };
    render(<QueueHistoryPanel queues={queues} />);
    expect(screen.getByText(/No history for process-kb-message yet/)).toBeTruthy();
  });

  it('lists the same points in a table view, every 15th minute plus the latest', () => {
    const samples = Array.from({ length: 31 }, (_, minute) => sample(minute));
    expect(tableRows(samples).map((entry) => entry.queued)).toEqual([200, 215, 230]);
    const odd = Array.from({ length: 20 }, (_, minute) => sample(minute));
    expect(tableRows(odd).map((entry) => entry.queued)).toEqual([200, 215, 219]);

    hookResult = { isLoading: false, isError: false, error: null, data: samples.slice(0, 2) };
    render(<QueueHistoryPanel queues={queues} />);
    const table = screen.getByRole('table');
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell').slice(1).map((td) => td.textContent));
    expect(cells).toEqual([
      ['200', '21.97', '12 min'],
      ['201', '21.97', '12 min'],
    ]);
    // One small chart per metric — different units never share an axis.
    const captions = Array.from(document.querySelectorAll('figcaption')).map((caption) => caption.textContent);
    expect(captions).toEqual(['Jobs waiting', 'Finished per minute', 'Oldest waiting (min)']);
  });
});
