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
  variant?: 'default' | 'chip';
};
