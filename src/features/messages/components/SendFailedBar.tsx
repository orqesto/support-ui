import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LABEL } from './messageDetailConstants';

export type SendFailedBarProps = {
  /** What the agent is told — the server's own words for a 4xx, generic otherwise. */
  reason: string;
  /**
   * Resend the SAME draft. Absent when a retry cannot help: a 4xx (a closed WhatsApp window
   * refuses every retry), or a delivery failure reported after the composer was already cleared
   * (there is no draft left to resend). A Retry that can only fail again is worse than none.
   */
  onRetry?: () => void;
  retrying?: boolean;
  onDismiss: () => void;
};

/**
 * v3 ".errbar": under the header, where it is seen whatever the thread's scroll position.
 * "Send failed" names the event; the reason explains it; Retry is offered only when it can work.
 */
export function SendFailedBar({
  reason,
  onRetry,
  retrying = false,
  onDismiss,
}: SendFailedBarProps) {
  return (
    <div
      role="alert"
      className="flex-shrink-0 flex flex-wrap items-center gap-[9px] px-3.5 py-2 bg-destructive-muted border-b border-destructive-line text-destructive"
    >
      <span className={LABEL}>Send failed</span>
      <span className="flex-1 min-w-[170px] text-[12.5px] text-muted-foreground">{reason}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="h-[27px] px-[11px] rounded-[7px] border border-border bg-card text-foreground text-[12px] hover:border-border-strong"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="w-[30px] h-[30px] rounded-[7px] text-destructive/70 hover:text-destructive hover:bg-transparent"
      >
        <X className="w-[15px] h-[15px]" />
      </Button>
    </div>
  );
}
