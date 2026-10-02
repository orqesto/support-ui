import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, Download, Eye, FileText, Image, Video, Volume2 } from 'lucide-react';
import { relativeTime } from './messageDetailConstants';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import {
  AttachmentPreviewDialog,
  isPreviewable,
} from '@/components/shared/AttachmentPreviewDialog';
import { apiClient } from '@/lib/api-client';
import { attachmentDownloadUrl } from '@/lib/attachmentUrl';
import { useAuthStore } from '@/stores/authStore';
import type { Attachment } from '@/types/ai';
import type { Message, MessageEvent } from '@/types';
import { logger } from '@/lib/logger';
import { relayedFromLabel } from '@/lib/relayedFrom';
import { isOutgoingEvent } from '@/lib/messageHelpers';

export type { Attachment };

type MessageAttachmentsProps = {
  message: Message;
  sortedThread?: MessageEvent[];
  refreshKey?: number;
  highlightId?: number | null;
  preloadedAttachments?: Attachment[];
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const isImage = (mimeType: string) => mimeType.startsWith('image/');

/** v4 `.filerow .ibtn`: a 30px bordered icon button, always visible. */
const FILE_ACTION =
  'w-[30px] h-[30px] flex-shrink-0 rounded-[7px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted max-sm:w-10 max-sm:h-10';

// Browser-loaded thumbnail: the workspace goes in the path, not a header. One builder,
// shared with ThreadAttachmentChip — see `attachmentDownloadUrl`.
const getDownloadUrl = (att: Attachment, organizationId?: number | null) =>
  attachmentDownloadUrl(att.id, organizationId);

const FileIcon = ({ mimeType }: { mimeType: string }) => {
  const cls = 'w-3.5 h-3.5 text-muted-foreground';
  if (mimeType.startsWith('image/')) return <Image className={cls} />;
  if (mimeType.startsWith('video/')) return <Video className={cls} />;
  if (mimeType.startsWith('audio/')) return <Volume2 className={cls} />;
  return <FileText className={cls} />;
};

/**
 * Who sent the message an attachment arrived on, and when — v4's "size · who · when".
 *
 * ⛔ ONLY FROM THE OWNING EVENT. The attachment carries `messageEventId`; the thread carries that
 * event. No event (an older backend, a ticket/comment attachment, an event outside the loaded
 * thread) ⇒ null, and the row says what staging always said rather than guessing a person.
 * The same reading of an event as the thread's own bubble (ThreadMessageItem): an agent reply is
 * named by the teammate when the backend resolved one, else the mailbox; a customer message by
 * its From address.
 */
export const attachmentOrigin = (
  attachment: Attachment,
  eventsById: Map<number, MessageEvent>
): { who: string | null; when: string; outgoing: boolean } | null => {
  const eventId = (attachment as { messageEventId?: number | null }).messageEventId;
  if (eventId === null || eventId === undefined) return null;
  const event = eventsById.get(eventId);
  if (!event) return null;
  const meta = event.metadata as { receivedAt?: string } | null;
  const outgoing = isOutgoingEvent(event);
  const name = event.authorName?.trim() ? event.authorName.trim() : null;
  // An incoming message relayed by a form names the person the way its bubble does:
  // "Jane · via mailer@shopify.com" (same helper, so the Files row and the bubble agree).
  const relayed = outgoing ? null : relayedFromLabel(event);
  const who = outgoing
    ? (name ?? event.authorEmail ?? null)
    : relayed
      ? `${relayed.name ?? relayed.email} · via ${relayed.via}`
      : (event.authorEmail ?? null);
  const when = outgoing
    ? (event.sentAt ?? meta?.receivedAt ?? event.createdAt)
    : (meta?.receivedAt ?? event.createdAt);
  return { who: who?.trim() ? who.trim() : null, when, outgoing };
};

export const MessageAttachments = ({
  message,
  sortedThread,
  refreshKey,
  highlightId,
  preloadedAttachments,
}: MessageAttachmentsProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>(preloadedAttachments ?? []);
  // Same source the api-client interceptor reads; for a browser-loaded <img src> it has to go
  // in the path instead of a header.
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  /** Attachment ids whose thumbnail failed to load — shown as the file icon instead. */
  const [brokenThumbnails, setBrokenThumbnails] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(!preloadedAttachments);
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const eventsById = new Map((sortedThread ?? []).map((event) => [event.id, event] as const));
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'error' | 'success' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  useEffect(() => {
    if (preloadedAttachments) {
      setAttachments(preloadedAttachments);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ success: boolean; data: Attachment[] }>(`/api/messages/${message.id}/attachments`)
      .then((res) => {
        if (!cancelled) setAttachments(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, refreshKey, preloadedAttachments]);

  useEffect(() => {
    if (!highlightId) return;
    setActiveHighlight(highlightId);
    const el = rowRefs.current.get(highlightId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setActiveHighlight(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const handleDownload = async (att: Attachment) => {
    try {
      const response = await apiClient.get(`/api/attachments/${att.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = att.originalFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Failed to download attachment:', err);
      setAlertDialog({
        open: true,
        title: 'Download Failed',
        description: 'Failed to download attachment. Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return (
      <p className="py-4 text-[11px] text-center text-muted-foreground">Loading attachments…</p>
    );
  }

  if (attachments.length === 0) {
    return <p className="py-4 text-[11px] text-center text-muted-foreground">No attachments</p>;
  }

  return (
    <div>
      {attachments.map((att) => {
        const origin = attachmentOrigin(att, eventsById);
        return (
          // v4 `.filerow`: icon tile, bold name, "size · who · when", and Preview / Download as
          // always-visible icon buttons — hover-only actions were unreachable by touch and hidden
          // from anyone scanning the list.
          <div
            key={att.id}
            ref={(el) => {
              if (el) rowRefs.current.set(att.id, el);
              else rowRefs.current.delete(att.id);
            }}
            data-testid="file-row"
            className={`flex items-center gap-2.5 mb-1.5 py-2 pl-2.5 pr-2 rounded-lg border bg-card transition-colors ${
              activeHighlight === att.id
                ? 'border-primary-line ring-1 ring-primary/30'
                : 'border-border'
            }`}
          >
            {/* Thumbnail or icon */}
            <div className="w-7 h-7 rounded-[7px] flex-shrink-0 grid place-items-center bg-sunken overflow-hidden">
              {isImage(att.mimeType) && !brokenThumbnails.has(att.id) ? (
                <img
                  src={getDownloadUrl(att, selectedOrganizationId)}
                  alt={att.originalFilename}
                  className="w-full h-full object-cover"
                  // Fall back to the file icon rather than a broken-image glyph. The thread chip
                  // has always done this; the FILES tab had no handler at all, so any 404 — a
                  // file missing from storage, or the FE reaching prod before the org-in-path
                  // attachment route does (this repo deploys `main` on push, the backend ships on
                  // a tag) — rendered a broken frame instead of degrading.
                  onError={() => setBrokenThumbnails((previous) => new Set(previous).add(att.id))}
                />
              ) : (
                <FileIcon mimeType={att.mimeType} />
              )}
            </div>

            {/* Name + meta */}
            <div className="flex flex-col flex-1 min-w-0 leading-[1.3]">
              {isPreviewable(att.mimeType) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewAttachment(att)}
                  title="Preview"
                  className="block p-0 w-full h-auto text-left font-sans text-[12.5px] font-medium truncate leading-[1.3] hover:bg-transparent hover:underline"
                >
                  {att.originalFilename}
                </Button>
              ) : (
                <b className="text-[12.5px] font-medium truncate">{att.originalFilename}</b>
              )}
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                <span className="flex-shrink-0">{formatFileSize(att.size)}</span>
                {origin ? (
                  <span className="truncate" data-testid="file-origin">
                    {[origin.who, relativeTime(origin.when)]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join('')}
                  </span>
                ) : (
                  <>
                    <span className="text-border">·</span>
                    {/* No owning event to read (see `attachmentOrigin`) ⇒ what this row has
                        always said. The endpoint sends no direction of its own. */}
                    <span className="inline-flex items-center gap-0.5 text-success">
                      <ArrowDownLeft className="w-2.5 h-2.5" />
                      Received
                    </span>
                  </>
                )}
              </span>
            </div>

            {isPreviewable(att.mimeType) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Preview ${att.originalFilename}`}
                onClick={() => setPreviewAttachment(att)}
                title="Preview"
                className={FILE_ACTION}
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Download ${att.originalFilename}`}
              onClick={() => void handleDownload(att)}
              title="Download"
              className={FILE_ACTION}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })}

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
