import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ResendTarget } from './deliveryState';

/**
 * Over the composer while it holds an undelivered reply put back for a resend: the next Send
 * replaces that reply (one bubble on the thread). Cancel keeps the text but sends it as a new reply.
 */
export function ResendNotice({
  target,
  setTarget,
}: {
  target: ResendTarget | null;
  setTarget: (next: ResendTarget | null) => void;
}) {
  if (!target) return null;
  const { uncertain } = target;
  return (
    <Alert variant={uncertain ? 'warning' : 'info'} className="mx-3 mb-2">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="flex-1 min-w-[200px]">
          {uncertain
            ? 'We could not confirm that this reply reached the customer — if you resend it, they may get it twice. Edit it if needed, then send. Attach any files again.'
            : 'Resending a reply that was not delivered. Edit it if needed, then send. Attach any files again.'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
          Not a resend
        </Button>
      </div>
    </Alert>
  );
}
