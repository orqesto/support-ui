import type { ReactNode } from 'react';
import { LoadingRing } from './LoadingRing';

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
        aria-label={label}
        className="absolute inset-0 z-10 rounded-md bg-background/60 backdrop-blur-[1px]"
      >
        {/* The app's big loader, centred where the agent is looking: sticky, so on a long
            list it stays in view while the list scrolls under it (owner, 2026-10-22). */}
        <div className="sticky top-[30vh] flex justify-center py-12">
          <LoadingRing label={label} />
        </div>
      </div>
    )}
  </div>
);
