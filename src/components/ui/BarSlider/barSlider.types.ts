import type { CSSProperties, ReactNode } from 'react';

export type BarSliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accessible name of the slider (the bar has no visible label of its own). */
  ariaLabel: string;
  /** Spoken value, e.g. "80% of the budget". */
  ariaValueText?: string;
  disabled?: boolean;
  /** Segments drawn inside the bar (`BarSegment`). */
  children?: ReactNode;
  /** Lines/ticks drawn over the bar (`BarMarker`), under the handle. */
  markers?: ReactNode;
  className?: string;
};

export type BarSegmentProps = {
  /** Start, % of the bar. */
  left?: number;
  /** Width, % of the bar. */
  width: number;
  /** Anchor at the right edge instead of `left`. */
  fromRight?: boolean;
  className?: string;
  style?: CSSProperties;
};

export type BarMarkerProps = {
  /** Position, % of the bar. */
  at: number;
  variant?: 'line' | 'tick';
  title?: string;
};
