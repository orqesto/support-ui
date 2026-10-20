import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ExtraView, WorkspaceRow } from '@/services/budgets.service';
import { BudgetBar } from '../BudgetBar';
import { BulkBar } from '../BulkBar';
import { BulkLimitField } from '../BulkLimitField';
import { ExtraBox } from '../ExtraBox';
import { StatusText } from '../StatusText';
import { WorkspaceRows } from '../WorkspaceRows';
import { extraEndsText, fmtTokens } from '../budget.rules';

const MILLION = 1_000_000;
afterEach(cleanup);

const extraView = (over: Partial<ExtraView> = {}): ExtraView => ({
  id: 1,
  grantIds: [1],
  tokens: 25 * MILLION,
  used: 5 * MILLION,
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  ...over,
});

const row = (id: number, over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  organizationId: id,
  name: `Shop ${id}`,
  spend: { total: 40 * MILLION, bulk: 10 * MILLION, live: 30 * MILLION },
  bulkLimit: null,
  extra: null,
  bulkRunning: false,
  suggestedExtra: 25 * MILLION,
  status: { tone: 'ok', text: 'All running' },
  liveSpike: null,
  ...over,
});

describe('formatting', () => {
  it('shows tokens as millions', () => {
    expect(fmtTokens(106 * MILLION)).toBe('106M');
    expect(fmtTokens(28 * MILLION)).toBe('28.0M');
    expect(extraEndsText(new Date(Date.now() + 3 * 86_400_000).toISOString())).toBe('ends in 3 d');
    expect(extraEndsText(new Date(Date.now()).toISOString())).toBe('ends today');
  });
});

describe('StatusText', () => {
  it('renders the API line as given', () => {
    render(<StatusText tone="warn" text="Bulk processing paused" testId="s" />);
    expect(screen.getByTestId('s')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByTestId('s')).toHaveTextContent('Bulk processing paused');
  });
});

