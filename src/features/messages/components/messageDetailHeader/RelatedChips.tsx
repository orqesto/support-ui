import type React from 'react';
import type { RefObject } from 'react';
import { Ticket as TicketIcon, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { ManualMerge } from '@/features/messages/services/conversationMerge.service';
import type { Message } from '@/types';
import { MergedSection } from '../MergeThreads';
import { RelatedPopover, TicketsSection, type HeaderTickets } from '../RelatedPopover';
import type { MergeChange } from '../useThreadMergeContext';
import type { TicketChange } from '../useThreadTicketsState';
import { REL_CHIP } from './headerStyles';

type RelatedKind = 'tickets' | 'merges';

type TicketChipProps = {
  message: Message;
  tickets: HeaderTickets;
  ticketChipRef: RefObject<HTMLButtonElement>;
  relatedOpen: RelatedKind | null;
  setRelatedOpen: React.Dispatch<React.SetStateAction<RelatedKind | null>>;
  closeRelated: (kind: RelatedKind) => void;
  closeTicketsPopover: () => void;
  owedSentence: string | null;
  ticketChipMeaning: string;
  ticketChipName: string;
  ticketChipText: string;
  linkedTicketId: number | null;
  /**
   * The headline ticket's `TicketRef`, built by the header (it already reaches the tickets
   * feature's shell; this file stays off it).
   */
  headlineTicketRef: React.ReactNode;
  totalTicketCount: number;
  canManageTickets: boolean;
  canCreateTickets: boolean;
  loadTickets: () => void;
  setAddToTicketOpen: (open: boolean) => void;
  createTicket: () => void;
  applyTicketChange: (change: TicketChange) => void;
  onRefresh?: () => void;
};

/*
  v4 Related: the ticket chip — the first ticket's #id and "+N" for the rest. Opens the popover
  listing a card per ticket. Hidden when the thread is on no ticket.
*/
export function TicketChip({
  message,
  tickets,
  ticketChipRef,
  relatedOpen,
  setRelatedOpen,
  closeRelated,
  closeTicketsPopover,
  owedSentence,
  ticketChipMeaning,
  ticketChipName,
  ticketChipText,
  linkedTicketId,
  headlineTicketRef,
  totalTicketCount,
  canManageTickets,
  canCreateTickets,
  loadTickets,
  setAddToTicketOpen,
  createTicket,
  applyTicketChange,
  onRefresh,
}: TicketChipProps) {
  return (
    <div className="relative">
      <Tooltip content={owedSentence ?? ticketChipMeaning} side="bottom" size="sm" quietFocus>
        <Button
          ref={ticketChipRef}
          type="button"
          variant="ghost"
          data-related-chip
          data-testid="ticket-chip"
          aria-haspopup="dialog"
          aria-expanded={relatedOpen === 'tickets'}
          aria-label={ticketChipName}
          onClick={() =>
            relatedOpen === 'tickets' ? closeRelated('tickets') : setRelatedOpen('tickets')
          }
          className={`${REL_CHIP} ${owedSentence ? 'border-warning-line' : ''} ${relatedOpen === 'tickets' ? 'border-border-strong text-foreground' : ''}`}
        >
          <TicketIcon className="w-3 h-3" aria-hidden />
          {linkedTicketId === null ? <span>{ticketChipText}</span> : headlineTicketRef}
          {linkedTicketId !== null && totalTicketCount > 1 && <span>+{totalTicketCount - 1}</span>}
          {owedSentence && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-warning"
              data-testid="owes-reply-dot"
              aria-hidden
            />
          )}
        </Button>
      </Tooltip>
      {relatedOpen === 'tickets' && (
        <RelatedPopover label="Tickets" onClose={closeTicketsPopover}>
          <TicketsSection
            message={message}
            tickets={tickets}
            canManage={canManageTickets}
            canCreate={canCreateTickets}
            onRetry={loadTickets}
            onAddToTicket={() => {
              closeRelated('tickets');
              setAddToTicketOpen(true);
            }}
            onCreateTicket={createTicket}
            // Shown at once (the service also announces it, and the chip re-reads); the
            // board's card chip comes from the thread list, as after an add.
            onRemoved={({ ticketId, conversationId }) => {
              applyTicketChange({ conversationId, removed: ticketId });
              onRefresh?.();
            }}
          />
        </RelatedPopover>
      )}
    </div>
  );
}

type MergedChipProps = {
  message: Message;
  merges: ManualMerge[];
  mergedChipRef: RefObject<HTMLButtonElement>;
  relatedOpen: RelatedKind | null;
  setRelatedOpen: React.Dispatch<React.SetStateAction<RelatedKind | null>>;
  closeRelated: (kind: RelatedKind) => void;
  closeMergesPopover: () => void;
  canManageTickets: boolean;
  setMergePickerOpen: (open: boolean) => void;
  afterMergeChange: (change: MergeChange) => void;
};

/** v4 Related: "Merged · n" when other threads were merged into this one. */
export function MergedChip({
  message,
  merges,
  mergedChipRef,
  relatedOpen,
  setRelatedOpen,
  closeRelated,
  closeMergesPopover,
  canManageTickets,
  setMergePickerOpen,
  afterMergeChange,
}: MergedChipProps) {
  return (
    <div className="relative">
      <Button
        ref={mergedChipRef}
        type="button"
        variant="ghost"
        data-related-chip
        data-testid="merged-chip"
        aria-haspopup="dialog"
        aria-expanded={relatedOpen === 'merges'}
        // Label in name: the visible "Merged · 1" first.
        aria-label={`Merged · ${merges.length} — ${merges.length} ${merges.length === 1 ? 'thread' : 'threads'} merged in`}
        onClick={() =>
          relatedOpen === 'merges' ? closeRelated('merges') : setRelatedOpen('merges')
        }
        className={`${REL_CHIP} ${relatedOpen === 'merges' ? 'border-border-strong text-foreground' : ''}`}
      >
        <GitMerge className="w-3 h-3" aria-hidden />
        <span>Merged · {merges.length}</span>
      </Button>
      {relatedOpen === 'merges' && (
        <RelatedPopover label="Same conversation" onClose={closeMergesPopover}>
          <MergedSection
            message={message}
            merges={merges}
            canManage={canManageTickets}
            onMerge={() => {
              closeRelated('merges');
              setMergePickerOpen(true);
            }}
            onUnmerged={(unmergedId) => afterMergeChange({ unmerged: unmergedId })}
          />
        </RelatedPopover>
      )}
    </div>
  );
}
