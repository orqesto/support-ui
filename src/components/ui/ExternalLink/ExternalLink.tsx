import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getExternalLinkClasses, getExternalLinkIconClasses } from './externalLink.styles';
import type { ExternalLinkProps } from './externalLink.types';

export const ExternalLink = ({
  href,
  children,
  className,
  variant = 'default',
  size = 'md',
  showIcon = true,
  onClick,
  ...props
}: ExternalLinkProps) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(getExternalLinkClasses(variant, size), className)}
      onClick={handleClick}
      {...props}
    >
      {showIcon && <ExternalLinkIcon className={getExternalLinkIconClasses(size)} />}
      {children}
    </a>
  );
};
