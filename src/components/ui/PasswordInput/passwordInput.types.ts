import type { InputProps } from '@/components/ui/Input/input.types';

export type PasswordInputProps = Omit<InputProps, 'type'> & {
  /** Accessible name for the toggle. Defaults to "password" → "Show password". */
  revealLabel?: string;
};
