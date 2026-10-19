import { cn } from '@/lib/utils';
import {
  barMarkerClasses,
  barSliderInputClasses,
  barSliderRootClasses,
  barSliderTrackClasses,
} from './barSlider.styles';
import type { BarMarkerProps, BarSegmentProps, BarSliderProps } from './barSlider.types';

const clampPct = (pct: number) => Math.min(100, Math.max(0, pct));

/**
 * A bar you drag on: segments show what is used, a native range input on top sets a value.
 * The input is the same element for the life of the component — callers must not key it by
 * the value, or a drag in progress is dropped on every change.
 */
export const BarSlider = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  ariaValueText,
  disabled,
  children,
  markers,
  className,
}: BarSliderProps) => (
  <div className={cn(barSliderRootClasses, className)}>
    <div className={barSliderTrackClasses}>{children}</div>
    {markers}
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      onChange={(event) => onChange(Number(event.target.value))}
      className={barSliderInputClasses}
    />
  </div>
);

export const BarSegment = ({ left = 0, width, fromRight, className, style }: BarSegmentProps) => (
  <div
    className={cn('absolute inset-y-0', className)}
    style={{
      ...(fromRight ? { right: 0 } : { left: `${clampPct(left)}%` }),
      width: `${clampPct(width)}%`,
      ...style,
    }}
  />
);

export const BarMarker = ({ at, variant = 'line', title }: BarMarkerProps) => (
  <div
    className={barMarkerClasses[variant]}
    style={{ left: `calc(${clampPct(at)}% - 1px)` }}
    title={title}
    aria-hidden="true"
  />
);
