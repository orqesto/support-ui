import type React from 'react';
import { BellRing, Target } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { HoldDialog } from '@/components/shared/HoldDialog';
import { getInitials } from '@/lib/initials';
import { formatDay } from '@/lib/utils';
import type { Message, TicketPriority, ThreadStatus } from '@/types';
import type { computeSlaInfo, WorkflowStatus } from '../inboxCardHelpers';
import {
  isFloodReview,
  NEEDS_REVIEW_REASON_DETAILS,
  NEEDS_REVIEW_REASON_LABELS,
} from '../aiFlagCopy';
import {
  CHIP_SENTENCE,
  HEADER_PRIORITY_OPTIONS,
  fmtMin,
  type InboxBadge,
} from '../messageDetailConstants';
import { ReceivedAtAddresses } from '../ReceivedAtAddresses';
import type { buildStatusDisplayOptions } from './headerDerived';
import { PHONE_CHIP } from './headerStyles';

type HeaderChipRowProps = {
  message: Message;
  compact: boolean;
  isPhone: boolean;
  senderName: string;
  senderEmail: string;
  setProfileEmail: (email: string | null) => void;
  isFiltered: boolean;
  currentWorkflowStatus: WorkflowStatus;
  statusDisplayOptions: ReturnType<typeof buildStatusDisplayOptions>;
  workflowToBeStatus: Partial<Record<WorkflowStatus, ThreadStatus>>;
  updatingStatus: boolean;
  holdOpen: boolean;
  setHoldOpen: (open: boolean) => void;
  handleSetStatus: (status: ThreadStatus, hold?: { reason: string; until: Date }) => Promise<void>;
  slaInfo: ReturnType<typeof computeSlaInfo>;
  /** The resolution clock's chip (backend 0238); null when the thread has none. */
  resolutionInfo?: ReturnType<typeof computeSlaInfo>;
  updatingPriority: boolean;
  handleSetPriority: (priority: TicketPriority) => Promise<void>;
  inboxBadge: InboxBadge | null;
  /** v4 Related: the ticket and merged chips, between priority and the inbox badge. */
  related: React.ReactNode;
};

type SlaClock = NonNullable<ReturnType<typeof computeSlaInfo>>;

