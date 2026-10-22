import { cn } from '@/lib/utils';
import { kbdVariants } from './kbd.styles';
import type { KbdProps } from './kbd.types';

/** A keyboard key as a small chip — in a tooltip ("Close [Esc]") or in help text. */
export const Kbd = ({ children, tone, className }: KbdProps) => (
  <kbd className={cn(kbdVariants({ tone }), className)}>{children}</kbd>
);
