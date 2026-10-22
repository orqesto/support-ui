/**
 * One date-range control for every screen that picks a period (owner, 2026-10-22): the screen's
 * quick choices stay, and "Custom…" opens a calendar — a from–to range, or one "since" day for a
 * mailbox import. Days are local `YYYY-MM-DD`; the API gets the first and last instant of them.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DateRangePicker, formatRangeLabel, rangeQuery, type DateRangeValue } from '../DateRangePicker';

const presets = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 22, 10, 0, 0)); // 22 Oct 2026, local
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const open = (name: RegExp | string = /last 30 days/i) => fireEvent.click(screen.getByRole('button', { name }));
const day = (label: string) => screen.getByRole('button', { name: label });

describe('formatRangeLabel', () => {
  it('a preset reads as its label', () => {
    expect(formatRangeLabel({ kind: 'preset', value: '30' }, presets)).toBe('Last 30 days');
  });
  it('a range reads as its two days, a since day as "Since"', () => {
    expect(formatRangeLabel({ kind: 'range', from: '2026-10-03', to: '2026-10-09' }, presets)).toBe('3 Oct – 9 Oct 2026');
    expect(formatRangeLabel({ kind: 'since', since: '2026-10-03' }, presets)).toBe('Since 3 Oct 2026');
  });
});

describe('rangeQuery', () => {
  it('sends the first instant of the from-day and the last instant of the to-day, local', () => {
    const query = rangeQuery('2026-10-03', '2026-10-09');
    expect(query.from).toBe(new Date(2026, 9, 3, 0, 0, 0, 0).toISOString());
    expect(query.to).toBe(new Date(2026, 9, 9, 23, 59, 59, 999).toISOString());
  });
});

describe('DateRangePicker', () => {
  const setup = (props: Partial<React.ComponentProps<typeof DateRangePicker>> = {}) => {
    const onChange = vi.fn<(value: DateRangeValue) => void>();
    render(
      <DateRangePicker
        ariaLabel="Period"
        presets={presets}
        value={{ kind: 'preset', value: '30' }}
        onChange={onChange}
        {...props}
      />
    );
    return onChange;
  };

  it('a preset is one click', () => {
    const onChange = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', value: '7' });
  });

  it('Custom… then two days gives that range — in order even when picked backwards', () => {
    const onChange = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    fireEvent.click(day('9 October 2026'));
    expect(onChange).not.toHaveBeenCalled(); // half a range is not applied
    fireEvent.click(day('3 October 2026'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'range', from: '2026-10-03', to: '2026-10-09' });
  });

  it('days after today cannot be picked', () => {
    setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    expect(day('23 October 2026')).toBeDisabled();
    expect(day('22 October 2026')).not.toBeDisabled();
  });

  it('a range longer than maxSpanDays is refused with a message', () => {
    const onChange = setup({ maxSpanDays: 5 });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    fireEvent.click(day('1 October 2026'));
    fireEvent.click(day('9 October 2026'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at most 5 days/i);
  });

  it('the calendar moves between months', () => {
    setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(day('15 September 2026')).toBeInTheDocument();
  });

  it('single mode: one click picks the since day', () => {
    const onChange = setup({ mode: 'single' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    fireEvent.click(day('3 October 2026'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'since', since: '2026-10-03' });
  });

  it('a custom value shows on the trigger and opens on its month', () => {
    setup({ value: { kind: 'range', from: '2026-08-03', to: '2026-08-09' } });
    open('3 Aug – 9 Aug 2026');
    expect(day('5 August 2026')).toBeInTheDocument();
  });

  it('Escape closes it', () => {
    setup();
    open();
    expect(screen.getByRole('dialog', { name: 'Period' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Period' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Period' })).not.toBeInTheDocument();
  });
});
