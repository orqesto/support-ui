import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DurationInput } from '../DurationInput';
import { chooseOption } from '@/test/chooseOption';

const Harness = ({
  initial,
  onChange,
  allowEmpty,
}: {
  initial: number | null;
  onChange: (minutes: number | null) => void;
  allowEmpty?: boolean;
}) => {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <DurationInput
      aria-label="Resolution"
      value={value}
      allowEmpty={allowEmpty}
      onChange={(minutes) => {
        setValue(minutes);
        onChange(minutes);
      }}
    />
  );
};

const amount = () => screen.getByRole('spinbutton', { name: 'Resolution' });
const unit = () => screen.getByRole('combobox', { name: 'Resolution unit' });

describe('DurationInput', () => {
  it('shows 240 minutes as 4 hours', () => {
    render(<Harness initial={240} onChange={vi.fn()} />);
    expect(amount()).toHaveValue(4);
    expect(screen.getByText('hours')).toBeInTheDocument();
  });

  it('typing an amount emits minutes in the shown unit', () => {
    const onChange = vi.fn();
    render(<Harness initial={240} onChange={onChange} />);
    fireEvent.change(amount(), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith(360);
  });

  it('changing the unit keeps the amount and emits minutes', async () => {
    const onChange = vi.fn();
    render(<Harness initial={240} onChange={onChange} />);
    await chooseOption(unit(), 'days');
    expect(onChange).toHaveBeenLastCalledWith(4 * 1440);
    expect(amount()).toHaveValue(4);
  });

  it('empty with allowEmpty emits null; without it emits nothing', () => {
    const onChange = vi.fn();
    const { unmount } = render(<Harness initial={60} onChange={onChange} allowEmpty />);
    fireEvent.change(amount(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    unmount();
    const strict = vi.fn();
    render(<Harness initial={60} onChange={strict} />);
    fireEvent.change(amount(), { target: { value: '' } });
    expect(strict).not.toHaveBeenCalled();
  });

  it('rejects 0, a negative and a fraction (no onChange)', () => {
    const onChange = vi.fn();
    render(<Harness initial={60} onChange={onChange} />);
    for (const bad of ['0', '-2', '1.5']) fireEvent.change(amount(), { target: { value: bad } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a null value with allowEmpty shows an empty amount', () => {
    render(<Harness initial={null} onChange={vi.fn()} allowEmpty />);
    expect(amount()).toHaveValue(null);
  });

  it('reports validity: an invalid amount marks the field and calls onValidChange(false)', () => {
    const onValidChange = vi.fn();
    render(
      <DurationInput
        aria-label="Resolution"
        value={60}
        onChange={vi.fn()}
        onValidChange={onValidChange}
      />
    );
    fireEvent.change(amount(), { target: { value: '0' } });
    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(amount()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(amount(), { target: { value: '3' } });
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });

  it('offers only the units it is given', async () => {
    render(
      <DurationInput
        aria-label="Resolution"
        value={240}
        onChange={vi.fn()}
        units={['hour', 'day']}
      />
    );
    const { listOptions } = await import('@/test/chooseOption');
    expect(await listOptions(unit())).toEqual(['hours', 'days']);
  });
});
