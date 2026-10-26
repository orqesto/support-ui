import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ExtraView, WorkspaceRow } from '@/services/budgets.service';
import { chooseOption } from '@/test/chooseOption';
import { BudgetBar } from '../BudgetBar';
import { BulkBar } from '../BulkBar';
import { BulkLimitField } from '../BulkLimitField';
import { ExtraBox } from '../ExtraBox';
import { StatusText } from '../StatusText';
import { WorkspaceRows } from '../WorkspaceRows';
import { BudgetField, ModeField } from '../BudgetGroupView';
import { dollarsText, extraEndsText, fmtMoney, fmtTokenCount, parseDollars } from '../budget.rules';

/** One dollar in micros. */
const USD = 1_000_000;
afterEach(cleanup);

const extraView = (over: Partial<ExtraView> = {}): ExtraView => ({
  id: 1,
  grantIds: [1],
  amountMicros: 25 * USD,
  usedMicros: 5 * USD,
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  ...over,
});

const row = (id: number, over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  organizationId: id,
  name: `Shop ${id}`,
  spend: { total: 40 * USD, bulk: 10 * USD, live: 30 * USD },
  tokens: { total: 285_000_000, bulk: 71_000_000 },
  budget: null,
  bulkLimit: null,
  extra: null,
  bulkRunning: false,
  bulkPaused: false,
  suggestedExtra: 25 * USD,
  status: { tone: 'ok', text: 'All running' },
  liveSpike: null,
  ...over,
});

describe('formatting', () => {
  it('fmtMoney shows micros as "≈ $12.40" with 2 decimals', () => {
    expect(fmtMoney(12_400_000)).toBe('≈ $12.40');
    expect(fmtMoney(0)).toBe('≈ $0.00');
    expect(fmtMoney(28 * USD)).toBe('≈ $28.00');
    expect(fmtMoney(1_234_500_000)).toBe('≈ $1,234.50');
    expect(fmtMoney(10_000)).toBe('≈ $0.01');
    expect(fmtMoney(5_000)).toBe('≈ $0.01');
    expect(fmtMoney(-100)).toBe('≈ $0.00');
  });

  it('kept by design (M7): fmtMoney is en-US whatever the browser locale', () => {
    // A German browser: the default locale would write 1.234,50.
    const spy = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
      locale?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions
    ) {
      return new Intl.NumberFormat(locale ?? 'de-DE', options).format(this);
    });
    try {
      expect(fmtMoney(1_234_500_000)).toBe('≈ $1,234.50');
    } finally {
      spy.mockRestore();
    }
  });

  it('fmtMoney says "<$0.01" for a tiny positive amount, never "$0.00"', () => {
    expect(fmtMoney(1)).toBe('<$0.01');
    expect(fmtMoney(4_999)).toBe('<$0.01');
  });

  it('parseDollars turns typed dollars into micros', () => {
    expect(parseDollars('12.4')).toBe(12_400_000);
    expect(parseDollars(' 5 ')).toBe(5 * USD);
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('0')).toBeNaN();
    expect(parseDollars('abc')).toBeNaN();
    expect(parseDollars('-3')).toBeNaN();
    expect(dollarsText(12_400_000)).toBe('12.4');
    expect(dollarsText(null)).toBe('');
  });

  it('tokens are the secondary figure', () => {
    expect(fmtTokenCount(106 * USD)).toBe('106M');
    expect(fmtTokenCount(28 * USD)).toBe('28.0M');
    expect(fmtTokenCount(850_000)).toBe('850K');
    expect(extraEndsText(new Date(Date.now() + 3 * 86_400_000).toISOString())).toBe('ends in 3 d');
    expect(extraEndsText(new Date(Date.now()).toISOString())).toBe('ends today');
  });
});

