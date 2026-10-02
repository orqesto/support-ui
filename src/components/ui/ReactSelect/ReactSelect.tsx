import { forwardRef, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactSelectLib, { type SelectInstance } from 'react-select';
import { Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getReactSelectStyles } from './reactSelect.styles';
import { DropdownIndicator } from './DropdownIndicator';
import { ChipDropdownIndicator } from './ChipDropdownIndicator';
import type { SelectProps, Option } from './reactSelect.types';

// 'value': a compact field value in sentence case (message detail v3 meta row — Assigned,
// Category). Same unstyled machinery as 'chip', none of the uppercase-label styling.
const VALUE_CONTROL =
  'inline-flex items-center gap-1 h-[23px] px-2 rounded-md border border-border bg-card text-[11.5px] text-foreground hover:border-border-strong transition-colors cursor-pointer !min-h-0 shadow-none outline-none max-w-[220px]';
const CHIP_CONTROL =
  'font-display inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium uppercase tracking-[0.09em] transition-colors cursor-pointer !min-h-0 h-auto shadow-none outline-none';
// chipCase 'sentence' (message detail v4 header): the same chip, 12px / 500, no uppercase. Opt-in
// per caller — every other 'chip' keeps the uppercase label.
const CHIP_SENTENCE_CONTROL =
  'inline-flex items-center gap-1 h-[23px] px-2 rounded-md border text-[12px] font-medium normal-case tracking-normal transition-colors cursor-pointer !min-h-0 shadow-none outline-none';

/*
  `mobileSheet` (v4 mobile, phones only). react-select positions the fixed menu portal with inline
  top/left/width, so the sheet's geometry needs `!` to win; the menu itself drops back into the
  portal's flow (`!static`) so the portal grows to its height from the bottom edge.
*/
const SHEET_PORTAL =
  'max-sm:!fixed max-sm:!left-2 max-sm:!right-2 max-sm:!top-auto max-sm:!bottom-2 max-sm:!w-auto';
const SHEET_MENU =
  'max-sm:!static max-sm:!m-0 max-sm:max-h-[72vh] max-sm:overflow-y-auto max-sm:rounded-2xl max-sm:p-2 max-sm:shadow-2xl';
/*
  The dim layer behind the sheet: a real element, under the menu portal (z 9999), phones only.
  ⛔ It used to be the menu's own spread box-shadow — which paints but does not take hits, so a
  tap on the "scrim" went straight through to the control beneath it. This one takes the tap:
  it closes the menu and the tap ends there (a mouse press keeps the focus where it is, so the
  close is ours, and a touch's synthetic click is cancelled at touchend).
*/
const SHEET_SCRIM = 'hidden max-sm:block fixed inset-0 z-[9998] bg-black/40';
const SHEET_OPTION = 'max-sm:min-h-[46px] max-sm:text-[15px] max-sm:px-3';
const SHEET_CHIP_CONTROL = 'max-sm:h-[26px]';
const SHEET_VALUE_CONTROL = 'max-sm:h-9 max-sm:text-[13.5px]';

export const ReactSelect = forwardRef<unknown, SelectProps>(
  (
    {
      label,
      error,
      value,
      onChange,
      options,
      id,
      className,
      variant = 'default',
      chipCase = 'upper',
      mobileSheet = false,
      onMenuOpen,
      onMenuClose,
      ...props
    },
    _ref
  ) => {
    const generatedId = useId();
    // mobileSheet only: whether the menu is open, so the scrim can be drawn behind it.
    const [sheetOpen, setSheetOpen] = useState(false);
    const selectRef = useRef<SelectInstance<Option, false> | null>(null);
    const selectId = id ?? generatedId;
    const { theme } = useTheme();

    const isDark = theme === 'dark';
    const customStyles = getReactSelectStyles(isDark, !!error);
    const selectedOption = options.find((opt) => opt.value === value) ?? null;

    if (variant === 'chip' || variant === 'value') {
      const chipColor =
        variant === 'value'
          ? ''
          : (selectedOption?.chipClassName ??
            'text-muted-foreground border-border bg-muted hover:bg-accent hover:text-foreground');
      const chip = (
        <ReactSelectLib<Option, false>
          ref={selectRef}
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
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${data.dotClassName}`}
                    />
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
            control: () =>
              cn(
                variant === 'value'
                  ? VALUE_CONTROL
                  : chipCase === 'sentence'
                    ? CHIP_SENTENCE_CONTROL
                    : CHIP_CONTROL,
                chipColor,
                mobileSheet && (variant === 'value' ? SHEET_VALUE_CONTROL : SHEET_CHIP_CONTROL)
              ),
            menuPortal: () => (mobileSheet ? SHEET_PORTAL : ''),
            valueContainer: () => 'flex items-center !p-0 !m-0 min-w-0',
            singleValue: () => 'text-inherit leading-none !m-0 truncate',
            placeholder: () => 'text-muted-foreground leading-none',
            input: () => 'text-[11.5px] !m-0 !p-0',
            indicatorsContainer: () => 'flex items-center !p-0',
            dropdownIndicator: () => '!p-0 ml-0.5',
            menu: () =>
              cn(
                'mt-1 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[150px]',
                mobileSheet && SHEET_MENU
              ),
            option: ({ data, isFocused, isSelected }) =>
              cn(
                'flex items-center rounded text-[13px] px-2 py-1.5 cursor-pointer transition-colors font-normal',
                // Keep only text-color classes from chipClassName, drop bg/border
                data.chipClassName
                  ? data.chipClassName
                      .split(' ')
                      .filter((cls) => cls.startsWith('text-') || cls.startsWith('dark:text-'))
                      .join(' ')
                  : 'text-foreground',
                isFocused && 'bg-accent',
                isSelected && 'font-medium',
                mobileSheet && SHEET_OPTION
              ),
            noOptionsMessage: () => 'text-[13px] text-muted-foreground px-2 py-1.5',
          }}
          onMenuOpen={() => {
            if (mobileSheet) setSheetOpen(true);
            onMenuOpen?.();
          }}
          onMenuClose={() => {
            if (mobileSheet) setSheetOpen(false);
            onMenuClose?.();
          }}
          {...props}
        />
      );
      if (!mobileSheet || !sheetOpen) return chip;
      // Closed directly (a blur alone closes nothing when the select was never focused), then
      // blurred, as react-select's own outside tap does.
      const closeSheet = () => {
        selectRef.current?.onMenuClose();
        selectRef.current?.blur();
      };
      return (
        <>
          {chip}
          {createPortal(
            <div
              aria-hidden
              data-testid="select-sheet-scrim"
              className={SHEET_SCRIM}
              // Keep the focus in the select, so the menu is closed here, after the click.
              onMouseDown={(event) => event.preventDefault()}
              // A touch: no synthetic click to land on whatever is under the scrim once it goes.
              onTouchEnd={(event) => {
                event.preventDefault();
                closeSheet();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeSheet();
              }}
            />,
            document.body
          )}
        </>
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
          onMenuOpen={onMenuOpen}
          onMenuClose={onMenuClose}
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
