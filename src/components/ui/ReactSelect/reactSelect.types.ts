import type { Props as ReactSelectProps } from 'react-select';

export type Option = {
  value: string;
  label: string;
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
};
