import type { VariantProps } from 'class-variance-authority';
import type { externalLinkVariants } from './externalLink.styles';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof externalLinkVariants> & {
    href: string;
    children: ReactNode;
    showIcon?: boolean;
  };
