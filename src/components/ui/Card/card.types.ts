import type { VariantProps } from 'class-variance-authority';
import type {
  cardVariants,
  cardHeaderVariants,
  cardContentVariants,
  cardFooterVariants,
} from './card.styles';
import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export type CardHeaderProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardHeaderVariants>;

export type CardContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardContentVariants>;

export type CardFooterProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardFooterVariants>;

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;
