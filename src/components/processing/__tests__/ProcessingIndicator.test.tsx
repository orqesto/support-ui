import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingSummaryEntry } from '@/services/importProgress.service';
import { ProcessingIndicator } from '../ProcessingIndicator';

afterEach(cleanup);

const entry = (over: Partial<ProcessingSummaryEntry>): ProcessingSummaryEntry => ({
  sourceId: 1,
  name: 'Orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  countCapped: false,
  ...over,
});

describe('ProcessingIndicator', () => {
  it('says nothing when nothing is in progress and nothing is wrong', () => {
    const { container } = render(<ProcessingIndicator entries={[entry({})]} onOpen={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('a small run in progress is a quiet count', () => {
    render(<ProcessingIndicator entries={[entry({ inProgress: 1 })]} onOpen={vi.fn()} />);
    const button = screen.getByTestId('processing-indicator');
    expect(button.textContent).toBe('1');
    expect(button.getAttribute('aria-label')).toBe('1 mail check or mine still processing');
  });

  it('problems take the count and say so', () => {
    render(
      <ProcessingIndicator
        entries={[entry({ inProgress: 2, problems: 3 }), entry({ sourceId: 2, problems: 1 })]}
        onOpen={vi.fn()}
      />
    );
    const button = screen.getByTestId('processing-indicator');
    expect(button.textContent).toBe('4');
    expect(button.getAttribute('aria-label')).toBe(
      '2 mail checks or mines still processing; 4 problems to look at'
    );
  });

  it('a capped count is shown as a floor', () => {
    render(
      <ProcessingIndicator
        entries={[entry({ inProgress: 5, countCapped: true })]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByTestId('processing-indicator').textContent).toBe('5+');
  });

  it('the floor sits on the number, not on the noun (staging 2026-09-30: "1 mail check or mine+")', () => {
    render(
      <ProcessingIndicator
        entries={[entry({ inProgress: 1, problems: 1, countCapped: true })]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByTestId('processing-indicator').getAttribute('aria-label')).toBe(
      '1+ mail checks or mines still processing; 1+ problems to look at'
    );
  });

  it('an unreadable mailbox is named, not counted as a problem', () => {
    render(
      <ProcessingIndicator
        entries={[entry({ inProgress: 1 }), entry({ sourceId: 2, unavailable: true })]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByTestId('processing-indicator').getAttribute('aria-label')).toMatch(
      /1 mailbox's recent checks could not be read/
    );
  });

  it('a mailbox that could not be read shows on its own too, and opens on click', () => {
    const onOpen = vi.fn();
    render(
      <ProcessingIndicator entries={[entry({ sourceId: 4, unavailable: true })]} onOpen={onOpen} />
    );
    const button = screen.getByTestId('processing-indicator');
    expect(button.getAttribute('aria-label')).toBe("1 mailbox's recent checks could not be read");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith([4]);
  });

  it('clicking opens every mailbox it counts, and only those', () => {
    const onOpen = vi.fn();
    render(
      <ProcessingIndicator
        entries={[
          entry({ sourceId: 1, inProgress: 1 }),
          entry({ sourceId: 2 }),
          entry({ sourceId: 3, problems: 1 }),
        ]}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByTestId('processing-indicator'));
    expect(onOpen).toHaveBeenCalledWith([1, 3]);
  });
});
