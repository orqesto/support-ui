import { cva } from 'class-variance-authority';

export const typographyVariants = cva('', {
  variants: {
    variant: {
      h1: 'font-display text-2xl font-bold',
      h2: 'font-display text-xl font-semibold',
      h3: 'font-display text-lg font-semibold',
      h4: 'font-display text-base font-semibold',
      h5: 'font-display text-sm font-medium',
      h6: 'font-display text-xs font-medium',
      body1: 'text-base',
      body2: 'text-sm',
      body3: 'text-xs',
      caption: 'text-xs',
      label: 'font-display text-sm font-medium',
    },
    color: {
      primary: 'text-primary',
      secondary: 'text-secondary',
      foreground: 'text-foreground',
      muted: 'text-muted-foreground',
      destructive: 'text-destructive',
      success: 'text-success',
      warning: 'text-warning',
      info: 'text-muted-foreground',
    },
    weight: {
      light: 'font-light',
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    truncate: {
      true: 'truncate',
      false: '',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
    },
  },
  defaultVariants: {
    variant: 'body1',
    color: 'foreground',
    weight: 'normal',
    truncate: false,
    align: 'left',
  },
});
