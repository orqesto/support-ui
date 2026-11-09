import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { SPAM_LOG_CARD_COPY, spamLogTruncationNotice } from '@/lib/spamLogCardCopy';
import { formatDate } from '@/lib/utils';
import type { MessageThread } from '@/services/message.service';
import { ThreadBubble } from '../ThreadBubble';

/** A spam-rule record's read-only preview (not a conversation, so not the detail pane). Moved unchanged from MessagesPage. */
export const SpamPreviewDialog = ({
  spamPreview,
  onClose,
}: {
  spamPreview: MessageThread | null;
  onClose: () => void;
}) => (
  <Dialog open={spamPreview !== null} onOpenChange={(open) => !open && onClose()} size="lg">
    <DialogHeader>
      <div className="flex items-center gap-2">
        <DialogTitle>{spamPreview?.latestMessage?.subject || '(no subject)'}</DialogTitle>
        <Badge variant="warning">{SPAM_LOG_CARD_COPY.badge}</Badge>
      </div>
    </DialogHeader>
    <DialogContent>
      {/*
          Why this is a dialog and not the usual detail pane, said on the screen rather
          than left for the reader to infer from a modal appearing where a thread was
          expected. A card is a spam-rule RECORD (spam_log row) not attached to a conversation
          in this view — usually a catch record whose conversation is gone, but not always: a
          record whose message IS in a thread stays a card until spam is viewed in its
          workspace (25 linked per load), and a global admin with no workspace selected links
          none. Rows a critical-spam rule WITHHELD are never cards. So there are no events,
          notes or activity to show, and the copy says only what holds in every state
          (SPAM_LOG_CARD_COPY).
        */}
      <p className="mb-3 text-xs text-muted-foreground">
        {spamPreview?.latestMessage?.contentTruncatedFrom !== undefined
          ? SPAM_LOG_CARD_COPY.captionCut
          : SPAM_LOG_CARD_COPY.caption}
      </p>
      <div className="mb-3 space-y-0.5 text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">From:</span>{' '}
          {spamPreview?.latestMessage?.sender || 'unknown sender'}
        </div>
        {spamPreview?.latestMessage?.createdAt && (
          <div>
            <span className="font-medium text-foreground">Received:</span>{' '}
            {formatDate(spamPreview.latestMessage.createdAt)}
          </div>
        )}
      </div>
      {spamPreview?.latestMessage?.content &&
        spamPreview.latestMessage.contentTruncatedFrom !== undefined && (
          <p className="mb-2 text-xs font-medium text-warning" role="note">
            {spamLogTruncationNotice(
              spamPreview.latestMessage.content.length,
              spamPreview.latestMessage.contentTruncatedFrom
            )}
          </p>
        )}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        {spamPreview?.latestMessage?.content ? (
          <ThreadBubble content={spamPreview.latestMessage.content} isAgent={false} quoteExpanded />
        ) : (
          <p className="text-sm text-muted-foreground">{SPAM_LOG_CARD_COPY.emptyBody}</p>
        )}
      </div>
    </DialogContent>
    <DialogFooter>
      <Button onClick={() => onClose()}>Close</Button>
    </DialogFooter>
  </Dialog>
);
