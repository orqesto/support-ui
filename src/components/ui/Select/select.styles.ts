import type { StylesConfig } from 'react-select';
import type { Option, SelectSize } from './select.types';

/** Height, side padding and text size per size — the same scale as `Input` (h-8/10/12, px-2/3/4, text-xs/sm/base). */
export const SELECT_SIZES: Record<SelectSize, { height: string; paddingX: string; fontSize: string }> = {
  sm: { height: '2rem', paddingX: '0.5rem', fontSize: '0.75rem' },
  md: { height: '2.5rem', paddingX: '0.75rem', fontSize: '0.875rem' },
  lg: { height: '3rem', paddingX: '1rem', fontSize: '1rem' },
};

export const getSelectStyles = (
  hasError: boolean,
  size: SelectSize = 'md',
  multi = false
): StylesConfig<Option, boolean> => {
  const { height, paddingX, fontSize } = SELECT_SIZES[size];
  return {
  control: (base, state) => ({
    ...base,
    minHeight: height,
    // A multi select grows with its chips; a single one is exactly the Input's height.
    height: multi ? 'auto' : height,
    minWidth: '120px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '0.375rem',
    borderColor: hasError
      ? 'hsl(var(--destructive))'
      : state.isFocused
        ? 'hsl(var(--primary))'
        : state.isDisabled
          ? 'hsl(var(--muted))'
          : 'hsl(var(--border))',
    backgroundColor: state.isDisabled ? 'hsl(var(--muted))' : 'hsl(var(--input))',
    color: 'hsl(var(--foreground))',
    boxShadow: state.isFocused
      ? '0 0 0 2px hsl(var(--primary) / 0.1)'
      : hasError
        ? '0 0 0 2px hsl(var(--destructive) / 0.1)'
        : 'none',
    cursor: state.isDisabled ? 'not-allowed' : 'pointer',
    opacity: state.isDisabled ? 0.6 : 1,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
      borderColor: state.isDisabled
        ? 'hsl(var(--muted))'
        : state.isFocused
          ? 'hsl(var(--primary))'
          : 'hsl(var(--accent-foreground))',
      backgroundColor: state.isDisabled ? 'hsl(var(--muted))' : 'hsl(var(--accent))',
    },
  }),
  valueContainer: (base) => ({
    ...base,
    height: multi ? 'auto' : height,
    padding: multi ? `0.125rem ${paddingX}` : `0 ${paddingX}`,
    overflow: 'hidden',
    flexWrap: multi ? 'wrap' : 'nowrap',
    gap: multi ? '0.25rem' : undefined,
  }),
  multiValue: (base) => ({
    ...base,
    margin: 0,
    borderRadius: '0.25rem',
    backgroundColor: 'hsl(var(--muted))',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'hsl(var(--foreground))',
    fontSize: '0.75rem',
    padding: '0.0625rem 0.375rem',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    borderRadius: '0 0.25rem 0.25rem 0',
    '&:hover': { backgroundColor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' },
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    color: 'hsl(var(--foreground))',
    fontSize,
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: multi ? 'auto' : height,
    alignSelf: 'stretch',
    cursor: 'pointer',
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    padding: '0.25rem',
    color: state.isFocused ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
    transition: 'color 0.2s ease, transform 0.2s ease',
    '&:hover': {
      color: 'hsl(var(--primary))',
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: '0.25rem',
    color: 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
    transition: 'color 0.2s ease',
    '&:hover': {
      color: 'hsl(var(--destructive))',
    },
  }),
  loadingIndicator: (base) => ({
    ...base,
    color: 'hsl(var(--primary))',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '0.5rem',
    boxShadow:
      '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1), 0 0 0 1px hsl(var(--border))',
    marginTop: '0.25rem',
    overflow: 'hidden',
    zIndex: 99999,
    animation: 'slideIn 0.15s ease-out',
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 99999,
  }),
  menuList: (base) => ({
    ...base,
    padding: '0.25rem',
    backgroundColor: 'hsl(var(--card))',
    maxHeight: '300px',
    '::-webkit-scrollbar': {
      width: '8px',
    },
    '::-webkit-scrollbar-track': {
      background: 'hsl(var(--muted))',
    },
    '::-webkit-scrollbar-thumb': {
      background: 'hsl(var(--border))',
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: 'hsl(var(--muted-foreground))',
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'hsl(var(--accent))'
      : state.isFocused
        ? 'hsl(var(--accent))'
        : 'transparent',
    color: state.isSelected
      ? 'hsl(var(--accent-foreground))'
      : state.isDisabled
        ? 'hsl(var(--muted-foreground))'
        : 'hsl(var(--foreground))',
    cursor: state.isDisabled ? 'not-allowed' : 'pointer',
    padding: '0.5rem 0.625rem',
    borderRadius: '0.25rem',
    fontSize: '0.8125rem',
    fontWeight: state.isSelected ? '500' : '400',
    opacity: state.isDisabled ? 0.5 : 1,
    transition: 'background-color 0.1s ease, color 0.1s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    '&:active': {
      backgroundColor: state.isDisabled
        ? 'transparent'
        : 'hsl(var(--accent) / 0.8)',
    },
  }),
  singleValue: (base, state) => ({
    ...base,
    color: state.isDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
    fontSize,
    lineHeight: '1.25rem',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize,
    lineHeight: '1.25rem',
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.8125rem',
    padding: '0.5rem 0.625rem',
  }),
  loadingMessage: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.875rem',
    padding: '0.75rem',
  }),
  group: (base) => ({
    ...base,
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
  }),
  groupHeading: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '0.5rem 0.75rem 0.25rem',
  }),
};
};
