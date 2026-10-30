import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Download,
  Eye,
  File as FileIcon,
  Lock,
  Paperclip,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import RichTextEditor from '@/components/shared/LazyRichTextEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiClient } from '@/lib/api-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { formatDate } from '@/lib/utils';
import {
  AttachmentPreviewDialog,
  isPreviewable,
} from '@/components/shared/AttachmentPreviewDialog';
import { commentsService, type Attachment, type Comment } from '@/services/comments.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

type TicketCommentsProps = {
  ticketId: number;
  hasJiraLink: boolean;
  onCountChange?: (count: number) => void;
};

export const TicketComments = ({ ticketId, hasJiraLink, onCountChange }: TicketCommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const currentUserRole = useAuthStore((state) => state.user?.role ?? null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await commentsService.getAll(ticketId);
      if (response.success && response.data) {
        setComments(response.data);
        onCountChange?.(response.data.length);
      }
    } catch (error) {
      logger.error('Failed to fetch comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId, onCountChange]);

  useEffect(() => {
    fetchComments().catch((error) => {
      logger.error('Failed to fetch comments:', error);
    });

    // Set up WebSocket connection and listen for comment events
    getSocket();

    const handleCommentEvent = (data: unknown) => {
      const eventData = data as { ticketId: number; commentId: number };
      // Only refresh if the event is for this ticket
      if (eventData.ticketId === ticketId) {
        fetchComments().catch((error) => {
          logger.error('Failed to fetch comments:', error);
        });
      }
    };

    subscribeToEvent('comment:created', handleCommentEvent);
    subscribeToEvent('comment:updated', handleCommentEvent);
    subscribeToEvent('comment:deleted', handleCommentEvent);
    subscribeToEvent('ticket:comments:updated', handleCommentEvent);

    // Polling fallback for Jira-linked tickets (in case webhooks fail)
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (hasJiraLink) {
      pollInterval = setInterval(() => {
        void commentsService
          .syncFromJira(ticketId)
          .then(() => fetchComments())
          .catch((error: unknown) => logger.error('Background sync failed:', error));
      }, 60000); // Poll every 60 seconds
    }

    return () => {
      unsubscribeFromEvent('comment:created', handleCommentEvent);
      unsubscribeFromEvent('comment:updated', handleCommentEvent);
      unsubscribeFromEvent('comment:deleted', handleCommentEvent);
      unsubscribeFromEvent('ticket:comments:updated', handleCommentEvent);
      releaseSocket();
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [ticketId, hasJiraLink, fetchComments]);

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await commentsService.create(ticketId, newComment.trim(), isInternal);
      if (response.success && response.data) {
        // If files are selected, upload them to the newly created comment
        if (selectedFiles.length > 0) {
          try {
            await commentsService.uploadAttachments(response.data.id, selectedFiles);
          } catch (uploadError: unknown) {
            logger.error('Failed to upload attachments:', uploadError);
            toast.warning('Comment created, but attachment upload failed', {
              description: uploadError instanceof Error ? uploadError.message : undefined,
            });
          }
        }
        setNewComment('');
        setIsInternal(false);
        setSelectedFiles([]);
        await fetchComments(); // Refresh comments immediately
      }
    } catch (error) {
      logger.error('Failed to add comment:', error);
      toast.failure('add comment', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditStart = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleEditSave = async (commentId: number) => {
    if (!editContent.trim()) {
      return;
    }

    try {
      const response = await commentsService.update(commentId, editContent.trim());
      if (response.success) {
        setEditingId(null);
        setEditContent('');
        await fetchComments(); // Refresh immediately
      }
    } catch (error: unknown) {
      logger.error('Failed to update comment:', error);
      toast.failure('update comment', error);
    }
  };

  const handleDeleteClick = (commentId: number) => {
    setCommentToDelete(commentId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!commentToDelete) {
      return;
    }

    try {
      await commentsService.delete(commentToDelete);
      setDeleteDialogOpen(false);
      setCommentToDelete(null);
      await fetchComments(); // Refresh immediately
    } catch (error: unknown) {
      logger.error('Failed to delete comment:', error);
      toast.failure('delete comment', error);
      setDeleteDialogOpen(false);
      setCommentToDelete(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    setSelectedFiles((prev) => [...prev, ...picked]);
    event.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSyncFromJira = async () => {
    try {
      setIsSyncing(true);
      await commentsService.syncFromJira(ticketId);
      await fetchComments();
    } catch (error: unknown) {
      logger.error('Failed to sync comments:', error);
      toast.failure('sync comments from Jira', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmDeleteAttachment = (attachmentId: number) => {
    setAttachmentToDelete(attachmentId);
    setDeleteAttachmentDialogOpen(true);
  };

  const handleDeleteAttachment = async () => {
    if (!attachmentToDelete) {
      return;
    }

    try {
      await commentsService.deleteAttachment(attachmentToDelete);
      await fetchComments(); // Refresh immediately
      setDeleteAttachmentDialogOpen(false);
      setAttachmentToDelete(null);
    } catch (error: unknown) {
      logger.error('Failed to delete attachment:', error);
      toast.failure('delete attachment', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Check if current user can edit/delete a comment
  const canEditComment = (comment: Comment) => {
    // Jira comments cannot be edited or deleted from the app
    if (comment.source === 'jira') {
      return false;
    }
    // Admins can edit/delete any app comment
    if (currentUserRole === 'admin') {
      return true;
    }
    // Users can only edit/delete their own comments
    return comment.userId === currentUserId;
  };

  const authorOf = (comment: Comment) =>
    comment.user
      ? `${comment.user.firstName}${comment.user.lastName ? ' ' + comment.user.lastName : ''}`
      : comment.authorName;

  const download = (attachment: Attachment) => {
    void apiClient
      .get(`/api/attachments/${attachment.id}/download`, { responseType: 'blob' })
      .then((response) => {
        const url = URL.createObjectURL(response.data as Blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.originalFilename;
        anchor.click();
        URL.revokeObjectURL(url);
      });
  };

  const iconButton = 'p-0 w-7 h-7 text-muted-foreground hover:text-foreground';

  return (
    <div className="space-y-3">
      {hasJiraLink && (
        <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSyncFromJira()}
            isLoading={isSyncing}
            disabled={isSyncing}
          >
            <RefreshCw className="mr-1 w-3 h-3" aria-hidden />
            Sync from Jira
          </Button>
          <span>Syncs from Jira every 60 s.</span>
        </div>
      )}

      {isLoading ? (
        <p className="py-7 text-sm text-center text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="py-7 text-sm text-center text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={`group/cm p-3 rounded-[10px] border ${
                comment.isInternal ? 'bg-note-muted border-note-line' : 'bg-card border-border'
              }`}
            >
              {editingId === comment.id ? (
                <div className="space-y-2">
                  <RichTextEditor
                    content={editContent}
                    onChange={setEditContent}
                    placeholder="Edit comment…"
                    minHeight="80px"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void handleEditSave(comment.id)}
                      disabled={!editContent.trim()}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleEditCancel}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 items-center mb-1.5 text-[12.5px]">
                    <span className="font-semibold text-foreground">{authorOf(comment)}</span>
                    {comment.isInternal && (
                      <Badge variant="note" size="sm">
                        <Lock className="mr-1 w-3 h-3" aria-hidden />
                        Internal
                      </Badge>
                    )}
                    {comment.source === 'jira' && (
                      <Badge variant="secondary" size="sm">
                        Jira
                      </Badge>
                    )}
                    {comment.metadata?.senderType === 'bot' && (
                      <Badge variant="secondary" size="sm">
                        Bot
                      </Badge>
                    )}
                    <span className="flex-1" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDate(comment.createdAt)}
                    </span>
                    {canEditComment(comment) && (
                      <span className="flex gap-0.5 opacity-0 transition-opacity group-hover/cm:opacity-100 focus-within:opacity-100">
                        <Tooltip content="Edit comment" size="sm">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit comment"
                            onClick={() => handleEditStart(comment)}
                            className={iconButton}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Delete comment" size="sm">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete comment"
                            onClick={() => handleDeleteClick(comment.id)}
                            className={`${iconButton} hover:text-destructive`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                      </span>
                    )}
                  </div>
                  <div
                    className="max-w-none text-sm prose prose-sm text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(comment.content, {
                        ALLOWED_TAGS: [
                          'p',
                          'br',
                          'b',
                          'i',
                          'u',
                          'strong',
                          'em',
                          'ul',
                          'ol',
                          'li',
                          'code',
                          'pre',
                        ],
                        ALLOWED_ATTR: [],
                      }),
                    }}
                  />
                  {comment.attachments && comment.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {comment.attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex gap-2 items-center py-1 pr-1 pl-2.5 rounded-lg border border-border bg-background text-[12.5px]"
                        >
                          <FileIcon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                          <span className="flex-1 min-w-0 truncate">
                            {attachment.originalFilename}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)}
                          </span>
                          {isPreviewable(attachment.mimeType) && (
                            <Tooltip content="Preview" size="sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Preview attachment"
                                onClick={() => setPreviewAttachment(attachment)}
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
                              aria-label="Download attachment"
                              onClick={() => download(attachment)}
                              className={iconButton}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </Tooltip>
                          {canEditComment(comment) && (
                            <Tooltip content="Remove attachment" size="sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Remove attachment"
                                onClick={() => confirmDeleteAttachment(attachment.id)}
                                className={`${iconButton} hover:text-destructive`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </Tooltip>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* New comment: unboxed, as the design — the note colour only while "Internal note" is ticked. */}
      <div
        className={`space-y-2 ${
          isInternal ? 'p-2.5 rounded-[10px] border bg-note-muted border-note-line' : ''
        }`}
      >
        <RichTextEditor
          content={newComment}
          onChange={setNewComment}
          placeholder={isInternal ? 'Internal note — only your team sees this' : 'Add a comment…'}
          minHeight="80px"
          initiallyHidden={false}
          editable={!isSubmitting}
        />
        {selectedFiles.length > 0 && (
          <ul className="space-y-1">
            {selectedFiles.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex gap-2 items-center py-1 pr-1 pl-2.5 rounded-lg border border-border bg-background text-[12.5px]"
              >
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                <span className="flex-1 min-w-0 truncate">{file.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => handleRemoveFile(index)}
                  className={`${iconButton} hover:text-destructive`}
                  disabled={isSubmitting}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <Checkbox
            checked={isInternal}
            onChange={(event) => setIsInternal(event.target.checked)}
            disabled={isSubmitting}
            label={hasJiraLink ? 'Internal note — not synced to Jira' : 'Internal note'}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <Paperclip className="mr-1 w-3 h-3" aria-hidden />
            Attach
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Attach files to the comment"
            disabled={isSubmitting}
          />
          <span className="flex-1" />
          {!isInternal && hasJiraLink && (
            <span className="text-xs text-muted-foreground">Also posted to Jira</span>
          )}
          <Button
            onClick={() => void handleAddComment()}
            disabled={!newComment.trim() || isSubmitting}
            isLoading={isSubmitting}
            size="sm"
          >
            <Send className="mr-1 w-3 h-3" aria-hidden />
            {isInternal ? 'Add note' : 'Post comment'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setCommentToDelete(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        title="Delete this comment?"
        description="This can’t be undone."
        confirmText="Delete"
      />
      <ConfirmDialog
        open={deleteAttachmentDialogOpen}
        onOpenChange={(open) => {
          setDeleteAttachmentDialogOpen(open);
          if (!open) setAttachmentToDelete(null);
        }}
        onConfirm={() => void handleDeleteAttachment()}
        title="Remove this file?"
        description="It is deleted from the comment. This can’t be undone."
        confirmText="Remove"
      />

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
};
