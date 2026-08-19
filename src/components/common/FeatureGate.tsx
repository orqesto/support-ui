import type { ReactNode } from 'react';
import { FeatureUnavailable } from '@/components/common/FeatureUnavailable';
import { Spinner } from '@/components/ui/Spinner';
import { useUiFlags } from '@/hooks/useUiFlags';

type FeatureGateProps = {
  /** A `ui.` flag key, e.g. `ui.billing_intelligence`. */
  flag: string;
  /** Surface name for the unavailable state, e.g. "Billing Intelligence". */
  title?: string;
  children: ReactNode;
};

/**
 * Renders `children` only when the surface is switched on, and the under-construction
 * state when it is not.
 *
 * Waits for the flag request to settle before deciding. Rendering the unavailable state
 * while loading would flash "not available yet" at every user of a perfectly working
 * page on each navigation, which is worse than a brief spinner. The trade only runs one
 * way: we never flash the real page before knowing, because the flags start empty and
 * empty means off.
 *
 * Pair with hiding the navigation entry — this catches the direct hits that hiding
 * cannot: bookmarks, shared links, restored tabs, and the browser back button.
 */
export const FeatureGate = ({ flag, title, children }: FeatureGateProps) => {
  const { isSurfaceEnabled, loading } = useUiFlags();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  return isSurfaceEnabled(flag) ? <>{children}</> : <FeatureUnavailable title={title} />;
};
