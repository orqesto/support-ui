import type { Props as ReactSelectProps } from 'react-select';

export type Option = {
  value: string;
  label: string;
  menuLabel?: string;     // Title Case label shown in dropdown (falls back to label)
  chipClassName?: string; // Tailwind classes applied to chip control + option
  dotClassName?: string;  // Optional dot color for status-style indicators
  isDisabled?: boolean;
};

export type SelectProps = Omit<
  ReactSelectProps<Option>,
  'options' | 'value' | 'onChange' | 'isMulti'
> & {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Option[];
  variant?: 'default' | 'chip' | 'value';
  /** 'chip' only: 'sentence' drops the uppercase label (message detail v4 header). Default 'upper'. */
  chipCase?: 'upper' | 'sentence';
  /**
   * 'chip' / 'value' only, phones (<640px) only — message detail v4 mobile: the menu opens as a
   * bottom sheet (8px from the sides and bottom, 16px radius, 46px options at 15px, a dim scrim)
   * and the control grows to a touch size. Pure CSS behind `max-sm:`, so wider screens are
   * unchanged, and so is every caller that does not pass it.
   */
  mobileSheet?: boolean;
};