describe('BulkLimitField', () => {
  it('the toggle does not move the layout: same min-h on both states', () => {
    const { rerender } = render(
      <BulkLimitField on pct={60} cap={60 * MILLION} onToggle={() => undefined} />
    );
    const valueClass = () => screen.getByText(/At most 60%|No limit/).className;
    const on = valueClass();
    expect(on).toContain('min-h-');
    rerender(<BulkLimitField on={false} pct={60} cap={60 * MILLION} onToggle={() => undefined} />);
    expect(valueClass()).toBe(on);
    expect(screen.getByText('No limit')).toBeInTheDocument();
  });

  it('is read-only without edit rights', () => {
    const onToggle = vi.fn();
    render(<BulkLimitField on pct={60} cap={60 * MILLION} canEdit={false} onToggle={onToggle} />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

describe('ExtraBox', () => {
  it('End now shows only when an extra exists', () => {
    const onEnd = vi.fn();
    const { rerender } = render(
      <ExtraBox extra={null} initialAmount={20 * MILLION} onGive={vi.fn()} onEnd={onEnd} />
    );
    expect(screen.queryByRole('button', { name: 'End now' })).toBeNull();
    rerender(
      <ExtraBox extra={extraView()} initialAmount={20 * MILLION} onGive={vi.fn()} onEnd={onEnd} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    expect(onEnd).toHaveBeenCalledOnce();
    expect(screen.getByText(/ends in 3 d/)).toBeInTheDocument();
  });

  it('offers Today / 3 days / 7 days and gives tokens with the chosen end', () => {
    const onGive = vi.fn();
    render(
      <ExtraBox
        extra={null}
        initialAmount={20 * MILLION}
        suggestion={35 * MILLION}
        onGive={onGive}
        onEnd={vi.fn()}
      />
    );
    const ends = within(screen.getByRole('group', { name: 'Extra ends' }));
    expect(ends.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Today',
      '3 days',
      '7 days',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('button', { name: /^Give \+20\.0M · ends today$/ }));
    expect(onGive).toHaveBeenLastCalledWith(20 * MILLION, 'today');
    fireEvent.click(screen.getByRole('button', { name: 'Suggested 35.0M' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    fireEvent.click(screen.getByRole('button', { name: /^Give \+35\.0M · ends in 7 days$/ }));
    expect(onGive).toHaveBeenLastCalledWith(35 * MILLION, 7);
  });

  it('uses a slider, not a number input', () => {
    render(<ExtraBox extra={null} initialAmount={20 * MILLION} onGive={vi.fn()} onEnd={vi.fn()} />);
    expect(
      screen.getByRole('slider', { name: 'Extra amount, million tokens' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

describe('BulkBar', () => {
  const props = {
    selected: 2,
    budget: 100 * MILLION,
    selectable: 5,
    onSelectAll: vi.fn(),
    onUnselectAll: vi.fn(),
    onSetLimit: vi.fn(),
    onRemoveLimit: vi.fn(),
    onGiveExtra: vi.fn(),
    withExtra: 0,
    onEndExtra: vi.fn(),
  };

  it('End extra shows only when some selected workspace has extra', () => {
    const { rerender } = render(<BulkBar {...props} />);
    expect(screen.queryByRole('button', { name: /^End extra/ })).toBeNull();
    rerender(<BulkBar {...props} withExtra={2} />);
    expect(screen.getByRole('button', { name: 'End extra (2)' })).toBeInTheDocument();
  });

  it('sets a limit in tokens and gives the suggested extra with the chosen end', () => {
    render(<BulkBar {...props} />);
    fireEvent.change(
      screen.getByRole('slider', { name: 'Own bulk limit for each selected workspace' }),
      { target: { value: '12' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    expect(props.onSetLimit).toHaveBeenCalledWith(12 * MILLION);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Give extra' }));
    expect(props.onGiveExtra).toHaveBeenCalledWith('suggested', 7);
  });

  it('hides the actions the viewer may not use', () => {
    render(<BulkBar {...props} canLimit={false} canGrant={false} />);
    expect(screen.queryByRole('button', { name: 'Set limit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Give extra' })).toBeNull();
  });
});

describe('BudgetBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const base = {
    budget: 100 * MILLION,
    spend: { total: 50 * MILLION, bulk: 20 * MILLION, live: 30 * MILLION, extra: 0 },
    bulkLimitOn: true,
    bulkPct: 60,
    bulkPctMin: 50,
    bulkPctMax: 90,
  };
  const slider = () =>
    screen.getByRole('slider', { name: 'Bulk processing may use at most, percent of the budget' });

  it('draws bulk first from 0, then live, and compares the line with the bulk part', () => {
    const { container } = render(<BudgetBar {...base} canEdit onBulkPctChange={vi.fn()} />);
    const segments = Array.from(container.querySelectorAll<HTMLElement>('.absolute.inset-y-0'));
    expect(segments[0]).toHaveClass('bg-pending');
    expect(segments[0].style.left).toBe('0%');
    expect(segments[0].style.width).toBe('20%');
    expect(segments[1]).toHaveClass('bg-primary');
    expect(segments[1].style.left).toBe('20%');
    expect(segments[1].style.width).toBe('30%');
    expect(screen.getByText('Bulk limit (compared with the purple part only)')).toBeInTheDocument();
  });

  it('a drag calls onBulkPctChange once, 400 ms later, clamped to the settings range', () => {
    const onChange = vi.fn();
    render(<BudgetBar {...base} canEdit onBulkPctChange={onChange} />);
    fireEvent.change(slider(), { target: { value: '10' } });
    fireEvent.change(slider(), { target: { value: '20' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(399));
    expect(onChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(50);
    fireEvent.change(slider(), { target: { value: '100' } });
    act(() => void vi.advanceTimersByTime(400));
    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it('is read-only without canEdit.bulk', () => {
    const onChange = vi.fn();
    render(<BudgetBar {...base} canEdit={false} onBulkPctChange={onChange} />);
    expect(slider()).toBeDisabled();
    fireEvent.change(slider(), { target: { value: '80' } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows no line and a disabled slider while the limit is off', () => {
    render(<BudgetBar {...base} bulkLimitOn={false} canEdit onBulkPctChange={vi.fn()} />);
    expect(slider()).toBeDisabled();
    expect(screen.queryByText(/compared with the purple part only/)).toBeNull();
  });
});

describe('WorkspaceRows', () => {
  const rows = [
    row(1, { bulkRunning: true, status: { tone: 'warn', text: 'Bulk import paused' } }),
    row(2, { extra: extraView(), bulkRunning: true, status: { tone: 'warn', text: 'Paused' } }),
    row(3),
  ];
  const base = {
    rows,
    groupTotal: 120 * MILLION,
    groupExtraLeft: 0,
    openId: null,
    onToggleOpen: vi.fn(),
  };

  it('the select box is outside the row click area', () => {
    const onToggleOpen = vi.fn();
    const onTogglePick = vi.fn();
    render(
      <WorkspaceRows
        {...base}
        onToggleOpen={onToggleOpen}
        picked={new Set()}
        onTogglePick={onTogglePick}
      />
    );
    const box = screen.getByRole('checkbox', { name: 'Select Shop 1' });
    const rowButton = within(screen.getByTestId('budget-row-1')).getByRole('button', {
      name: /Shop 1/,
    });
    expect(rowButton.contains(box)).toBe(false);
    fireEvent.click(box);
    expect(onTogglePick).toHaveBeenCalledWith(1, true);
    expect(onToggleOpen).not.toHaveBeenCalled();
    fireEvent.click(rowButton);
    expect(onToggleOpen).toHaveBeenCalledWith(1);
  });

  it('renders the status line from the API and opens its panel under the row', () => {
    render(
      <WorkspaceRows {...base} openId={3} renderPanel={(item) => <div>panel of {item.name}</div>} />
    );
    expect(screen.getByTestId('budget-row-status-1')).toHaveTextContent('Bulk import paused');
    const open = screen.getByRole('button', { name: /Shop 3/ });
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('panel of Shop 3')).toBeInTheDocument();
  });

  it('one-click extra only on a paused bulk run with no extra left, when the viewer can grant', () => {
    const onGive = vi.fn();
    const { rerender } = render(<WorkspaceRows {...base} onGiveSuggested={onGive} />);
    const buttons = screen.getAllByRole('button', { name: 'Give +25.0M extra · 3 days' });
    expect(buttons).toHaveLength(1);
    expect(within(screen.getByTestId('budget-row-1')).getByRole('button', { name: /Give/ })).toBe(
      buttons[0]
    );
    fireEvent.click(buttons[0]);
    expect(onGive).toHaveBeenCalledWith(rows[0]);
    rerender(<WorkspaceRows {...base} />);
    expect(screen.queryByRole('button', { name: /Give \+/ })).toBeNull();
    rerender(<WorkspaceRows {...base} groupExtraLeft={5 * MILLION} onGiveSuggested={onGive} />);
    expect(screen.queryByRole('button', { name: /Give \+/ })).toBeNull();
  });

  it('says so when nothing matches', () => {
    render(<WorkspaceRows {...base} rows={[]} />);
    expect(screen.getByText('No workspace matches.')).toBeInTheDocument();
  });
});
