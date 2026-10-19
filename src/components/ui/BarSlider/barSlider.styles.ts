/**
 * A range input laid over a bar, so the value is set by dragging ON the bar itself. The native
 * track is transparent (the bar below shows through); the thumb is a slim foreground handle the
 * full height of the control. A disabled slider hides its handle and leaves the bar readable.
 */
export const barSliderRootClasses = 'relative h-[26px]';

export const barSliderTrackClasses =
  'overflow-hidden absolute inset-x-0 top-1.5 h-3.5 rounded bg-muted';

export const barSliderInputClasses = [
  'absolute inset-0 m-0 w-full h-full bg-transparent appearance-none cursor-ew-resize rounded',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
  'disabled:cursor-default',
  '[&::-webkit-slider-runnable-track]:h-[26px] [&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-moz-range-track]:h-[26px] [&::-moz-range-track]:bg-transparent',
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-[26px] [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-card',
  '[&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-card',
  '[&:disabled::-webkit-slider-thumb]:opacity-0 [&:disabled::-moz-range-thumb]:opacity-0',
].join(' ');

export const barMarkerClasses = {
  /** A hard line across the bar: "stops here". */
  line: 'absolute inset-y-0 w-0.5 bg-foreground pointer-events-none',
  /** A quiet reference tick: a line that belongs to something else. */
  tick: 'absolute top-0.5 bottom-0.5 w-0.5 bg-muted-foreground opacity-70 pointer-events-none',
} as const;
