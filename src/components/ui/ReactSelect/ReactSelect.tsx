import { forwardRef, useId } from 'react';
import ReactSelectLib from 'react-select';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getReactSelectStyles } from './reactSelect.styles';
import { DropdownIndicator } from './DropdownIndicator';
import type { SelectProps, Option } from './reactSelect.types';

export const ReactSelect = forwardRef<unknown, SelectProps>(
  ({ label, error, value, onChange, options, id, className, ...props }, _ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const { theme } = useTheme();

    const isDark = theme === 'dark';
    const customStyles = getReactSelectStyles(isDark, !!error);
    const selectedOption = options.find((opt) => opt.value === value) ?? null;

    return (
      <div className={className}>
        <style>{`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              'block mb-2 text-sm font-medium transition-colors',
              error ? 'text-destructive' : 'text-foreground'
            )}
          >
            {label}
            {props.required && <span className="ml-1 text-destructive">*</span>}
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
          components={{ DropdownIndicator }}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          menuPlacement="auto"
          closeMenuOnScroll={false}
          isClearable={false}
          isSearchable={true}
          blurInputOnSelect={true}
          captureMenuScroll={false}
          tabSelectsValue={true}
          noOptionsMessage={() => 'No options available'}
          loadingMessage={() => 'Loading...'}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${selectId}-error`} className="mt-1.5 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

ReactSelect.displayName = 'ReactSelect';
