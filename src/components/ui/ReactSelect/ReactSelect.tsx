import { forwardRef, useId } from 'react';
import ReactSelectLib from 'react-select';
import { Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getReactSelectStyles } from './reactSelect.styles';
import { DropdownIndicator } from './DropdownIndicator';
import { ChipDropdownIndicator } from './ChipDropdownIndicator';
import type { SelectProps, Option } from './reactSelect.types';

const CHIP_CONTROL =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide transition-colors cursor-pointer !min-h-0 h-auto shadow-none outline-none';

export const ReactSelect = forwardRef<unknown, SelectProps>(
  ({ label, error, value, onChange, options, id, className, variant = 'default', ...props }, _ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const { theme } = useTheme();

    const isDark = theme === 'dark';
    const customStyles = getReactSelectStyles(isDark, !!error);
    const selectedOption = options.find((opt) => opt.value === value) ?? null;

    if (variant === 'chip') {
      const chipColor = selectedOption?.chipClassName ?? 'text-muted-foreground border-border bg-muted hover:bg-accent hover:text-foreground';
      return (
        <ReactSelectLib<Option, false>
          inputId={selectId}
          value={selectedOption}
          onChange={(newValue) => {
            if (onChange && newValue) onChange(newValue.value);
          }}
          options={options}
          unstyled
          isSearchable={false}
          isClearable={false}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          menuPlacement="auto"
          components={{ DropdownIndicator: ChipDropdownIndicator }}
          styles={{
            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            // Force the cursor via inline style (beats unstyled-mode class handling):
            // hand on the chip control + selectable options, not-allowed when disabled.
            control: (base, state) => ({
              ...base,
              cursor: state.isDisabled ? 'not-allowed' : 'pointer',
            }),
            option: (base, state) => ({
              ...base,
              cursor: state.isDisabled ? 'not-allowed' : 'pointer',
            }),
          }}
          formatOptionLabel={(data, { context }) => {
            const isSelected = data.value === value;
            if (context === 'menu') {
              return (
                <div className="flex items-center gap-2 w-full">
                  {data.dotClassName && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${data.dotClassName}`} />
                  )}
                  <span className="whitespace-nowrap">{data.menuLabel ?? data.label}</span>
                  {isSelected && <Check className="ml-auto w-3 h-3 flex-shrink-0 opacity-70" />}
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1">
                {data.dotClassName && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${data.dotClassName}`} />
                )}
                <span className="whitespace-nowrap">{data.label}</span>
              </div>
            );
          }}
          classNames={{
            control: () => cn(CHIP_CONTROL, chipColor),
            valueContainer: () => 'flex items-center !p-0 !m-0',
            singleValue: () => 'text-inherit leading-none !m-0',
            indicatorsContainer: () => 'flex items-center !p-0',
            dropdownIndicator: () => '!p-0 ml-0.5',
            menu: () =>
              'mt-1 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[150px]',
            option: ({ data, isFocused, isSelected }) =>
              cn(
                'flex items-center rounded text-[13px] px-2 py-1.5 cursor-pointer transition-colors font-normal',
                // Keep only text-color classes from chipClassName, drop bg/border
                data.chipClassName
                  ? data.chipClassName.split(' ').filter(cls => cls.startsWith('text-') || cls.startsWith('dark:text-')).join(' ')
                  : 'text-foreground',
                isFocused && 'bg-accent',
                isSelected && 'font-medium'
              ),
            noOptionsMessage: () => 'text-[13px] text-muted-foreground px-2 py-1.5',
          }}
          {...props}
        />
      );
    }

    return (
      <div className={className}>
        <style>{`
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
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
            if (onChange && newValue) onChange(newValue.value);
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
