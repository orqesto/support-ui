import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getExternalLinkClasses, getExternalLinkIconClasses } from './externalLink.styles';
import type { ExternalLinkProps } from './externalLink.types';

function sanitizeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

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
  const safeHref = sanitizeExternalUrl(href);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    onClick?.(event);
  };

  if (!safeHref) return null;

  return (
    <a
      href={safeHref}
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
