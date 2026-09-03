import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogClose, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { Attachment } from '@/types/ai';

/**
 * Which attachments the browser can render itself. Everything else keeps the
 * download-only affordance — offering a preview that immediately fails is worse
 * than not offering one.
 */
export const isPreviewable = (mimeType: string): boolean =>
  mimeType.startsWith('image/') ||
  mimeType === 'application/pdf' ||
  mimeType.startsWith('video/') ||
  mimeType.startsWith('audio/');

type AttachmentPreviewDialogProps = {
  /** The attachment to preview; null renders nothing (dialog closed). */
  attachment: Attachment | null;
  onClose: () => void;
  /**
   * Override for the download endpoint — the ticket surface routes Jira-hosted
   * attachments through `/api/attachments/jira/:id/download`. Defaults to the
   * standard per-attachment endpoint.
   */
  downloadPath?: string;
};

/**
 * In-app preview for an attachment — a PDF order confirmation, a photo of a damaged
 * parcel — without forcing a download first.
 *
 * The bytes are fetched through `apiClient` (auth, refresh, error shape) into a blob and
 * shown via an object URL, because the download endpoint needs the session and a bare
 * `<iframe src>` to a cross-origin API cannot be relied on to send it everywhere the
 * console is deployed. The blob is re-wrapped with the attachment's OWN mime type: the
 * endpoint serves generic bytes, and an object URL without `application/pdf` on it makes
 * the browser download instead of render — the exact behavior this dialog exists to avoid.
 */
export const AttachmentPreviewDialog = ({
  attachment,
  onClose,
  downloadPath,
}: AttachmentPreviewDialogProps) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    const path = downloadPath ?? `/api/attachments/${attachment.id}/download`;
    apiClient
      .get(path, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        const typed = new Blob([response.data as Blob], { type: attachment.mimeType });
        createdUrl = URL.createObjectURL(typed);
        setObjectUrl(createdUrl);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load attachment preview:', err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment, downloadPath]);

  if (!attachment) return null;

  const handleDownload = () => {
    if (!objectUrl) return;
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = attachment.originalFilename;
    anchor.click();
  };

  const renderBody = () => {
    if (failed) {
      return (
        <div className="flex flex-col gap-2 items-center py-10 text-sm text-muted-foreground">
          <FileText className="w-8 h-8" />
          Could not load the preview — try downloading instead.
        </div>
      );
    }
    if (!objectUrl) {
      return (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      );
    }
    const { mimeType, originalFilename } = attachment;
    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={objectUrl}
          alt={originalFilename}
          className="max-w-full max-h-[75vh] mx-auto object-contain"
        />
      );
    }
    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={objectUrl}
          title={originalFilename}
          className="w-full h-[75vh] rounded-b-lg border-0 bg-muted/30"
        />
      );
    }
    if (mimeType.startsWith('video/')) {
      // eslint-disable-next-line jsx-a11y/media-has-caption -- customer-sent file; no captions exist
      return <video src={objectUrl} controls className="max-w-full max-h-[75vh] mx-auto" />;
    }
    if (mimeType.startsWith('audio/')) {
      // eslint-disable-next-line jsx-a11y/media-has-caption -- customer-sent file; no captions exist
      return <audio src={objectUrl} controls className="mx-auto my-10 w-full max-w-md" />;
    }
    // Unreachable when callers gate on isPreviewable; kept as a safe fallback.
    return (
      <div className="flex flex-col gap-2 items-center py-10 text-sm text-muted-foreground">
        <FileText className="w-8 h-8" />
        No preview available for this file type.
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} size="full">
      <DialogHeader className="px-3">
        <DialogTitle className="text-sm font-medium truncate">
          <span title={attachment.originalFilename}>{attachment.originalFilename}</span>
        </DialogTitle>
        <div className="flex gap-1 items-center shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!objectUrl}
            aria-label="Download"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
          <DialogClose onClose={onClose} />
        </div>
      </DialogHeader>
      {renderBody()}
    </Dialog>
  );
};