describe('BudgetField', () => {
  const detail = { key: 'a:1', budget: 40 * USD, budgetSource: 'override' as const };

  it('is typed in dollars and saves micros', () => {
    const onUpdate = vi.fn();
    render(<BudgetField detail={detail} canEdit plansAvailable={false} onUpdate={onUpdate} />);
    const input = screen.getByRole('spinbutton', { name: 'Budget per billing period, dollars' });
    expect(input).toHaveValue(40);
    fireEvent.change(input, { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    expect(onUpdate).toHaveBeenCalledWith({ budget: 12_500_000 });
  });

  it('an empty field means no budget; zero is refused', () => {
    const onUpdate = vi.fn();
    render(<BudgetField detail={detail} canEdit plansAvailable={false} onUpdate={onUpdate} />);
    const input = screen.getByRole('spinbutton', { name: 'Budget per billing period, dollars' });
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/amount in dollars above 0/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    expect(onUpdate).toHaveBeenCalledWith({ budget: null });
  });

  it('read-only shows the money', () => {
    render(<BudgetField detail={detail} canEdit={false} plansAvailable={false} />);
    expect(screen.getByTestId('budget-readonly')).toHaveTextContent('≈ $40.00 / billing period');
  });
});

describe('ModeField', () => {
  const mode = { current: 'separate' as const, next: null };

  it('changes the mode through a select when allowed', async () => {
    const onSetMode = vi.fn();
    render(<ModeField mode={mode} canEdit onSetMode={onSetMode} />);
    await chooseOption(screen.getByLabelText('How workspaces share AI'), /^Shared/);
    expect(onSetMode).toHaveBeenCalledWith('shared');
  });

  it('a queued change can be cancelled: picking the mode in force sends it', async () => {
    const onSetMode = vi.fn();
    render(
      <ModeField
        mode={{ current: 'separate', next: { mode: 'shared', from: '2026-11-01T00:00:00.000Z' } }}
        canEdit
        onSetMode={onSetMode}
      />
    );
    // The select shows the queued choice, not the mode in force.
    expect(screen.getByText(/^Shared/)).toBeInTheDocument();
    await chooseOption(screen.getByLabelText('How workspaces share AI'), /^Separate/);
    expect(onSetMode).toHaveBeenCalledWith('separate');
  });

  it('is plain text without edit rights and shows a pending change', () => {
    render(
      <ModeField
        mode={{ current: 'separate', next: { mode: 'shared', from: '2026-11-01T00:00:00.000Z' } }}
        canEdit={false}
      />
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByTestId('budget-mode')).toHaveTextContent('Separate');
    expect(screen.getByTestId('budget-mode-next')).toHaveTextContent('Changes to shared');
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
      <BulkLimitField on pct={60} cap={60 * USD} onToggle={() => undefined} />
    );
    const valueClass = () => screen.getByText(/At most 60%|No limit/).className;
    const on = valueClass();
    expect(on).toContain('min-h-');
    rerender(<BulkLimitField on={false} pct={60} cap={60 * USD} onToggle={() => undefined} />);
    expect(valueClass()).toBe(on);
    expect(screen.getByText('No limit')).toBeInTheDocument();
  });

  it('is read-only without edit rights', () => {
    const onToggle = vi.fn();
    render(<BulkLimitField on pct={60} cap={60 * USD} canEdit={false} onToggle={onToggle} />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

describe('ExtraBox', () => {
  it('Suggested above the usual slider top is given exactly, in micros', () => {
    const onGive = vi.fn();
    render(
      <ExtraBox
        extra={null}
        suggestion={350 * USD}
        initialAmount={20 * USD}
        onGive={onGive}
        onEnd={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suggested ≈ $350.00' }));
    fireEvent.click(screen.getByRole('button', { name: /^Give ≈ \$350\.00/ }));
    expect(onGive).toHaveBeenCalledWith(350 * USD, 3);
  });

  it('End now shows only when an extra exists', () => {
    const onEnd = vi.fn();
    const { rerender } = render(
      <ExtraBox extra={null} initialAmount={20 * USD} onGive={vi.fn()} onEnd={onEnd} />
    );
    expect(screen.queryByRole('button', { name: 'End now' })).toBeNull();
    rerender(
      <ExtraBox extra={extraView()} initialAmount={20 * USD} onGive={vi.fn()} onEnd={onEnd} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    expect(onEnd).toHaveBeenCalledOnce();
    expect(screen.getByText(/ends in 3 d/)).toBeInTheDocument();
    expect(screen.getByText('≈ $25.00')).toBeInTheDocument();
    expect(screen.getByText(/≈ \$5\.00 used/)).toBeInTheDocument();
  });

  it('offers Today / 3 days / 7 days and gives micros with the chosen end', () => {
    const onGive = vi.fn();
    render(
      <ExtraBox
        extra={null}
        initialAmount={20 * USD}
        suggestion={35 * USD}
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
    fireEvent.click(screen.getByRole('button', { name: /^Give ≈ \$20\.00 · ends today$/ }));
    expect(onGive).toHaveBeenLastCalledWith(20 * USD, 'today');
    fireEvent.click(screen.getByRole('button', { name: 'Suggested ≈ $35.00' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    fireEvent.click(screen.getByRole('button', { name: /^Give ≈ \$35\.00 · ends in 7 days$/ }));
    expect(onGive).toHaveBeenLastCalledWith(35 * USD, 7);
  });

  it('steps in whole dollars: moving the slider gives that many dollars in micros', () => {
    const onGive = vi.fn();
    render(<ExtraBox extra={null} initialAmount={20 * USD} onGive={onGive} onEnd={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Extra amount, dollars' });
    expect(slider).toHaveAttribute('step', '1');
    fireEvent.change(slider, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^Give ≈ \$7\.00/ }));
    expect(onGive).toHaveBeenCalledWith(7 * USD, 3);
  });
});

describe('BulkBar', () => {
  const props = {
    selected: 2,
    budget: 100 * USD,
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

  it('sets a limit in micros and gives the suggested extra with the chosen end', () => {
    render(<BulkBar {...props} />);
    fireEvent.change(
      screen.getByRole('slider', { name: 'Own bulk limit for each selected workspace, dollars' }),
      { target: { value: '12' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    expect(props.onSetLimit).toHaveBeenCalledWith(12 * USD);
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
    budget: 100 * USD,
    spend: { total: 50 * USD, bulk: 20 * USD, live: 30 * USD, extra: 0 },
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
    row(1, {
      bulkRunning: true,
      bulkPaused: true,
      status: { tone: 'warn', text: 'Bulk import paused' },
    }),
    row(2, { extra: extraView(), bulkRunning: true, status: { tone: 'warn', text: 'Paused' } }),
    row(3),
    // Running, warn tone, but the API says its bulk work is NOT paused (e.g. a live-spike warning).
    row(4, { bulkRunning: true, status: { tone: 'warn', text: 'Live mail spike' } }),
  ];
  const base = {
    rows,
    groupTotal: 120 * USD,
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

  it('one-click extra only on a row the API marks bulkPaused, when the viewer can grant', () => {
    const onGive = vi.fn();
    const { rerender } = render(<WorkspaceRows {...base} onGiveSuggested={onGive} />);
    const buttons = screen.getAllByRole('button', { name: 'Give ≈ $25.00 extra · 3 days' });
    expect(buttons).toHaveLength(1);
    expect(within(screen.getByTestId('budget-row-1')).getByRole('button', { name: /Give/ })).toBe(
      buttons[0]
    );
    fireEvent.click(buttons[0]);
    expect(onGive).toHaveBeenCalledWith(rows[0]);
    rerender(<WorkspaceRows {...base} />);
    expect(screen.queryByRole('button', { name: /^Give / })).toBeNull();
    rerender(
      <WorkspaceRows {...base} rows={[rows[1], rows[2], rows[3]]} onGiveSuggested={onGive} />
    );
    expect(screen.queryByRole('button', { name: /^Give / })).toBeNull();
  });

  it('says so when nothing matches', () => {
    render(<WorkspaceRows {...base} rows={[]} />);
    expect(screen.getByText('No workspace matches.')).toBeInTheDocument();
  });
});
