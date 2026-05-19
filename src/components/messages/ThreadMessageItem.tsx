import { Paperclip, User } from 'lucide-react';
import { TranslateButton } from '@/components/shared/TranslateButton';
import type { Message } from '@/types';
import { ThreadBubble } from './ThreadBubble';
import { relativeTime, getInitials } from './messageDetailConstants';
import type { Attachment } from './MessageAttachments';

type Props = {
  msg: Message;
  mainMessageId: number;
  onMessageNavigate?: (id: number) => void;
  attachments?: Attachment[];
  onOpenAttachment?: (id: number) => void;
};

export function ThreadMessageItem({
  msg,
  mainMessageId,
  onMessageNavigate,
  attachments = [],
  onOpenAttachment,
}: Props) {
  const isAgent =
    msg.isOutgoing === true ||
    msg.sender.toLowerCase() === 'bot' ||
    (msg.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;

  const msgTime = isAgent
    ? (msg.repliedAt ??
      (msg.metadata as { receivedAt?: string } | null)?.receivedAt ??
      msg.createdAt)
    : ((msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt);

  const initials = getInitials(isAgent ? 'Team Reply' : msg.sender);
  if (isAgent) {
    return (
      <div className="flex flex-row-reverse gap-2">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[9px] font-semibold text-primary-foreground flex-shrink-0 mt-1">
          {initials}
        </div>
        <div className="flex flex-col items-end max-w-[88%]">
          <span className="font-mono text-[9px] text-muted-foreground mb-0.5">
            {isAgent ? 'Team Reply' : msg.sender} • {relativeTime(msgTime)}
          </span>
          <div className="rounded-lg px-3 py-2 bg-primary text-primary-foreground text-[12px] leading-relaxed break-words">
            <ThreadBubble content={msg.content} isAgent={true} />
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {attachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => onOpenAttachment?.(att.id)}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary-foreground/10 text-primary-foreground/70 border border-primary-foreground/20 hover:bg-primary-foreground/20 transition-colors"
                >
                  <Paperclip className="w-2.5 h-2.5" />
                  {att.originalFilename}
                </button>
              ))}
            </div>
          )}
          {msg.isOutgoing && (
            <span className="font-mono text-[9px] text-foreground/55 mt-0.5">✓ Sent</span>
          )}
          <div className="mt-0.5">
            <TranslateButton
              messageId={msg.id}
              originalContent={msg.content}
              variant="ghost"
              size="sm"
            />
          </div>
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
        <span className="font-mono text-[9px] text-foreground/55 mb-0.5">
          {msg.sender} · {relativeTime(msgTime)}
        </span>
        {msg.id === mainMessageId ? (
          <div className="rounded-lg px-3 py-2 text-[12px] leading-relaxed break-words bg-card border border-border text-foreground ring-1 ring-ring/40">
            <ThreadBubble content={msg.content} isAgent={false} />
          </div>
        ) : (
          <div
            className="rounded-lg px-3 py-2 text-[12px] leading-relaxed break-words bg-card border border-border text-foreground"
            role="button"
            tabIndex={0}
            onClick={() => onMessageNavigate?.(msg.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onMessageNavigate?.(msg.id);
            }}
          >
            <ThreadBubble content={msg.content} isAgent={false} />
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {attachments.map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => onOpenAttachment?.(att.id)}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors"
              >
                <Paperclip className="w-2.5 h-2.5" />
                {att.originalFilename}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-0.5">
          <TranslateButton
            messageId={msg.id}
            originalContent={msg.content}
            originalSubject={msg.id === mainMessageId ? (msg.subject ?? undefined) : undefined}
            variant="ghost"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
