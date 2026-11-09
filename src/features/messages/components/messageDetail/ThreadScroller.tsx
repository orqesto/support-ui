import { Fragment, type ComponentProps } from 'react';
import type { Message } from '@/types';
import { Button } from '@/components/ui/Button';
import { ThreadMessageItem } from '../ThreadMessageItem';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { MessageGhostBubble } from '../MessageGhostBubble';
import type { Attachment } from '../MessageAttachments';
import type { useThreadMergeContext } from '../useThreadMergeContext';
import { dayLabel } from '../threadDays';
import { LABEL, type GhostOption, type PanelTab } from '../messageDetailConstants';
import { NO_ATTACHMENTS } from './detailConstants';
import type { useThreadEvents } from './useThreadEvents';
import type { useThreadScrollPin } from './useThreadScrollPin';
import type { useThreadTimeline } from './useThreadTimeline';
import type { Setter } from './types';

/** MessageDetail's thread view: the loaded messages and notes, day breaks and the ghost bubble. */
export function ThreadScroller({
  thread,
  scrollPin,
  timelineData,
  panelOpen,
  twoColumn,
  mergeContext,
  supportsRecipients,
  isActive,
  handleReplyToMessage,
  attachmentsByMessageId,
  handleOpenAttachment,
  handleOpenInlineImage,
  aiLoading,
  ghostVisible,
  ghostOption,
  autoReply,
  composer,
  composerMode,
  message,
  alternativeCount,
  handleGhostClick,
  setTab,
  setPanelOpen,
}: {
  thread: ReturnType<typeof useThreadEvents>;
  scrollPin: ReturnType<typeof useThreadScrollPin>;
  timelineData: ReturnType<typeof useThreadTimeline>;
  panelOpen: boolean;
  twoColumn: boolean;
  mergeContext: ReturnType<typeof useThreadMergeContext>;
  supportsRecipients: boolean;
  isActive: boolean;
  handleReplyToMessage: (addresses: string[]) => void;
  attachmentsByMessageId: Map<number, Attachment[]>;
  handleOpenAttachment: ComponentProps<typeof ThreadMessageItem>['onOpenAttachment'];
  handleOpenInlineImage: ComponentProps<typeof ThreadMessageItem>['onOpenInlineImage'];
  aiLoading: boolean;
  ghostVisible: boolean;
  ghostOption: GhostOption | null;
  autoReply: ComponentProps<typeof MessageGhostBubble>['autoReply'];
  composer: string;
  composerMode: 'reply' | 'note';
  message: Message;
  alternativeCount: number;
  handleGhostClick: ComponentProps<typeof MessageGhostBubble>['onGhostClick'];
  setTab: Setter<PanelTab>;
  setPanelOpen: Setter<boolean>;
}) {
  const {
    threadMessages,
    threadLoading,
    threadError,
    setThreadRefreshKey,
    threadPage,
    loadEarlier,
    loadingEarlier,
    sortedThread,
    lastWordOurs,
    setNotesBump,
  } = thread;
  // Re-reads the notes (the thread's and the Notes tab's) after a hold reason is cleared.
  const bumpNotes = () => setNotesBump((key) => key + 1);
  const { threadScrollerRef, threadContentRef, markScrollIntent } = scrollPin;
  const { timeline, threadDayStarts } = timelineData;
  return (
    /* Thread view — visible when no panel tab is open.
      ⛔ overflow-x-hidden is deliberate: `overflow-y-auto` alone makes the browser
      compute overflow-x as `auto` too (CSS couples the axes), so one over-wide
      message — an unwrapped <pre> body, a fixed-width email table — turned the
      WHOLE thread into a sideways-scrolling pane that clipped every message
      (ZET-SUP-1358). Wide content is contained per-bubble in ThreadBubble. */
    <div
      ref={threadScrollerRef}
      data-testid="thread-scroller"
      onWheel={markScrollIntent}
      onTouchMove={markScrollIntent}
      onKeyDown={markScrollIntent}
      onPointerDown={markScrollIntent}
      className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-background max-sm:flex-none ${panelOpen && !twoColumn ? 'hidden' : ''}`}
    >
      {/* v3: the thread is the canvas; bubbles are the cards on it. */}
      <div
        ref={threadContentRef}
        className="flex flex-col gap-3.5 px-3.5 py-4 max-sm:gap-3 max-sm:px-3 max-sm:pt-3 max-sm:pb-2"
      >
        {threadLoading && sortedThread.length === 0 && (
          <div className="py-8 text-sm text-center text-muted-foreground">
            <div className="mx-auto mb-2 w-5 h-5 rounded-full border-2 animate-spin border-primary border-t-transparent" />
            Loading thread…
          </div>
        )}
        {threadError && (
          <div className="py-4 text-sm text-center text-destructive">
            {threadError}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setThreadRefreshKey((key) => key + 1)}
              className="block p-0 mx-auto mt-1 h-auto text-xs underline hover:no-underline"
            >
              Retry
            </Button>
          </div>
        )}
        {!threadLoading && !threadError && sortedThread.length === 0 && (
          <div className="py-6 text-[12px] text-center text-muted-foreground">
            No messages in thread yet.
          </div>
        )}
        {threadPage?.hasEarlier && (
          <div className="text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadEarlier}
              isLoading={loadingEarlier}
              className="px-2 py-1 h-auto text-xs text-muted-foreground"
            >
              Show earlier messages ({threadPage.total - threadMessages.length} more)
            </Button>
          </div>
        )}
        {timeline.map((row, index) => (
          <Fragment key={row.kind === 'message' ? `m${row.msg.id}` : `n${row.note.id}`}>
            {threadDayStarts.has(index) && (
              <div
                role="separator"
                aria-label={dayLabel(row.time)}
                className={`flex items-center gap-2.5 text-muted-foreground ${LABEL}`}
              >
                <span className="flex-1 h-px bg-border" aria-hidden />
                <span aria-hidden>{dayLabel(row.time)}</span>
                <span className="flex-1 h-px bg-border" aria-hidden />
              </div>
            )}
            {row.kind === 'message' ? (
              // Memoised, with stable props: typing in the composer re-renders this view
              // per keystroke and must not re-render every message on screen.
              <ThreadMessageItem
                msg={row.msg}
                mergedFrom={mergeContext.mergedFromLabel(row.msg)}
                onReplyTo={supportsRecipients && isActive ? handleReplyToMessage : undefined}
                attachments={attachmentsByMessageId.get(row.msg.id) ?? NO_ATTACHMENTS}
                onOpenAttachment={handleOpenAttachment}
                onOpenInlineImage={handleOpenInlineImage}
              />
            ) : (
              <ThreadNoteItem
                note={row.note}
                conversationId={message.id}
                onNotesChanged={bumpNotes}
              />
            )}
          </Fragment>
        ))}

        {/* Ghost bubble — a suggested reply, so only where a reply can be written. */}
        {isActive && (
          <MessageGhostBubble
            aiLoading={aiLoading}
            ghostVisible={ghostVisible}
            ghostOption={ghostOption}
            autoReply={autoReply}
            composer={composer}
            composerMode={composerMode}
            resolved={message.status === 'resolved'}
            answered={lastWordOurs}
            alternativeCount={alternativeCount}
            onGhostClick={handleGhostClick}
            onShowAlternatives={() => {
              setTab('kb');
              setPanelOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
