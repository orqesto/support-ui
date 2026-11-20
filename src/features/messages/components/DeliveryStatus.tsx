import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isUndelivered, type DeliveryState } from './deliveryState';

const LINE = 'font-display text-[10px] tracking-[0.08em] uppercase';

const WORDS: Record<DeliveryState, string> = {
  sending: 'Sending…',
  failed: 'Not delivered',
  uncertain: 'May not have been delivered',
  sent: '✓ Sent',
};

/**
 * The line under an outgoing bubble: what became of the send (deliveryState.ts). Read from the
 * event itself, so it survives a reload and every agent on the thread sees the same.
 *
 * `onResend` is offered only on a reply that did not (or may not) go out. For an uncertain one
 * the agent is warned first: the customer may already have it and would get it twice.
 */
export function DeliveryStatus({
  state,
  onResend,
  resending = false,
}: {
  state: DeliveryState;
  onResend?: () => void;
  resending?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const undelivered = isUndelivered(state);
  const resend = undelivered ? onResend : undefined;
  return (
    <span
      className={`flex items-center gap-2 ${LINE} ${undelivered ? 'text-destructive' : 'text-muted-foreground'}`}
      role={undelivered ? 'status' : undefined}
    >
      {WORDS[state]}
      {resend && (
        <Button
          variant="ghost"
          size="sm"
          disabled={resending}
          onClick={() => (state === 'uncertain' ? setConfirmOpen(true) : resend())}
          className={`h-auto p-0 ${LINE} font-semibold text-destructive hover:bg-transparent hover:underline`}
        >
          {resending ? 'Resending…' : 'Resend'}
        </Button>
      )}
      {resend && state === 'uncertain' && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => {
            setConfirmOpen(false);
            resend();
          }}
          variant="warning"
          title="Resend this reply?"
          description="We could not confirm that this reply reached the customer. If you resend it, they may get it twice."
          confirmText="Resend anyway"
          cancelText="Cancel"
        />
      )}
    </span>
  );
}
