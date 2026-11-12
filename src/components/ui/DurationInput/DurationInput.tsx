import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { splitMinutes, toMinutes, type DurationUnit } from './durationUnits';
import type { DurationInputProps } from './durationInput.types';

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: 'minute', label: 'minutes' },
  { value: 'hour', label: 'hours' },
  { value: 'day', label: 'days' },
];

/** A whole number above zero, or null for anything else (empty, 0, negative, a fraction). */
const parseAmount = (text: string): number | null => {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

/**
 * A duration as a number + minutes / hours / days; `value` and `onChange` are in MINUTES. Shows a
 * stored value in the largest unit that divides it evenly (240 → 4 hours). An invalid amount (0, a
 * fraction, empty without `allowEmpty`) is shown as typed and emits nothing.
 */
export const DurationInput = ({
  value,
  onChange,
  allowEmpty = false,
  max,
  disabled,
  id,
  size = 'sm',
  'aria-label': ariaLabel,
}: DurationInputProps) => {
  const initial = value === null ? null : splitMinutes(value);
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '');
  const [unit, setUnit] = useState<DurationUnit>(initial?.unit ?? 'hour');
  // The value this control last emitted: a parent echoing it back must not re-split what was typed
  // (90 typed as minutes stays "90 minutes", not "1.5 hours").
  const lastEmitted = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const next = value === null ? null : splitMinutes(value);
    setAmountText(next ? String(next.amount) : '');
    if (next) setUnit(next.unit);
  }, [value]);

  const emit = (text: string, nextUnit: DurationUnit) => {
    if (text.trim() === '') {
      if (allowEmpty) {
        lastEmitted.current = null;
        onChange(null);
      }
      return;
    }
    const amount = parseAmount(text);
    if (amount === null) return;
    const minutes = toMinutes(amount, nextUnit);
    if (max !== undefined && minutes > max) return;
    lastEmitted.current = minutes;
    onChange(minutes);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        size={size}
        className="w-20"
        aria-label={ariaLabel}
        value={amountText}
        disabled={disabled}
        onChange={(event) => {
          setAmountText(event.target.value);
          emit(event.target.value, unit);
        }}
      />
      <Select
        aria-label={`${ariaLabel} unit`}
        size={size}
        className="w-28"
        options={UNIT_OPTIONS}
        value={unit}
        disabled={disabled}
        searchable={false}
        onChange={(next) => {
          const nextUnit = next as DurationUnit;
          setUnit(nextUnit);
          emit(amountText, nextUnit);
        }}
      />
    </div>
  );
};
