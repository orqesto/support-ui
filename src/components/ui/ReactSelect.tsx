import { forwardRef, useId } from 'react';
import ReactSelectLib, { type Props as ReactSelectProps, type StylesConfig } from 'react-select';
import { useTheme } from '@/contexts/ThemeContext';

type Option = {
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

export const ReactSelect = forwardRef<unknown, SelectProps>(
  ({ label, error, value, onChange, options, id, className, ...props }) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const { theme } = useTheme();

    const isDark = theme === 'dark';

    const customStyles: StylesConfig<Option> = {
      control: (base, state) => ({
        ...base,
        minHeight: '2.5rem',
        height: '2.5rem',
        borderColor: error
          ? 'hsl(var(--destructive))'
          : state.isFocused
            ? 'hsl(var(--primary))'
            : 'hsl(var(--border))',
        backgroundColor: 'hsl(var(--input))',
        color: 'hsl(var(--foreground))',
        boxShadow: state.isFocused ? '0 0 0 2px hsl(var(--primary))' : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        '&:hover': {
          borderColor: state.isFocused ? 'hsl(var(--primary))' : 'hsl(var(--accent-foreground))',
          backgroundColor: 'hsl(var(--accent))',
        },
      }),
      valueContainer: (base) => ({
        ...base,
        height: '2.5rem',
        padding: '0 0.75rem',
      }),
      input: (base) => ({
        ...base,
        margin: 0,
        padding: 0,
        color: 'hsl(var(--foreground))',
      }),
      indicatorSeparator: () => ({
        display: 'none',
      }),
      indicatorsContainer: (base) => ({
        ...base,
        height: '2.5rem',
        cursor: 'pointer',
      }),
      dropdownIndicator: (base) => ({
        ...base,
        cursor: 'pointer',
        '&:hover': {
          color: 'hsl(var(--primary))',
        },
      }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        zIndex: 9999,
      }),
      menuList: (base) => ({
        ...base,
        padding: 0,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? 'hsl(var(--primary))'
          : state.isFocused
            ? isDark
              ? '#334155'
              : '#f1f5f9'
            : isDark
              ? '#1e293b'
              : '#ffffff',
        color: state.isSelected ? 'hsl(var(--primary-foreground))' : isDark ? '#e2e8f0' : '#1e293b',
        cursor: 'pointer',
        padding: '0.5rem 0.75rem',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          backgroundColor: state.isSelected
            ? 'hsl(var(--primary))'
            : isDark
              ? '#334155'
              : '#f1f5f9',
        },
        '&:active': {
          backgroundColor: 'hsl(var(--primary))',
        },
      }),
      singleValue: (base) => ({
        ...base,
        color: 'hsl(var(--foreground))',
      }),
      placeholder: (base) => ({
        ...base,
        color: 'hsl(var(--muted-foreground))',
      }),
    };

    const selectedOption = options.find((opt) => opt.value === value) ?? null;

    return (
      <div className={className}>
        {label && (
          <label htmlFor={selectId} className="block mb-2 text-sm font-medium">
            {label}
          </label>
        )}
        <ReactSelectLib<Option, false>
          inputId={selectId}
          value={selectedOption}
          onChange={(newValue) => {
            if (onChange && newValue) {
              onChange(newValue.value);
            }
          }}
          options={options}
          styles={customStyles}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

ReactSelect.displayName = 'ReactSelect';
