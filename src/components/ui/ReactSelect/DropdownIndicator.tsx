import { ChevronDown } from 'lucide-react';
import { components, type DropdownIndicatorProps } from 'react-select';
import type { Option } from './reactSelect.types';

export const DropdownIndicator = (props: DropdownIndicatorProps<Option, false>) => (
  <components.DropdownIndicator {...props}>
    <ChevronDown
      className={`w-4 h-4 transition-transform duration-200 ${
        props.selectProps.menuIsOpen ? 'rotate-180' : 'rotate-0'
      }`}
    />
  </components.DropdownIndicator>
);
