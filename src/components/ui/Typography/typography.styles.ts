import { cva } from 'class-variance-authority';

export const typographyVariants = cva('', {
  variants: {
    variant: {
      h1: 'text-2xl font-bold',
      h2: 'text-xl font-semibold',
      h3: 'text-lg font-semibold',
      h4: 'text-base font-semibold',
      h5: 'text-sm font-medium',
      h6: 'text-xs font-medium',
      body1: 'text-base',
      body2: 'text-sm',
      body3: 'text-xs',
      caption: 'text-xs',
      label: 'text-sm font-medium',
    },
    color: {
      primary: 'text-primary',
      secondary: 'text-secondary',
      foreground: 'text-foreground',
      muted: 'text-muted-foreground',
      destructive: 'text-destructive',
      success: 'text-green-600 dark:text-green-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      info: 'text-blue-600 dark:text-blue-400',
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
