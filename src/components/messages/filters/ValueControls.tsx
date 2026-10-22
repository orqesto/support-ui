import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MonthCalendar, dateToDay, dayToDate } from '@/components/ui/DateRangePicker';
import { endOfDayIso, startOfDayIso, toDateInput } from './receivedRange';

/**
 * The two controls a value panel grows once the API can honour them: the `is / is not`
 * switch and the explicit date range.
 *
 * Shared by the desktop popover and the mobile drawer rather than written twice — the
 * old panel's two surfaces drifting apart is exactly what the schema was meant to end.
 * Only the metrics differ, which is what `size` is.
 */

type Size = 'compact' | 'touch';

/**
 * `is` / `is not`.
 *
 * Worth a switch rather than a checkbox labelled "invert": negation reads as part of the
 * sentence the token spells out ("status is not Resolved"), and a checkbox sitting under
 * a list of values does not say which way round it applies.
 */
export const NegateSwitch = ({
  negated,
  onChange,
  size = 'compact',
}: {
  negated: boolean;
  onChange: (negated: boolean) => void;
  size?: Size;
}) => {
  const height = size === 'touch' ? 'h-8' : 'h-6';
  const text = size === 'touch' ? 'text-[12.5px]' : 'text-[11px]';
  return (
    <div
      role="group"
      aria-label="Match or exclude"
      className={`grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-muted dark:bg-background dark:border dark:border-border/60 ${height}`}
    >
      {[false, true].map((option) => {
        const on = negated === option;
        return (
          <Button
            key={String(option)}
            variant="ghost"
            aria-pressed={on}
            onClick={() => onChange(option)}
            className={`px-2 h-full rounded ${text} ${
              on
                ? option
                  ? 'bg-card text-destructive dark:bg-accent font-semibold shadow-sm'
                  : 'bg-card dark:bg-accent text-foreground font-semibold shadow-sm'
                : 'font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {option ? 'is not' : 'is'}
          </Button>
        );
      })}
    </div>
  );
};

/**
 * From / to, picked on a month calendar (the shared date-range control's calendar, inline: this
 * already lives in a menu panel). The first day clicked is "from"; the next completes the range,
 * in date order whichever end came first; a click after that starts a new range. A range with
 * one end ("everything since the 9th") is kept as it was — the API takes it.
 *
 * The stored value is an instant, not a day — see `receivedRange.ts` for why — so these convert
 * on the way in and out. `to` is the END of its day, or picking the same day for both bounds
 * would select the single instant of midnight and match nothing.
 */
export const DateRangeFields = ({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (next: { from?: string; to?: string }) => void;
  size?: Size;
}) => {
  const fromDay = toDateInput(from) || undefined;
  const toDay = toDateInput(to) || undefined;
  const [month, setMonth] = useState<Date>(() => (fromDay ? dayToDate(fromDay) : new Date()));

  const pick = (day: string) => {
    if (!fromDay || toDay) {
      onChange({ from: startOfDayIso(day), to: undefined });
      return;
    }
    const [first, last] = fromDay <= day ? [fromDay, day] : [day, fromDay];
    onChange({ from: startOfDayIso(first), to: endOfDayIso(last) });
  };

  return (
    <div className="space-y-1">
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        from={fromDay}
        to={toDay}
        maxDay={dateToDay(new Date())}
        onPick={pick}
      />
      <p className="px-3 text-[11px] text-muted-foreground">
        {fromDay && !toDay ? 'Since this day — pick another to end the range.' : 'Pick the first and last day.'}
      </p>
      {(from !== undefined || to !== undefined) && (
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            onClick={() => onChange({ from: undefined, to: undefined })}
            className="px-2 h-7 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Clear dates
          </Button>
        </div>
      )}
    </div>
  );
};
