import { Construction } from 'lucide-react';
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
  const { isSurfaceVisibleToMe, isPreviewing, loading } = useUiFlags();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  if (!isSurfaceVisibleToMe(flag)) return <FeatureUnavailable title={title} />;

  return (
    <>
      {isPreviewing(flag) && (
        <div
          role="note"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Construction className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* Says who CANNOT see it, not just that it is unfinished — the mistake this
              prevents is staff demoing a hidden page believing a customer sees the same. */}
          <span>
            Unfinished — visible to Odly staff only. Customers see an “isn’t available yet”
            page here.
          </span>
        </div>
      )}
      {children}
    </>
  );
};
