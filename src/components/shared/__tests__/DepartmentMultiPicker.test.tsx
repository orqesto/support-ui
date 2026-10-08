/**
 * The department checklist on a source (Email, Gmail, Slack, Telegram, WhatsApp, the
 * department editor): which departments are ticked, and which one is the default. The default
 * follows the ticks — the first ticked becomes it, and removing it hands it to the first left.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DepartmentMultiPicker } from '@/components/shared/DepartmentMultiPicker';
import { chooseOption } from '@/test/chooseOption';
import type { Department } from '@/services/department.service';

const DEPTS = [
  { id: 1, name: 'Sales' },
  { id: 2, name: 'Billing' },
  { id: 3, name: 'Support' },
] as unknown as Department[];

const renderPicker = (selected: number[], defaultId: number | undefined) => {
  const onSelectedChange = vi.fn<(next: number[]) => void>();
  const onDefaultChange = vi.fn<(id: number | undefined) => void>();
  render(
    <DepartmentMultiPicker
      allDepts={DEPTS}
      selected={selected}
      defaultId={defaultId}
      onSelectedChange={onSelectedChange}
      onDefaultChange={onDefaultChange}
    />
  );
  return { onSelectedChange, onDefaultChange };
};

const removeChip = (name: string) => {
  const remove = screen.getByRole('button', { name: `Remove ${name}` });
  fireEvent.mouseDown(remove);
  fireEvent.click(remove);
};

afterEach(cleanup);

describe('DepartmentMultiPicker', () => {
  it('the first department ticked becomes the default', async () => {
    const { onSelectedChange, onDefaultChange } = renderPicker([], undefined);
    await chooseOption(screen.getByRole('combobox', { name: 'Departments' }), 'Billing');
    expect(onSelectedChange).toHaveBeenCalledWith([2]);
    expect(onDefaultChange).toHaveBeenCalledWith(2);
  });

  it('ticking another keeps the order it had and appends, and leaves the default alone', async () => {
    // Selected out of list order on purpose: the next default is "first remaining" of THIS order.
    const { onSelectedChange, onDefaultChange } = renderPicker([3, 1], 3);
    await chooseOption(screen.getByRole('combobox', { name: 'Departments' }), 'Billing');
    expect(onSelectedChange).toHaveBeenCalledWith([3, 1, 2]);
    expect(onDefaultChange).not.toHaveBeenCalled();
  });

  it('removing the default hands it to the first department left', () => {
    const { onSelectedChange, onDefaultChange } = renderPicker([3, 1, 2], 3);
    removeChip('Support (default)');
    expect(onSelectedChange).toHaveBeenCalledWith([1, 2]);
    expect(onDefaultChange).toHaveBeenCalledWith(1);
  });

  it('removing a department that is not the default leaves the default alone (control)', () => {
    const { onSelectedChange, onDefaultChange } = renderPicker([3, 1, 2], 3);
    removeChip('Billing');
    expect(onSelectedChange).toHaveBeenCalledWith([3, 1]);
    expect(onDefaultChange).not.toHaveBeenCalled();
  });

  it('marks the default on its chip, and offers the default only with two or more ticked', async () => {
    renderPicker([1], 1);
    expect(screen.getByText('Sales (default)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Default department')).toBeNull();
    cleanup();

    const { onDefaultChange } = renderPicker([1, 3], 1);
    await chooseOption(screen.getByLabelText('Default department'), 'Support');
    expect(onDefaultChange).toHaveBeenCalledWith(3);
  });

  it('shows the loading line instead of the picker while departments load', () => {
    render(
      <DepartmentMultiPicker
        allDepts={[]}
        selected={[]}
        defaultId={undefined}
        loading
        onSelectedChange={vi.fn()}
        onDefaultChange={vi.fn()}
      />
    );
    expect(screen.getByText(/Loading departments/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
