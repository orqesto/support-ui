import { Button } from '@/components/ui/Button';
import type { OptionsLoadError } from './filterSchema';

/**
 * In a filter's value panel, where the options would be: the list could not be read, and a
 * retry. Without it a timed-out read showed an empty panel — "no addresses" — which is false.
 */
export const OptionsLoadErrorNotice = ({
  error,
  touch = false,
}: {
  error: OptionsLoadError;
  /** The phone sheet's larger type. */
  touch?: boolean;
}) => (
  <div
    role="status"
    className={
      touch
        ? 'flex flex-wrap gap-2 items-center px-4 py-4 text-[13px] text-muted-foreground'
        : 'flex flex-wrap gap-2 items-center px-2 py-3 text-[11.5px] text-muted-foreground'
    }
  >
    <span>{error.message}</span>
    <Button variant="outline" size="sm" onClick={error.onRetry}>
      Retry
    </Button>
  </div>
);
