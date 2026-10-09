import { channelName, getInitials, priorityLabel } from './messageDetailConstants';
import { formatDate } from '@/lib/utils';
import { parseSender } from '@/lib/messageHelpers';
import type { Message, MessageEvent } from '@/types';

/**
 * The CUSTOMER tab's own blocks, extracted so `MessagePanelTabs` stays inside its 650-line cap
 * rather than the cap deciding what the tab may contain.
 *
 * v4 order: sender, conversation facts, then the contact profile (rendered by the host).
 * Connected-system lookups have their own tab (LookupsTabPanel, 2026-10-09). ⛔ The thread's tickets and merges are NOT here any more: v4 moves them to the
 * header's Related chip and popover (MessageDetailHeader), so they are not shown twice.
 */

/** v4 `.k-sender`: avatar initials, the bold name, then the address and (non-email) channel. */
export const CustomerSenderBlock = ({ message }: { message: Message }) => {
  const { name, address } = parseSender(message.sender);
  const second = [
    name ? address : null,
    message.channel !== 'email' ? channelName(message.channel) : null,
  ].filter((part): part is string => !!part);
  return (
    <div className="flex gap-2 items-center mb-2.5" data-testid="customer-sender">
      <div className="w-[30px] h-[30px] rounded-full bg-sunken border border-border flex items-center justify-center font-display text-[10.5px] font-semibold text-muted-foreground flex-shrink-0">
        {getInitials(message.sender)}
      </div>
      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold text-foreground truncate">
          {name ?? address}
        </b>
        {second.length > 0 && (
          <span className="block text-[11px] text-faint-foreground truncate">
            {second.join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * v4 `.kv`: the conversation's facts, small sentence-case labels and plain values. Same fields as
 * staging: Channel, Received, Thread, and Assigned / Priority when set.
 */
export const ConversationFacts = ({
  message,
  sortedThread,
}: {
  message: Message;
  sortedThread: MessageEvent[];
}) => {
  const rows: { label: string; value: string }[] = [
    {
      label: 'Channel',
      value: channelName(message.channel),
    },
    {
      label: 'Received',
      value: formatDate(
        (message.metadata as { receivedAt?: string } | null)?.receivedAt ?? message.createdAt
      ),
    },
    {
      label: 'Thread',
      // No events loaded yet still means the one message this thread was opened from.
      value: sortedThread.length > 1 ? `${sortedThread.length} messages` : '1 message',
    },
    ...(message.assigneeName ? [{ label: 'Assigned', value: message.assigneeName }] : []),
    ...(message.priority
      ? [{ label: 'Priority', value: priorityLabel(String(message.priority)) }]
      : []),
  ];
  return (
    <dl className="grid grid-cols-[78px_1fr] gap-x-[9px] gap-y-1.5 text-[12.5px] mb-3">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="self-center text-[11px] text-faint-foreground">{row.label}</dt>
          <dd className="self-center truncate text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
};
