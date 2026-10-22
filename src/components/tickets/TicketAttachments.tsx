import { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip, Download, File as FileIcon, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiClient } from '@/lib/api-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { commentsService, type Attachment } from '@/services/comments.service';
import {
  AttachmentPreviewDialog,
  isPreviewable,
} from '@/components/shared/AttachmentPreviewDialog';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

type TicketAttachmentsProps = {
  ticketId: number;
  /** For the Files tab's count. */
  onCountChange?: (count: number) => void;
};

export const TicketAttachments = ({ ticketId, onCountChange }: TicketAttachmentsProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  useEffect(() => {
    onCountChange?.(attachments.length);
  }, [attachments, onCountChange]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ id: number; name: string } | null>(
    null
  );

  const [imageBlobUrls, setImageBlobUrls] = useState<Record<number, string>>({});

  const fetchAttachments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await commentsService.getTicketAttachments(ticketId);
      if (response.success && response.data) {
        setAttachments(response.data);
      }
    } catch (error) {
      logger.error('Failed to fetch ticket attachments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  // Effect 1: socket lifecycle — keyed only to ticketId so a change in
  // fetchAttachments identity never causes a spurious socket reconnect.
  useEffect(() => {
    getSocket();
    return () => releaseSocket();
  }, [ticketId]);

  // Effect 2: data fetch + event subscription
  useEffect(() => {
    fetchAttachments().catch((error) => {
      logger.error('Failed to fetch attachments:', error);
    });

    const handleUpdate = (data: unknown) => {
      const eventData = data as { ticketId: number };
      if (eventData.ticketId === ticketId) {
        fetchAttachments().catch((error) => {
          logger.error('Failed to refresh attachments:', error);
        });
      }
    };

    subscribeToEvent('ticket:comments:updated', handleUpdate);

    return () => {
      unsubscribeFromEvent('ticket:comments:updated', handleUpdate);
    };
  }, [ticketId, fetchAttachments]);

  // Load blob URLs for image thumbnails via authenticated fetch
  useEffect(() => {
    const imageAttachments = attachments.filter((att) => att.mimeType.startsWith('image/'));
    if (imageAttachments.length === 0) return;

    const blobUrls: Record<number, string> = {};
    let cancelled = false;

    const load = async () => {
      for (const attachment of imageAttachments) {
        if (cancelled) break;
        try {
          const path =
            attachment.externalId && attachment.url.startsWith('http')
              ? `/api/attachments/jira/${attachment.id}/download`
              : `/api/attachments/${attachment.id}/download`;
          const response = await apiClient.get(path, { responseType: 'blob' });
          blobUrls[attachment.id] = URL.createObjectURL(response.data as Blob);
        } catch {
          // thumbnail load failure is non-fatal — icon fallback renders instead
        }
      }
      if (!cancelled) setImageBlobUrls(blobUrls);
    };

    void load();

    return () => {
      cancelled = true;
      Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  // Where the file came from, as the design's Files list says it ("On the ticket", a comment…).
  const getAttachmentSource = (attachment: Attachment) => {
    // An external URL is a Jira-hosted file.
    if (attachment.url.startsWith('http')) return 'From Jira';
    // A local file with the email- prefix came in with the customer's email.
    if (attachment.url.includes('email-')) return 'From the email';
    return attachment.commentId ? 'On a comment' : 'On the ticket';
  };

  // A pick uploads at once — the design's "Add files" has no second Upload step.
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    try {
      setIsUploading(true);
      const formData = new FormData();
      picked.forEach((file) => formData.append('files', file));
      await apiClient.post(`/api/tickets/${ticketId}/attachments`, formData);
      await fetchAttachments();
    } catch (error) {
      logger.error('Failed to upload attachments:', error);
      toast.failure('upload attachments', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const isJira = attachment.externalId && attachment.url.startsWith('http');
      const path = isJira
        ? `/api/attachments/jira/${attachment.id}/download`
        : `/api/attachments/${attachment.id}/download`;
      const response = await apiClient.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.originalFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Failed to download attachment:', error);
      toast.failure('download attachment', error);
    }
  };

  const handleDeleteClick = (attachmentId: number, filename: string) => {
    setAttachmentToDelete({ id: attachmentId, name: filename });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!attachmentToDelete) {
      return;
    }

    try {
      await apiClient.delete(`/api/attachments/${attachmentToDelete.id}`);

      setDeleteDialogOpen(false);
      setAttachmentToDelete(null);
      await fetchAttachments(); // Refresh list
    } catch (error: unknown) {
      logger.error('Failed to delete attachment:', error);
      toast.failure('delete attachment', error);
      setDeleteDialogOpen(false);
      setAttachmentToDelete(null);
    }
  };

  const iconButton = 'p-0 w-7 h-7 text-muted-foreground hover:text-foreground';

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <span className="text-xs text-muted-foreground">Files on the ticket and its comments.</span>
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          isLoading={isUploading}
          disabled={isUploading}
        >
          <Paperclip className="mr-1 w-3 h-3" aria-hidden />
          Add files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(event) => void handleFileSelect(event)}
          className="hidden"
          aria-label="Add files to the ticket"
        />
      </div>

      <Card padding="none" className="overflow-hidden rounded-[10px] shadow-none">
        {isLoading ? (
          <p className="py-6 text-sm text-center text-muted-foreground">Loading files…</p>
        ) : attachments.length === 0 ? (
          <p className="py-6 text-sm text-center text-muted-foreground">No files on this ticket.</p>
        ) : (
          <ul className="divide-y divide-border">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 items-center px-3 py-2"
              >
                {isImage(attachment.mimeType) && imageBlobUrls[attachment.id] ? (
                  <img
                    src={imageBlobUrls[attachment.id]}
                    alt=""
                    className="object-cover w-7 h-7 rounded"
                  />
                ) : (
                  <FileIcon
                    className="justify-self-center w-4 h-4 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate text-foreground">
                    {attachment.originalFilename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getAttachmentSource(attachment)} ·{' '}
                    <span className="font-mono">{formatFileSize(attachment.size)}</span> ·{' '}
                    {new Date(attachment.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex gap-0.5 items-center">
                  {isPreviewable(attachment.mimeType) && (
                    <Tooltip content="Preview" size="sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewAttachment(attachment)}
                        aria-label="Preview"
                        className={iconButton}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip content="Download" size="sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDownload(attachment)}
                      aria-label="Download"
                      className={iconButton}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                  {/* Jira-hosted files are deleted in Jira; local uploads and email files here. */}
                  {!attachment.url.startsWith('http') && (
                    <Tooltip content="Delete" size="sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleDeleteClick(attachment.id, attachment.originalFilename)
                        }
                        aria-label="Delete"
                        className={`${iconButton} hover:text-destructive`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setAttachmentToDelete(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        title={`Delete “${attachmentToDelete?.name ?? 'this file'}”?`}
        description={
          attachmentToDelete &&
          attachments.find((att) => att.id === attachmentToDelete.id)?.externalId
            ? 'It is also deleted from Jira. This can’t be undone.'
            : 'This can’t be undone.'
        }
        confirmText="Delete"
      />

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        jiraHosted={Boolean(
          previewAttachment?.externalId && previewAttachment.url.startsWith('http')
        )}
      />
    </div>
  );
};
