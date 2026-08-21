import { Button } from '@/components/ui/Button';
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
                  ? 'bg-card text-red-600 dark:text-red-400 dark:bg-accent font-semibold shadow-sm'
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
 * From / to, as two day pickers.
 *
 * The stored value is an instant, not a day — see `receivedRange.ts` for why — so these
 * convert on the way in and out. `to` is the END of its day, or picking the same day for
 * both bounds would select the single instant of midnight and match nothing.
 */
export const DateRangeFields = ({
  from,
  to,
  onChange,
  size = 'compact',
}: {
  from?: string;
  to?: string;
  onChange: (next: { from?: string; to?: string }) => void;
  size?: Size;
}) => {
  const field = `w-full rounded-md border bg-input border-border px-2 outline-none focus:border-primary ${
    size === 'touch' ? 'h-11 text-[14px]' : 'h-8 text-[12.5px]'
  }`;
  const fromInput = toDateInput(from);
  const toInput = toDateInput(to);

  return (
    <div className="p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="block text-[11px] font-medium text-muted-foreground">From</span>
          <input
            type="date"
            value={fromInput}
            // An empty input clears that bound rather than the whole filter: "everything
            // before the 9th" is a range with one end, and the API takes it.
            max={toInput === '' ? undefined : toInput}
            onChange={(event) =>
              onChange({ from: startOfDayIso(event.target.value), to })
            }
            className={field}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-[11px] font-medium text-muted-foreground">To</span>
          <input
            type="date"
            value={toInput}
            min={fromInput === '' ? undefined : fromInput}
            onChange={(event) => onChange({ from, to: endOfDayIso(event.target.value) })}
            className={field}
          />
        </label>
      </div>
      {(from !== undefined || to !== undefined) && (
        <Button
          variant="ghost"
          onClick={() => onChange({ from: undefined, to: undefined })}
          className="px-2 h-7 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Clear dates
        </Button>
      )}
    </div>
  );
};
