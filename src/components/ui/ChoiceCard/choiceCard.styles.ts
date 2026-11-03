import { cn } from '@/lib/utils';

/** The press target: the card's own focus ring, text left-aligned as a card reads. */
export const getChoiceCardButtonClasses = (className?: string) =>
  cn(
    'rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[inactive]:cursor-not-allowed',
    className
  );

export const getChoiceCardClasses = (selected: boolean, inactive: boolean) =>
  cn(
    'h-full transition-colors',
    inactive ? 'opacity-60' : 'cursor-pointer hover:border-primary/60',
    selected && 'border-primary ring-2 ring-primary'
  );
