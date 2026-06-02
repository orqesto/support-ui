import { useState } from 'react';
import { Paperclip, User } from 'lucide-react';
import { TranslateButton } from '@/components/shared/TranslateButton';
import type { MessageEvent } from '@/types';
import { ThreadBubble } from './ThreadBubble';
import { relativeTime, getInitials } from './messageDetailConstants';
import type { Attachment } from './MessageAttachments';

type Props = {
  msg: MessageEvent;
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
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);

  const isAgent =
    msg.type !== 'inbound' ||
    (msg.authorEmail ?? '').toLowerCase() === 'bot' ||
    (msg.metadata as { isSystemReply?: boolean } | null)?.isSystemReply === true;

  const msgTime = isAgent
    ? (msg.sentAt ??
      (msg.metadata as { receivedAt?: string } | null)?.receivedAt ??
      msg.createdAt)
    : ((msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt);

  const initials = getInitials(msg.authorEmail ?? '');
  if (isAgent) {
    return (
      <div className="flex flex-row-reverse gap-2">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[9px] font-semibold text-primary-foreground flex-shrink-0 mt-1">
          {initials}
        </div>
        <div className="flex flex-col items-end max-w-[88%]">
          <div className="flex justify-between gap-2 w-full font-mono text-[9px] text-muted-foreground mb-0.5">
            <span>{msg.authorEmail ?? 'Support'}</span>
            <span>{relativeTime(msgTime)}</span>
          </div>
          <div className="rounded-lg px-3 py-2 bg-primary text-primary-foreground text-[12px] leading-relaxed">
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0 break-words">
                <ThreadBubble content={translatedContent ?? msg.content} isAgent={true} />
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
          <span>{msg.authorEmail ?? 'Customer'}</span>
          <span>{relativeTime(msgTime)}</span>
        </div>
        {msg.id === mainMessageId ? (
          <div className="rounded-lg px-3 py-2 text-[12px] leading-relaxed bg-card border border-border text-foreground ring-1 ring-ring/40">
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0 break-words">
                <ThreadBubble content={translatedContent ?? msg.content} isAgent={false} />
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
        ) : (
          <div
            className="rounded-lg px-3 py-2 text-[12px] leading-relaxed bg-card border border-border text-foreground"
            role="button"
            tabIndex={0}
            onClick={() => onMessageNavigate?.(msg.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onMessageNavigate?.(msg.id);
            }}
          >
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0 break-words">
                <ThreadBubble content={translatedContent ?? msg.content} isAgent={false} />
              </div>
              <div
                className="flex-shrink-0 mt-0.5"
                onClick={(ev) => ev.stopPropagation()}
                onKeyDown={(ev) => ev.stopPropagation()}
                role="none"
              >
                <TranslateButton
                  messageId={msg.id}
                  onTranslated={(content) => setTranslatedContent(content)}
                  onCleared={() => setTranslatedContent(null)}
                />
              </div>
            </div>
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
      </div>
    </div>
  );
}
