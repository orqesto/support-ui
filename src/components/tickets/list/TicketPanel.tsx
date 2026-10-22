import { ChevronDown, ChevronUp, Link2, Maximize2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

type TicketPanelProps = {
  ticketId: number;
  /** Neighbours in the current list; null at either end. */
  prevId: number | null;
  nextId: number | null;
  onGo: (ticketId: number) => void;
  onClose: () => void;
  onFullPage: () => void;
  onCopyLink: () => void;
  children: ReactNode;
};

const IconAction = ({
  label,
  kbd,
  onClick,
  disabled,
  children,
}: {
  label: string;
  kbd?: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <Tooltip content={kbd ? `${label} (${kbd})` : label}>
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="p-0 w-8 h-8"
    >
      {children}
    </Button>
  </Tooltip>
);

/**
 * The chrome around an open ticket in the side sheet or the split pane: close, step to the
 * previous / next ticket of the list, copy its link, open it as a full page.
 */
export const TicketPanel = ({
  ticketId,
  prevId,
  nextId,
  onGo,
  onClose,
  onFullPage,
  onCopyLink,
  children,
}: TicketPanelProps) => (
  <div role="region" aria-label={`Ticket #${ticketId}`} className="flex flex-col h-full min-h-0">
    <div className="flex gap-1 items-center px-2 h-[46px] border-b shrink-0 border-border bg-card text-[12.5px] text-muted-foreground">
      <IconAction label="Close" kbd="Esc" onClick={onClose}>
        <X className="w-4 h-4" />
      </IconAction>
      <IconAction
        label="Previous ticket"
        kbd="K"
        onClick={() => prevId !== null && onGo(prevId)}
        disabled={prevId === null}
      >
        <ChevronUp className="w-4 h-4" />
      </IconAction>
      <IconAction
        label="Next ticket"
        kbd="J"
        onClick={() => nextId !== null && onGo(nextId)}
        disabled={nextId === null}
      >
        <ChevronDown className="w-4 h-4" />
      </IconAction>
      <span className="font-mono">#{ticketId}</span>
      <span className="flex-1" />
      <IconAction label="Copy link" onClick={onCopyLink}>
        <Link2 className="w-4 h-4" />
      </IconAction>
      <IconAction label="Open full page" onClick={onFullPage}>
        <Maximize2 className="w-4 h-4" />
      </IconAction>
    </div>
    <div className="overflow-y-auto flex-1 p-5 min-h-0">{children}</div>
  </div>
);
