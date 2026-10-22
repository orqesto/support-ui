import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { dateToDay } from './dateRangeValue';

type MonthCalendarProps = {
  /** Any day in the month shown. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** The chosen days, `YYYY-MM-DD`: one end, both, or none. */
  from?: string;
  to?: string;
  /** Days after it cannot be picked (`YYYY-MM-DD`). */
  maxDay?: string;
  /** Days before it cannot be picked (`YYYY-MM-DD`). */
  minDay?: string;
  onPick: (day: string) => void;
};

const WEEK_STARTS_ON = 1; // Monday

/**
 * One month as a week grid (Monday first). Each day is a button named by its full date
 * ("9 October 2026"), pressed when it is a chosen end, marked when it lies between them. Day
 * strings compare as text: `YYYY-MM-DD` sorts in date order.
 */
export const MonthCalendar = ({ month, onMonthChange, from, to, maxDay, minDay, onPick }: MonthCalendarProps) => {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  const days: Date[] = [];
  for (let at = first; at <= last; at = addDays(at, 1)) days.push(at);
  const weekdays = days.slice(0, 7).map((date) => format(date, 'EEEEEE'));

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={format(month, 'MMMM yyyy')}>
        {weekdays.map((weekday) => (
          <span key={weekday} className="py-1 text-xs text-muted-foreground" aria-hidden>
            {weekday}
          </span>
        ))}
        {days.map((date) => {
          const day = dateToDay(date);
          const isEnd = day === from || day === to;
          const isBetween = !!from && !!to && day > from && day < to;
          const outside = !isSameMonth(date, month);
          return (
            <Button
              key={day}
              variant="ghost"
              size="sm"
              aria-label={format(date, 'd MMMM yyyy')}
              aria-pressed={isEnd}
              disabled={(!!maxDay && day > maxDay) || (!!minDay && day < minDay)}
              onClick={() => onPick(day)}
              className={cn(
                'h-8 w-full px-0 text-sm',
                outside && 'text-muted-foreground opacity-60',
                isBetween && 'rounded-none bg-accent',
                isEnd && 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {format(date, 'd')}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
