import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full font-display font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground cursor-pointer',
        success: 'bg-success-muted text-success cursor-pointer',
        warning: 'bg-warning-muted text-warning cursor-pointer',
        danger: 'bg-destructive-muted text-destructive cursor-pointer',
        secondary: 'bg-secondary text-secondary-foreground cursor-pointer',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export type BadgeVariantsType = VariantProps<typeof badgeVariants>;

export const getBadgeClasses = (
  variant?: BadgeVariantsType['variant'],
  size?: BadgeVariantsType['size']
) => badgeVariants({ variant, size });
