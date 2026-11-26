import type { ReactNode } from 'react';
import { FeatureUnavailable } from '@/components/common/FeatureUnavailable';
import { Spinner } from '@/components/ui/Spinner';
import { useUiFlags } from '@/hooks/useUiFlags';

/**
 * Like `FeatureGate`, but with NO staff preview: a global admin sees the unavailable state too
 * while the flag is off. For a surface the owner wants switched off for everyone. A key the
 * backend does not know reads as off. Pair with `ConsoleSection.flag`, which hides the nav entry
 * the same strict way.
 */
export const StrictFeatureGate = ({
  flag,
  title,
  children,
}: {
  flag: string;
  title?: string;
  children: ReactNode;
}) => {
  const { isSurfaceEnabled, loading } = useUiFlags();
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }
  if (!isSurfaceEnabled(flag)) return <FeatureUnavailable title={title} />;
  return <>{children}</>;
};
