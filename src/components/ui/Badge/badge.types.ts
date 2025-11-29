import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from './badge.styles';
import type { HTMLAttributes } from 'react';

export type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;
