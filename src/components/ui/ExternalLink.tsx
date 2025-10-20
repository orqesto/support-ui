import { ExternalLink as ExternalLinkIcon } from 'lucide-react';

type ExternalLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export const ExternalLink = ({ 
  href, 
  children, 
  className = '', 
  showIcon = true,
  onClick 
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
      className={`inline-flex gap-1 items-center text-sm text-blue-600 hover:underline ${className}`}
      onClick={handleClick}
    >
      {showIcon && <ExternalLinkIcon className="w-4 h-4" />}
      {children}
    </a>
  );
};
