import { useState } from 'react';
import { Paperclip, User } from 'lucide-react';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Button } from '@/components/ui/Button';
import { relayedFromLabel } from '@/lib/relayedFrom';
import { formatDate, formatWhen } from '@/lib/utils';
import type { MessageEvent } from '@/types';
import { useMessageHtml } from '@/hooks/useMessageHtml';
import { ThreadBubble } from './ThreadBubble';
import { getInitials } from './messageDetailConstants';
import type { Attachment } from './MessageAttachments';
import { ReceivedAtAddresses } from './ReceivedAtAddresses';

type Props = {
  msg: MessageEvent;
  attachments?: Attachment[];
  onOpenAttachment?: (id: number) => void;
};

export function ThreadMessageItem({
  msg,
  attachments = [],
  onOpenAttachment,
}: Props) {
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);

  /**
   * The sender's original markup, so an order confirmation renders as the table it was
   * written as instead of the `| Discount: | -16.50 |` text alternative, and its tracking
   * link is clickable.
   *
   * ⛔ Skipped when the agent has asked for a TRANSLATION: that comes back as plain text, and
   * quietly showing the untranslated original instead would be worse than an ugly table.
   * Also skipped for outbound, where the console already holds what we sent.
   */
  const wantsHtml = msg.type === 'inbound' && translatedContent === null;
  const { data: originalHtml } = useMessageHtml(msg.id, wantsHtml);

  const isAgent =
    msg.type !== 'inbound' ||
    (msg.authorEmail ?? '').toLowerCase() === 'bot' ||
    (msg.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;

  const msgTime = isAgent
    ? (msg.sentAt ??
      (msg.metadata as { receivedAt?: string } | null)?.receivedAt ??
      msg.createdAt)
    : ((msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt);

  // Prefer the person when the BE could resolve one: initials of a shared mailbox
  // are identical for every agent on it, which is the same problem the header below
  // fixes. `authorName` is null for AI/automated and imported replies — those keep
  // falling back to the mailbox.
  // Normalise once: the BE already NULLIFs an empty name, and treating a blank as
  // absent here means a stray whitespace-only value can never render as a nameless
  // author or a '?' avatar.
  const authorName = msg.authorName?.trim() ? msg.authorName.trim() : null;
  const initials = getInitials(authorName ?? msg.authorEmail ?? '');

  /**
   * Who actually wrote this, when the envelope names a machine.
   *
   * A website contact form mails the shop from its own address — `mailer@shopify.com`,
   * or the shop's own mailbox — and puts the customer only in the body. The BE recovers
   * that person and stamps `relayedFrom` on the EVENT, per message, because one thread
   * can hold submissions from several different people.
   *
   * ⛔ `authorEmail` is NOT overwritten with the customer, so both facts are shown: who
   * wrote it, and what it came through. Guarded on the two being DIFFERENT — the history
   * repair also stamps this key on rows it recovered from the envelope itself, and those
   * would otherwise render as "someone · via someone".
   */
  const relayedFrom = relayedFromLabel(msg);
  if (isAgent) {
    return (
      <div className="flex flex-row-reverse gap-2">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[9px] font-semibold text-primary-foreground flex-shrink-0 mt-1">
          {initials}
        </div>
        <div className="flex flex-col items-end max-w-[88%]">
          <div className="flex justify-between gap-2 w-full font-mono text-[9px] text-muted-foreground mb-0.5">
            {/* Who sent this, then what the customer saw it come from. They are
                different facts: `authorEmail` is the shared mailbox, identical on
                every agent's reply, so on its own the thread reads as though the
                mailbox answered itself. Without `authorName` — AI and automated
                replies, and mail imported from the mailbox rather than sent here —
                this stays exactly as it was rather than guessing at a person. */}
            <span className="truncate" title={msg.authorUserEmail ?? undefined}>
              {authorName ? (
                <>
                  <span className="font-semibold text-foreground/75">{authorName}</span>
                  {msg.authorEmail ? <span> · via {msg.authorEmail}</span> : null}
                </>
              ) : (
                (msg.authorEmail ?? 'Support')
              )}
            </span>
            <span className="whitespace-nowrap shrink-0" title={formatDate(msgTime)}>
              {formatWhen(msgTime)}
            </span>
          </div>
          {/* Who this particular reply went to. Per-message, not per-thread: a
              reply can be addressed differently from the message that opened the
              conversation. This is also the ONLY place a bcc is ever visible —
              it cannot be recovered from the mail itself, so if the shared inbox
              doesn't show it here, nobody can answer "who else got this". */}
          <ReceivedAtAddresses recipients={msg.recipients} variant="detail" className="mb-0.5" />
          <div className="rounded-lg px-3 py-2 bg-primary text-primary-foreground text-[12px] leading-relaxed">
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0 break-words">
                <ThreadBubble
                  content={translatedContent ?? msg.content}
                  isAgent={true}
                  html={translatedContent === null ? originalHtml : null}
                  eventId={msg.id}
                />
              </div>
              <div className="flex-shrink-0 mt-0.5">
                <TranslateButton
                  messageId={msg.id}
                  onTranslated={(content) => setTranslatedContent(content)}
                  onCleared={() => setTranslatedContent(null)}
                  buttonClassName="inline-flex items-center justify-center w-5 h-5 rounded transition-colors text-primary-foreground/40 hover:text-primary-foreground"
                  spinnerClassName="text-primary-foreground/70"
                  clearClassName="inline-flex items-center justify-center w-4 h-4 rounded transition-colors text-primary-foreground/50 hover:text-primary-foreground flex-shrink-0"
                />
              </div>
            </div>
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {attachments.map((att) => (
                <Button
                  key={att.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenAttachment?.(att.id)}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 h-auto rounded bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 hover:bg-primary-foreground/25 transition-colors"
                >
                  <Paperclip className="w-2.5 h-2.5" />
                  {att.originalFilename}
                </Button>
              ))}
            </div>
          )}
          {msg.type !== 'inbound' && (
            <span className="font-mono text-[9px] text-foreground/55 mt-0.5">✓ Sent</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground flex-shrink-0 mt-1">
        <User className="w-3 h-3" />
      </div>
      <div className="flex flex-col max-w-[88%]">
        <div className="flex justify-between gap-2 w-full font-mono text-[9px] text-foreground/55 mb-0.5">
          <span className="truncate" title={msg.authorEmail ?? undefined}>
            {relayedFrom ? (
              <>
                <span className="font-semibold text-foreground/75">
                  {relayedFrom.name ?? relayedFrom.email}
                </span>
                <span> · via {relayedFrom.via}</span>
              </>
            ) : (
              (msg.authorEmail ?? 'Customer')
            )}
          </span>
          <span className="whitespace-nowrap shrink-0" title={formatDate(msgTime)}>
            {formatWhen(msgTime)}
          </span>
        </div>
        {/* 2026-06-17: customer bubbles are no longer clickable. The previous
            implementation called `onMessageNavigate(msg.id)` with a
            `messageEvents.id`, and the BE's getMessageById falls back from
            conv_id → event_id resolution — so any event_id that numerically
            collided with another conversation_id silently swapped the
            displayed conversation, wiping composer state on the
            `key={message.id}` remount in MessagesPage / MessageDetailPage.
            Reproduced by the 2026-06-17 routing audit (reply intended for
            conv_4 landed on conv_5). The same-conversation "focus an older
            message" intent (suggestedAnswer for that specific message) was
            never wired up beyond the URL navigation, so removing the click
            is non-regressive. */}
        <div className="rounded-lg px-3 py-2 text-[12px] leading-relaxed bg-card border border-border text-foreground">
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0 break-words">
              <ThreadBubble
                content={translatedContent ?? msg.content}
                isAgent={false}
                html={translatedContent === null ? originalHtml : null}
                eventId={msg.id}
              />
            </div>
            <div className="flex-shrink-0 mt-0.5">
              <TranslateButton
                messageId={msg.id}
                onTranslated={(content) => setTranslatedContent(content)}
                onCleared={() => setTranslatedContent(null)}
              />
            </div>
          </div>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {attachments.map((att) => (
              <Button
                key={att.id}
                type="button"
                variant="ghost"
                onClick={() => onOpenAttachment?.(att.id)}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 h-auto rounded bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors"
              >
                <Paperclip className="w-2.5 h-2.5" />
                {att.originalFilename}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
