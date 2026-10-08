import { forwardRef, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactSelectLib, { type SelectInstance } from 'react-select';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInputErrorClasses, getInputLabelClasses } from '../Input/input.styles';
import { getSelectStyles } from './select.styles';
import { DropdownIndicator } from './DropdownIndicator';
import { ChipDropdownIndicator } from './ChipDropdownIndicator';
import { SEARCHABLE_FROM, type SelectProps, type Option } from './select.types';
import { ColorDot, SelectPopover } from './SelectPopover';
import { matchesLabel } from './selectFilter';

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

export const Select = forwardRef<unknown, SelectProps>(
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
      size = 'md',
      multi = false,
      searchable,
      disabled,
      isDisabled,
      hint,
      trigger,
      align = 'start',
      popoverWidth = 220,
      open,
      onOpenChange,
      panelProps,
      creatable = false,
      onCreate,
      createLabel,
      clearable = false,
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
    const menuOpenRef = useRef(false);
    /**
     * ⛔ Escape that closes THIS menu stops here. A Dialog listens for Escape on the document; an
     * Escape meant for the dropdown also closed the dialog and threw away the half-filled form.
     * (Not `defaultPrevented`: react-select prevents default on every Escape, open or not, and a
     * closed select must still let Escape close its dialog.) React dispatches at the root / portal
     * container, below the document, so stopping the native event here is in time.
     */
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && menuOpenRef.current) event.nativeEvent.stopPropagation();
      props.onKeyDown?.(event);
    };
    const trackMenu = (open: boolean, then?: () => void) => {
      menuOpenRef.current = open;
      then?.();
    };
    const selectRef = useRef<SelectInstance<Option, boolean> | null>(null);
    const selectId = id ?? generatedId;
    const isMulti = multi && variant === 'default';
    // chip / value have no multi mode: a `multi` there behaves as single rather than crashing on .map.
    const emitsMany = multi && (variant === 'default' || variant === 'popover');
    const customStyles = getSelectStyles(!!error, size, isMulti);
    const selectedValues: string[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const selectedOption = options.find((opt) => opt.value === selectedValues[0]) ?? null;
    const selectedOptions = options.filter((opt) => selectedValues.includes(opt.value));
    /**
     * A caller that searches for itself (server-side: `onInputChange` / `inputValue`, or
     * `filterOption={null}`) is always searchable — its options shrink as the user types, and
     * flipping to the read-only input below 8 results wiped what they had typed (Add a member).
     */
    const drivesOwnSearch =
      props.onInputChange !== undefined || props.inputValue !== undefined || props.filterOption === null;
    const isSearchable = searchable ?? (drivesOwnSearch || options.length >= SEARCHABLE_FROM);
    const off = disabled ?? isDisabled;
    // Narrowed once here: the props union says which signature the caller gave.
    const emit = (next: Option | readonly Option[] | null) => {
      if (!onChange) return;
      if (emitsMany) {
        // Values the list does not offer (a department this workspace no longer lists) are kept:
        // the user never saw them, so a tick elsewhere must not delete them.
        const offered = new Set(options.map((opt) => opt.value));
        const hidden = selectedValues.filter((val) => !offered.has(val));
        const picked = (Array.isArray(next) ? (next as readonly Option[]) : []).map((opt) => opt.value);
        (onChange as (value: string[]) => void)([...hidden, ...picked]);
      }
      else if (next && !Array.isArray(next)) (onChange as (value: string) => void)((next as Option).value);
      // Only the clear button sends null for a single select: report it as the empty value.
      else if (next === null && clearable) (onChange as (value: string) => void)('');
      else if (next && Array.isArray(next) && !emitsMany) {
        const first = (next as readonly Option[])[0];
        if (first) (onChange as (value: string) => void)(first.value);
      }
    };

    if (variant === 'popover' && trigger) {
      return (
        <SelectPopover
          trigger={trigger}
          options={options}
          selectedValues={selectedValues}
          multi={multi}
          emit={emit}
          align={align}
          width={popoverWidth}
          open={open}
          onOpenChange={onOpenChange}
          panelProps={panelProps}
          noOptionsMessage={props.noOptionsMessage}
          filterOption={props.filterOption}
          searchable={searchable ?? true}
          creatable={creatable}
          onCreate={onCreate}
          createLabel={createLabel}
          placeholder={props.placeholder}
          disabled={off}
          ariaLabel={props['aria-label'] ?? label}
          className={className}
        />
      );
    }

    if (variant === 'chip' || variant === 'value') {
      const chipColor =
        variant === 'value'
          ? ''
          : (selectedOption?.chipClassName ??
            'text-muted-foreground border-border bg-muted hover:bg-accent hover:text-foreground');
      const chip = (
        <ReactSelectLib<Option, boolean>
          ref={selectRef}
          inputId={selectId}
          value={selectedOption}
          onChange={emit}
          options={options}
          // chip / value draw no <label>: `label` becomes the accessible name instead of vanishing.
          aria-label={props['aria-label'] ?? label}
          unstyled
          isDisabled={off}
          isSearchable={searchable ?? false}
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
            const isSelected = selectedValues.includes(data.value);
            if (context === 'menu') {
              return (
                <div className="flex items-center gap-2 w-full">
                  {data.dotClassName && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${data.dotClassName}`}
                    />
                  )}
                  {data.color && <ColorDot color={data.color} />}
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
          onMenuOpen={() =>
            trackMenu(true, () => {
              if (mobileSheet) setSheetOpen(true);
              onMenuOpen?.();
            })
          }
          onMenuClose={() =>
            trackMenu(false, () => {
              if (mobileSheet) setSheetOpen(false);
              onMenuClose?.();
            })
          }
          {...props}
          onKeyDown={onKeyDown}
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
              getInputLabelClasses(size),
              'transition-colors',
              error ? 'text-destructive' : 'text-foreground'
            )}
          >
            {label}
            {props.required && <span className="ml-1 text-destructive">*</span>}
          </label>
        )}
        <ReactSelectLib<Option, boolean>
          ref={selectRef}
          inputId={selectId}
          value={isMulti ? selectedOptions : selectedOption}
          onChange={emit}
          options={options}
          isMulti={isMulti}
          formatOptionLabel={
            isMulti
              ? (data, { context }) =>
                  context === 'menu' ? (
                    <span className="flex items-center gap-2 w-full">
                      <span className="truncate">{data.menuLabel ?? data.label}</span>
                      {selectedValues.includes(data.value) && (
                        <Check className="ml-auto w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                      )}
                    </span>
                  ) : (
                    data.label
                  )
              : (data, { context }) =>
                  // `menuLabel` (Title Case) in the menu, `label` in the control — as the chip variant does.
                  context === 'menu' && data.color ? (
                    <span className="flex items-center gap-2">
                      <ColorDot color={data.color} />
                      {data.menuLabel ?? data.label}
                    </span>
                  ) : context === 'menu' ? (
                    (data.menuLabel ?? data.label)
                  ) : (
                    data.label
                  )
          }
          isDisabled={off}
          // A checklist: stays open while ticking, and keeps ticked rows in the list.
          closeMenuOnSelect={!isMulti}
          hideSelectedOptions={false}
          styles={customStyles}
          components={{
            DropdownIndicator,
            // Nothing to clear when the empty option ("All") is the one selected.
            ...(selectedValues[0] === '' || selectedValues.length === 0 ? { ClearIndicator: () => null } : {}),
          }}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          menuPlacement="auto"
          classNamePrefix="select"
          // The app's wording, not react-select's English "Select..." (three ASCII dots).
          placeholder="Select…"
          filterOption={matchesLabel}
          closeMenuOnScroll={false}
          isClearable={clearable}
          isSearchable={isSearchable}
          blurInputOnSelect={!isMulti}
          captureMenuScroll={false}
          tabSelectsValue={true}
          noOptionsMessage={() => 'No options available'}
          loadingMessage={() => 'Loading...'}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          onMenuOpen={() => trackMenu(true, onMenuOpen)}
          onMenuClose={() => trackMenu(false, onMenuClose)}
          {...props}
          onKeyDown={onKeyDown}
        />
        {error ? (
          <p id={`${selectId}-error`} className={getInputErrorClasses(size)} role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={`${selectId}-hint`} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
