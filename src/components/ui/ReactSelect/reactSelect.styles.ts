import type { StylesConfig } from 'react-select';
import type { Option } from './reactSelect.types';

export const getReactSelectStyles = (isDark: boolean, hasError: boolean): StylesConfig<Option> => ({
  control: (base, state) => ({
    ...base,
    minHeight: '2rem',
    height: '2rem',
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
    height: '2rem',
    padding: '0 0.5rem',
    overflow: 'hidden',
    flexWrap: 'nowrap',
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    color: 'hsl(var(--foreground))',
    fontSize: '0.875rem',
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: '2rem',
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
    backgroundColor: isDark ? '#1e293b' : '#ffffff',
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
    backgroundColor: isDark ? '#1e293b' : '#ffffff',
    maxHeight: '300px',
    '::-webkit-scrollbar': {
      width: '8px',
    },
    '::-webkit-scrollbar-track': {
      background: isDark ? '#1e293b' : '#f1f5f9',
    },
    '::-webkit-scrollbar-thumb': {
      background: isDark ? '#475569' : '#cbd5e1',
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: isDark ? '#64748b' : '#94a3b8',
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'hsl(var(--primary))'
      : state.isFocused
        ? isDark
          ? '#334155'
          : '#f1f5f9'
        : 'transparent',
    color: state.isSelected
      ? 'hsl(var(--primary-foreground))'
      : state.isDisabled
        ? 'hsl(var(--muted-foreground))'
        : isDark
          ? '#e2e8f0'
          : '#1e293b',
    cursor: state.isDisabled ? 'not-allowed' : 'pointer',
    padding: '0.625rem 0.75rem',
    borderRadius: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: state.isSelected ? '500' : '400',
    opacity: state.isDisabled ? 0.5 : 1,
    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
      backgroundColor: state.isDisabled
        ? 'transparent'
        : state.isSelected
          ? 'hsl(var(--primary))'
          : isDark
            ? '#334155'
            : '#f1f5f9',
    },
    '&:active': {
      backgroundColor: state.isDisabled ? 'transparent' : 'hsl(var(--primary) / 0.8)',
      transform: state.isDisabled ? 'none' : 'scale(0.98)',
    },
  }),
  singleValue: (base, state) => ({
    ...base,
    color: state.isDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.875rem',
    padding: '0.75rem',
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
});
