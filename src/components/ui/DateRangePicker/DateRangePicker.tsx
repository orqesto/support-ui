import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';
import { MonthCalendar } from './MonthCalendar';
import {
  dateToDay,
  dayToDate,
  formatRangeLabel,
  spanDays,
  type DateRangePreset,
  type DateRangeValue,
} from './dateRangeValue';

type DateRangePickerProps = {
  /** Names the trigger's panel. */
  ariaLabel: string;
  /** `range`: a from–to period. `single`: one "since" day (a mailbox import, a hold date). */
  mode?: 'range' | 'single';
  /** The screen's quick choices, kept as they were (owner, 2026-10-22). Empty: calendar only. */
  presets: readonly DateRangePreset[];
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** The latest day that can be picked, `YYYY-MM-DD`; default today. */
  maxDay?: string;
  /** The earliest day that can be picked, `YYYY-MM-DD` (e.g. how far back an import reaches). */
  minDay?: string;
  /** The longest range accepted, in days (a report's server limit is 365). */
  maxSpanDays?: number;
  /** Shown on the trigger when nothing is chosen (a preset value no preset matches, e.g. ''). */
  placeholder?: string;
  /** Offered as "Clear dates" when a custom value is set (a filter that can be empty). */
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
};

const PANEL_WIDTH = 296;

/**
 * The one period control: the screen's quick choices, then "Custom…", which opens a month
 * calendar. In `range` mode the first day clicked is one end and the second completes the range
 * (in date order, whichever was clicked first); in `single` mode one click is the day.
 */
export const DateRangePicker = ({
  ariaLabel,
  mode = 'range',
  presets,
  value,
  onChange,
  maxDay,
  minDay,
  maxSpanDays,
  placeholder,
  onClear,
  disabled,
  className,
}: DateRangePickerProps) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const shownDay = value.kind === 'range' ? value.from : value.kind === 'since' ? value.since : null;
  const [month, setMonth] = useState<Date>(() => (shownDay ? dayToDate(shownDay) : new Date()));
  const latest = maxDay ?? dateToDay(new Date());

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setCustom(presets.length === 0 || value.kind !== 'preset');
      setAnchor(null);
      setProblem(null);
      if (shownDay) setMonth(dayToDate(shownDay));
    }
  };

  const apply = (next: DateRangeValue) => {
    onChange(next);
    setOpen(false);
  };

  const pick = (day: string) => {
    setProblem(null);
    if (mode === 'single') {
      apply({ kind: 'since', since: day });
      return;
    }
    if (anchor === null) {
      setAnchor(day);
      return;
    }
    const [from, to] = anchor <= day ? [anchor, day] : [day, anchor];
    if (maxSpanDays !== undefined && spanDays(from, to) > maxSpanDays) {
      setProblem(`A range can span at most ${maxSpanDays} days.`);
      setAnchor(null);
      return;
    }
    apply({ kind: 'range', from, to });
  };

  const isEmpty =
    value.kind === 'preset' ? !presets.some((preset) => preset.value === value.value) : !shownDay;
  const label = isEmpty ? (placeholder ?? 'Choose dates') : formatRangeLabel(value, presets);
  const selectedFrom = anchor ?? (value.kind === 'range' ? value.from : value.kind === 'since' ? value.since : undefined);
  const selectedTo = anchor ? undefined : value.kind === 'range' ? value.to : undefined;

  return (
    <Popover
      ariaLabel={ariaLabel}
      open={open}
      onOpenChange={openChange}
      width={PANEL_WIDTH}
      className={className}
      trigger={({ toggle }) => (
        <Button variant="outline" size="sm" disabled={disabled} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
          <CalendarDays className="mr-2 h-4 w-4" aria-hidden />
          {label}
          <ChevronDown className="ml-2 h-4 w-4 opacity-60" aria-hidden />
        </Button>
      )}
    >
      {!custom ? (
        <ul className="py-1">
          {presets.map((preset) => (
            <li key={preset.value}>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={value.kind === 'preset' && value.value === preset.value}
                className={cn('w-full justify-start rounded-none', value.kind === 'preset' && value.value === preset.value && 'bg-accent')}
                onClick={() => apply({ kind: 'preset', value: preset.value })}
              >
                {preset.label}
              </Button>
            </li>
          ))}
          <li>
            <Button variant="ghost" size="sm" className="w-full justify-start rounded-none" onClick={() => setCustom(true)}>
              Custom…
            </Button>
          </li>
        </ul>
      ) : (
        <div>
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            from={selectedFrom}
            to={selectedTo}
            maxDay={latest}
            minDay={minDay}
            onPick={pick}
          />
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            {mode === 'single' ? 'Pick the first day.' : anchor ? 'Now pick the other end.' : 'Pick the first and last day.'}
          </p>
          {problem && (
            <p role="alert" className="px-3 pb-2 text-xs text-destructive">
              {problem}
            </p>
          )}
          {(presets.length > 0 || (onClear && value.kind !== 'preset')) && (
            <div className="flex justify-between border-t border-border p-1">
              {presets.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCustom(false)}>
                  Back to quick choices
                </Button>
              )}
              {onClear && value.kind !== 'preset' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  Clear dates
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
};
