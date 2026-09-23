import { useState } from 'react';
import { User } from 'lucide-react';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Button } from '@/components/ui/Button';
import { relayedFromLabel } from '@/lib/relayedFrom';
import { formatDate, formatWhen } from '@/lib/utils';
import type { MessageEvent } from '@/types';
import { useMessageHtml } from '@/hooks/useMessageHtml';
import { ThreadAttachmentChip } from './ThreadAttachmentChip';
import { ThreadBubble } from './ThreadBubble';
import { getInitials } from './messageDetailConstants';
import type { Attachment } from './MessageAttachments';
import { ReceivedAtAddresses } from './ReceivedAtAddresses';

type Props = {
  msg: MessageEvent;
  attachments?: Attachment[];
  onOpenAttachment?: (id: number) => void;
  /** "from ODL-MKT-1" when this message arrived through a merge. */
  mergedFrom?: string | null;
  /** Address the reply to this message's writer ("Reply to this message"). */
  onReplyTo?: (addresses: string[]) => void;
};

export function ThreadMessageItem({
  msg,
  attachments = [],
  onOpenAttachment,
  mergedFrom,
  onReplyTo,
}: Props) {
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  // The language the agent picked, for the "Translated · XX" notice (v3). `translateKey`
  // remounts the TranslateButton when the notice's own "Show original" is pressed, so the
  // button's internal "translated" state cannot disagree with what the bubble shows.
  const [translatedLanguage, setTranslatedLanguage] = useState<string | null>(null);
  const [translateKey, setTranslateKey] = useState(0);
  const showOriginal = () => {
    setTranslatedContent(null);
    setTranslatedLanguage(null);
    setTranslateKey((key) => key + 1);
  };
  const translatedBar = (onAgent: boolean) =>
    translatedContent === null ? null : (
      <TranslatedNotice
        language={translatedLanguage}
        onAgent={onAgent}
        onShowOriginal={showOriginal}
      />
    );

  /**
   * The sender's original markup, so an order confirmation renders as the table it was
   * written as instead of the `| Discount: | -16.50 |` text alternative, and its tracking
   * link is clickable.
   *
   * ⛔ Skipped when the agent has asked for a TRANSLATION: that comes back as plain text, and
   * quietly showing the untranslated original instead would be worse than an ugly table.
   *
   * 🔑 NOT skipped for outbound any more. It used to be, on the reasoning that "the console
   * already holds what we sent" — but what it holds is the DERIVED PLAIN TEXT, which is not
   * what we sent. On staging's SOM-INF-1579 an agent reply whose stored markup carries 76
   * images rendered as a blank blue bubble: the quotation the customer received, shown to the
   * agent as an empty box. An agent checking what went out, or answering "what did you send
   * them?", was reading a different document from the customer.
   */
  const wantsHtml = translatedContent === null;
  const { data: originalHtml } = useMessageHtml(msg.id, wantsHtml);

  const isAgent =
    msg.type !== 'inbound' ||
    (msg.authorEmail ?? '').toLowerCase() === 'bot' ||
    (msg.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;

  const msgTime = isAgent
    ? (msg.sentAt ?? (msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt)
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
  // v3 thread row: a 21px avatar, a Grotesk meta line ("Name · via address · when") above the
  // bubble, the bubble itself, and attachments INSIDE it under a hairline. An incoming bubble
  // is a card above the canvas; a reply WE wrote sits on the soft --agent ground (it used to be
  // solid primary, which made every reply the loudest thing on screen).
  const avatar = (
    <div className="w-[21px] h-[21px] mt-px rounded-full bg-sunken border border-border grid place-items-center font-display text-[9px] font-semibold text-muted-foreground flex-none">
      {initials || <User className="w-3 h-3" />}
    </div>
  );
  const when = (
    <span className="text-muted-foreground" title={formatDate(msgTime)}>
      · {formatWhen(msgTime)}
    </span>
  );
  // Mono row, display-face NAME: addresses and times are identifiers and stay mono (the type
  // rule, #448/#452) even though the v3 mock sets the whole line in the display face.
  const meta =
    'font-mono text-[10.5px] text-faint-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5';
  const translate = (onAgent: boolean) => (
    <div className="flex-none mt-px">
      <TranslateButton
        key={translateKey}
        messageId={msg.id}
        onTranslated={(content, _subject, language) => {
          setTranslatedContent(content);
          setTranslatedLanguage(language ?? null);
        }}
        onCleared={() => {
          setTranslatedContent(null);
          setTranslatedLanguage(null);
        }}
        buttonClassName={`grid place-items-center w-7 h-7 rounded-[7px] border transition-colors ${
          onAgent
            ? 'bg-agent-fill border-agent-hair text-agent-dim hover:text-agent-foreground hover:border-agent-foreground'
            : 'bg-bubble-well border-bubble-line text-faint-foreground hover:text-foreground hover:border-border-strong'
        }`}
        spinnerClassName={onAgent ? 'text-agent-dim' : 'text-muted-foreground'}
        clearClassName={`grid place-items-center w-7 h-7 rounded-[7px] border transition-colors flex-none ${
          onAgent
            ? 'bg-agent-fill border-agent-hair text-agent-dim hover:text-agent-foreground'
            : 'bg-bubble-well border-bubble-line text-faint-foreground hover:text-foreground'
        }`}
      />
    </div>
  );
  const attachmentRow = (onAgent: boolean) =>
    attachments.length > 0 && (
      <div
        className={`flex flex-wrap gap-1.5 mt-[9px] pt-[9px] border-t ${onAgent ? 'border-agent-hair' : 'border-hair'}`}
      >
        {attachments.map((att) => (
          <ThreadAttachmentChip
            key={att.id}
            attachment={att}
            onOpen={onOpenAttachment}
            className={`!text-[11.5px] !px-2 !py-[3px] !rounded-md border ${
              onAgent
                ? 'text-agent-dim border-agent-hair bg-agent-fill hover:border-agent-foreground'
                : 'text-muted-foreground border-border bg-raised hover:border-border-strong'
            }`}
          />
        ))}
      </div>
    );

  if (isAgent) {
    return (
      <div className="flex flex-row-reverse items-start gap-[9px]">
        {avatar}
        <div className="flex flex-col items-end gap-1 min-w-0 max-w-[90%]">
          {/* Who sent this, then what the customer saw it come from. They are different facts:
              `authorEmail` is the shared mailbox, identical on every agent's reply, so on its
              own the thread reads as though the mailbox answered itself. Without `authorName`
              — AI and automated replies, and mail imported from the mailbox rather than sent
              here — this stays exactly as it was rather than guessing at a person. */}
          <div className={`${meta} justify-end`} title={msg.authorUserEmail ?? undefined}>
            {authorName ? (
              <>
                <b className="font-display font-semibold text-foreground">{authorName}</b>
                {msg.authorEmail ? (
                  <span className="text-muted-foreground">· via {msg.authorEmail}</span>
                ) : null}
              </>
            ) : (
              <span>{msg.authorEmail ?? 'Support'}</span>
            )}
            {when}
            {mergedFrom && <span className="text-muted-foreground">· {mergedFrom}</span>}
          </div>
          {/* Who this particular reply went to. Per-message, not per-thread: a reply can be
              addressed differently from the message that opened the conversation. This is
              also the ONLY place a bcc is ever visible — it cannot be recovered from the mail
              itself, so if the shared inbox doesn't show it here, nobody can answer "who
              else got this". */}
          <ReceivedAtAddresses recipients={msg.recipients} variant="detail" />
          <div className="rounded-xl px-[13px] py-[11px] bg-agent border border-agent-line text-agent-foreground text-[13.5px] leading-[1.62] max-w-full">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 break-words">
                {translatedBar(true)}
                <ThreadBubble
                  content={translatedContent ?? msg.content}
                  isAgent={true}
                  html={translatedContent === null ? originalHtml : null}
                  eventId={msg.id}
                />
              </div>
              {translate(true)}
            </div>
            {attachmentRow(true)}
          </div>
          {msg.type !== 'inbound' && (
            <span className="font-display text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
              ✓ Sent
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-[9px]">
      {avatar}
      <div className="flex flex-col gap-1 min-w-0 max-w-[90%]">
        <div className={meta} title={msg.authorEmail ?? undefined}>
          {relayedFrom ? (
            <>
              <b className="font-display font-semibold text-foreground">
                {relayedFrom.name ?? relayedFrom.email}
              </b>
              <span className="text-muted-foreground">· via {relayedFrom.via}</span>
            </>
          ) : (
            <span>{msg.authorEmail ?? 'Customer'}</span>
          )}
          {when}
          {mergedFrom && <span className="text-muted-foreground">· {mergedFrom}</span>}
          {onReplyTo && msg.replyTarget && msg.replyTarget.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0 text-[10.5px]"
              onClick={() => onReplyTo(msg.replyTarget ?? [])}
              title={`Reply to ${msg.replyTarget.join(', ')}`}
            >
              Reply to this message
            </Button>
          )}
        </div>
        {/* 2026-06-17: customer bubbles are no longer clickable. The previous implementation
            called `onMessageNavigate(msg.id)` with a `messageEvents.id`, and the BE's
            getMessageById falls back from conv_id → event_id resolution — so any event_id that
            numerically collided with another conversation_id silently swapped the displayed
            conversation (2026-06-17 routing audit: a reply meant for conv_4 landed on conv_5).
            The "focus an older message" intent was never wired up beyond the URL navigation,
            so removing the click is non-regressive. */}
        <div className="rounded-xl px-[13px] py-[11px] bg-bubble border border-bubble-line text-foreground text-[13.5px] leading-[1.62] max-w-full">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 break-words">
              {translatedBar(false)}
              <ThreadBubble
                content={translatedContent ?? msg.content}
                isAgent={false}
                html={translatedContent === null ? originalHtml : null}
                eventId={msg.id}
              />
            </div>
            {translate(false)}
          </div>
          {attachmentRow(false)}
        </div>
      </div>
    </div>
  );
}

/**
 * v3 ".trbar": says what the agent is reading. A machine translation comes back as plain text,
 * so the sender's tables, links and images are only on the original — without this notice a
 * translated order confirmation reads as a broken one.
 */
function TranslatedNotice({
  language,
  onAgent,
  onShowOriginal,
}: {
  language: string | null;
  onAgent: boolean;
  onShowOriginal: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 mb-[9px] px-2 py-1 rounded-md border ${
        onAgent
          ? 'bg-agent-fill border-agent-hair text-agent-foreground'
          : 'bg-ai-muted border-ai-line text-ai'
      }`}
    >
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.1em]">
        Translated{language ? ` · ${language.toUpperCase()}` : ''}
      </span>
      <span
        className={`flex-1 min-w-[120px] text-[11px] ${onAgent ? 'text-agent-dim' : 'text-muted-foreground'}`}
      >
        machine translation, plain text — formatting stays on the original
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onShowOriginal}
        className={`h-auto p-0 font-display text-[10px] font-semibold uppercase tracking-[0.09em] hover:bg-transparent ${
          onAgent ? 'text-agent-link' : 'text-ai'
        }`}
      >
        Show original
      </Button>
    </div>
  );
}