/** A running SLA clock: "<label> elapsed/target" and a bar — the reply clock and the Resolve clock. */
function SlaClockChip({ label, info, testId }: { label: string; info: SlaClock; testId: string }) {
  return (
    <div className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${info.colorClasses}`} data-testid={testId}>
      <span>{label}</span>
      <span className="tabular-nums">
        {fmtMin(info.elapsed)}/{fmtMin(info.target)}
      </span>
      <div className="overflow-hidden w-10 h-1 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${info.barColor}`}
          style={{ width: `${Math.min(100, (info.elapsed / info.target) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Action chip row: the sender line, status, hold, SLA, priority, Related chips and badges. */
export function HeaderChipRow({
  message,
  compact,
  isPhone,
  senderName,
  senderEmail,
  setProfileEmail,
  isFiltered,
  currentWorkflowStatus,
  statusDisplayOptions,
  workflowToBeStatus,
  updatingStatus,
  holdOpen,
  setHoldOpen,
  handleSetStatus,
  slaInfo,
  resolutionInfo = null,
  updatingPriority,
  handleSetPriority,
  inboxBadge,
  related,
}: HeaderChipRowProps) {
  return (
    <div
      data-testid="header-chips"
      className={`${compact ? 'hidden' : 'flex'} items-center gap-[7px] flex-wrap px-3.5 pb-2.5 overflow-visible max-sm:gap-1.5 max-sm:px-4 max-sm:pt-2.5 max-sm:pb-0 max-sm:bg-card`}
    >
      {/* Identity: who wrote + which of OUR addresses they wrote to. A full-width group, so the
          state chips and the decisions always start their own line beneath it. The received-at
          line is compact (first address + "+N"); the full To/Cc/Bcc is on hover AND focus. */}
      {/* Phones show the sender in the Details card above instead (M2). */}
      {!isPhone && (
        <div className="flex basis-full flex-wrap items-center gap-x-[9px] gap-y-0.5 min-w-0">
          <div className="flex items-center gap-[7px] min-w-0 overflow-hidden">
            <div className="w-[21px] h-[21px] rounded-full bg-muted border border-border grid place-items-center font-display text-[9px] font-semibold text-muted-foreground flex-none">
              {getInitials(message.sender)}
            </div>
            {senderEmail.includes('@') ? (
              <button
                type="button"
                onClick={() => setProfileEmail(senderEmail)}
                className="group flex items-baseline gap-[7px] min-w-0 text-left"
                title="View contact profile"
              >
                {senderName && (
                  <b className="font-medium text-[12.5px] whitespace-nowrap text-foreground group-hover:text-primary group-hover:underline">
                    {senderName}
                  </b>
                )}
                <span
                  className={`truncate ${senderName ? 'text-[11.5px] text-muted-foreground' : 'text-[12.5px] font-medium text-foreground group-hover:text-primary group-hover:underline'}`}
                >
                  {senderEmail}
                </span>
              </button>
            ) : (
              <span className="text-[12.5px] font-medium truncate text-foreground">
                {message.sender}
              </span>
            )}
          </div>
          <ReceivedAtAddresses
            recipients={message.recipients}
            variant="card"
            prefix="received at"
            focusable
          />
        </div>
      )}
      {/* ⛔ No work status on a spam thread. `filtered` derives to none, so the chip fell back to
          "Open" on every spam thread, confirmed ones included, and offered Resolve, which would
          let new mail reopen it. The Spam badge says what it is; the strip offers the way back. */}
      {!isFiltered && (
        <Select
          aria-label="Status"
          variant="chip"
          chipCase="sentence"
          value={currentWorkflowStatus}
          options={statusDisplayOptions}
          mobileSheet
          onChange={(val) => {
            const beStatus = workflowToBeStatus[val as WorkflowStatus];
            if (beStatus === 'pending') setHoldOpen(true);
            else if (beStatus) void handleSetStatus(beStatus);
          }}
          isDisabled={updatingStatus}
        />
      )}
      {!isFiltered && message.parkedAt && message.parkedUntil && (
        <Tooltip
          content={message.parkedReason ? `On hold: ${message.parkedReason}` : 'On hold'}
          size="sm"
        >
          <span className="text-xs text-muted-foreground" data-testid="hold-until">
            until {formatDay(message.parkedUntil)}
          </span>
        </Tooltip>
      )}
      <HoldDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title="Put this thread on hold"
        description="It leaves the active list until the recheck date. Say why, so whoever picks it up knows what it is waiting for."
        confirmText="Put on hold"
        busy={updatingStatus}
        onConfirm={(hold) => void handleSetStatus('pending', hold)}
      />
      {slaInfo?.record && (
        <Tooltip
          content={`First reply took ${fmtMin(slaInfo.elapsed)} against a ${fmtMin(slaInfo.target)} target`}
          size="sm"
        >
          <div
            className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${slaInfo.colorClasses}`}
            data-testid="sla-record"
          >
            <span>SLA</span>
            <span className="tabular-nums">
              {fmtMin(slaInfo.elapsed)}/{fmtMin(slaInfo.target)}
            </span>
            <span>{slaInfo.breached ? 'missed' : 'met'}</span>
          </div>
        </Tooltip>
      )}
      {slaInfo && !slaInfo.record && <SlaClockChip label="SLA" info={slaInfo} testId="sla-clock" />}
      {resolutionInfo && (
        <SlaClockChip label="Resolve" info={resolutionInfo} testId="sla-resolution-clock" />
      )}
      {message.priority && (
        <Select
          aria-label="Priority"
          variant="chip"
          chipCase="sentence"
          value={message.priority}
          options={HEADER_PRIORITY_OPTIONS}
          mobileSheet
          onChange={(val) => void handleSetPriority(val as TicketPriority)}
          isDisabled={updatingPriority}
        />
      )}
      {related}
      {inboxBadge && (
        // Sentence case like every other chip in the row (v4), spelt as the More menu's
        // "Reanalyse" / "Reanalysing…" so one action is not named two ways.
        <span className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${inboxBadge.cls}`}>
          {inboxBadge.icon}
          {inboxBadge.label}
        </span>
      )}
      {/* A flood hold (owner 2026-11-13): the bot stopped answering this chat — say why here,
          not only on the list's tooltip. Any other review reason, and an older backend that
          never sends `flood`, show nothing new. */}
      {isFloodReview(message) && (
        <Tooltip content={NEEDS_REVIEW_REASON_DETAILS.flood} size="sm">
          <Badge
            variant="warning"
            className={`inline-flex gap-1 items-center ${PHONE_CHIP}`}
            data-testid="header-flood-review"
          >
            <BellRing className="w-2.5 h-2.5" />
            {NEEDS_REVIEW_REASON_LABELS.flood}
          </Badge>
        </Tooltip>
      )}
      {message.isLead && (
        <span
          className={`text-success bg-success-muted border-success-line ${CHIP_SENTENCE} ${PHONE_CHIP}`}
        >
          <Target className="w-2.5 h-2.5" />
          Lead
        </span>
      )}
    </div>
  );
}
