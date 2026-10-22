import type { ReactNode } from 'react';
import { Badge } from './Badge';
import { Spinner } from './Spinner';

type LoadingOverlayProps = {
  /** Shade the content and show the label. False renders the content untouched. */
  active: boolean;
  /** What is happening, in a few words — "Searching…". Also the accessible status. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Content that stays on screen, shaded, while a newer answer for it is loading.
 *
 * For a reload where the old content is still worth seeing (the layout does not jump) but is
 * no longer the answer: rows from the previous search must not read as results for the new
 * one. A first load with nothing to show yet wants a skeleton instead.
 */
export const LoadingOverlay = ({
  active,
  label,
  children,
  className = '',
}: LoadingOverlayProps) => (
  <div className={`relative ${className}`} aria-busy={active}>
    {children}
    {active && (
      <div
        role="status"
        className="absolute inset-0 z-10 flex items-start justify-center rounded-md bg-background/60 pt-16 backdrop-blur-[1px]"
      >
        <Badge
          variant="secondary"
          size="lg"
          className="sticky top-24 gap-2 shadow-sm cursor-default"
        >
          <Spinner size={14} />
          {label}
        </Badge>
      </div>
    )}
  </div>
);
