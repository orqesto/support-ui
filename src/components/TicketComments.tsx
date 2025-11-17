import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Edit2,
  Trash2,
  Check,
  X,
  Download,
  Paperclip,
  Lock,
  File,
  RefreshCw,
} from 'lucide-react';
import RichTextEditor from '@/components/RichTextEditor';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { API_BASE_URL, getAuthToken } from '@/lib/config';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { formatDate } from '@/lib/utils';
import { commentsService, type Comment } from '@/services/comments.service';

type TicketCommentsProps = {
  ticketId: number;
  hasJiraLink: boolean;
};

export const TicketComments = ({ ticketId, hasJiraLink }: TicketCommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await commentsService.getAll(ticketId);
      if (response.success && response.data) {
        setComments(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    // Get current user from token
    const token = getAuthToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1])) as {
          userId: number;
          role: string;
        };
        setCurrentUserId(payload.userId);
        setCurrentUserRole(payload.role);
      } catch (e) {
        console.error('Failed to parse token:', e);
      }
    }

    fetchComments().catch((error) => {
      console.error('Failed to fetch comments:', error);
    });

    // Set up WebSocket connection and listen for comment events
    getSocket();

    const handleCommentEvent = (data: unknown) => {
      const eventData = data as { ticketId: number; commentId: number };
      // Only refresh if the event is for this ticket
      if (eventData.ticketId === ticketId) {
        // eslint-disable-next-line no-console
        console.log('💬 Comment event received, refreshing...');
        fetchComments().catch((error) => {
          console.error('Failed to fetch comments:', error);
        });
      }
    };

    subscribeToEvent('comment:created', handleCommentEvent);
    subscribeToEvent('comment:updated', handleCommentEvent);
    subscribeToEvent('comment:deleted', handleCommentEvent);
    subscribeToEvent('ticket:comments:updated', handleCommentEvent);

    // Polling fallback for Jira-linked tickets (in case webhooks fail)
    let pollInterval: number | null = null;
    if (hasJiraLink) {
      pollInterval = setInterval(async () => {
        // eslint-disable-next-line no-console
        console.log('🔄 Polling for comment updates from Jira...');
        try {
          await commentsService.syncFromJira(ticketId);
          await fetchComments();
        } catch (error) {
          console.error('Background sync failed:', error);
        }
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
            console.error('Failed to upload attachments:', uploadError);
            const errorMsg = uploadError instanceof Error ? uploadError.message : 'Unknown error';
            setAlertDialog({
              open: true,
              title: 'Attachment Upload Failed',
              description: `Comment created but failed to upload attachments: ${errorMsg}`,
              variant: 'warning',
            });
          }
        }
        setNewComment('');
        setIsInternal(false);
        setSelectedFiles([]);
        await fetchComments(); // Refresh comments immediately
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      setAlertDialog({
        open: true,
        title: 'Comment Failed',
        description: 'Failed to add comment. Please try again.',
        variant: 'error',
      });
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
      console.error('Failed to update comment:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to update comment. Please try again.';
      setAlertDialog({
        open: true,
        title: 'Update Failed',
        description: errorMsg,
        variant: 'error',
      });
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
      console.error('Failed to delete comment:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to delete comment. Please try again.';
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: errorMsg,
        variant: 'error',
      });
      setDeleteDialogOpen(false);
      setCommentToDelete(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSyncFromJira = async () => {
    try {
      setIsSyncing(true);
      await commentsService.syncFromJira(ticketId);
      await fetchComments();
    } catch (error: unknown) {
      console.error('Failed to sync comments:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to sync comments from Jira';
      setAlertDialog({
        open: true,
        title: 'Sync Failed',
        description: errorMsg,
        variant: 'error',
      });
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
      console.error('Failed to delete attachment:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to delete attachment. Please try again.';
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: errorMsg,
        variant: 'error',
      });
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="flex gap-2 items-center text-lg font-semibold">
          <MessageSquare className="w-5 h-5" />
          Comments ({comments.length})
        </h3>
        {hasJiraLink && (
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncFromJira}
              isLoading={isSyncing}
              disabled={isSyncing}
            >
              <RefreshCw className="mr-1 w-3 h-3" />
              Sync from Jira
            </Button>
            <span className="text-xs text-muted-foreground">🔄 Auto-syncing every 60s</span>
          </div>
        )}
      </div>

      {/* Comments List */}
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No comments yet. Be the first to comment!
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`p-4 rounded-lg border ${
                comment.isInternal
                  ? 'bg-yellow-500/10 dark:bg-yellow-500/10 border-yellow-500/20'
                  : 'bg-card border-border'
              }`}
            >
              {/* Comment Header */}
              <div className="flex gap-2 justify-between items-start mb-2">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-sm font-semibold">
                      {comment.user
                        ? `${comment.user.firstName}${comment.user.lastName ? ' ' + comment.user.lastName : ''}`
                        : comment.authorName}
                    </span>
                    {comment.user?.position && (
                      <span className="text-xs text-muted-foreground">
                        • {comment.user.position}
                      </span>
                    )}
                    {comment.user && (
                      <Badge variant="default" className="text-xs">
                        {comment.user.role}
                      </Badge>
                    )}
                    {comment.source === 'jira' && (
                      <Badge variant="secondary" className="text-xs">
                        Jira
                      </Badge>
                    )}
                    {comment.isInternal && (
                      <Badge variant="warning" className="text-xs">
                        <Lock className="mr-1 w-3 h-3" />
                        Internal
                      </Badge>
                    )}
                  </div>
                  {comment.user && (
                    <div className="flex gap-2 items-center text-xs text-muted-foreground">
                      <span>{comment.user.email}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(comment.createdAt)}
                </span>
              </div>

              {/* Comment Content */}
              {editingId === comment.id ? (
                <div className="space-y-2">
                  <RichTextEditor
                    content={editContent}
                    onChange={setEditContent}
                    placeholder="Edit comment..."
                    minHeight="100px"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditSave(comment.id)}
                      disabled={!editContent.trim()}
                    >
                      <Check className="mr-1 w-3 h-3" />
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleEditCancel}>
                      <X className="mr-1 w-3 h-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: comment.content }} />
                  {/* Attachments */}
                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {comment.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex gap-2 items-center p-2 rounded border bg-muted border-border"
                        >
                          <File className="w-4 h-4 text-gray-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {attachment.originalFilename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.size)}
                            </p>
                          </div>
                          <a
                            href={`${API_BASE_URL}${attachment.url}`}
                            download={attachment.originalFilename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-accent"
                          >
                            <Download className="w-4 h-4 text-gray-600" />
                          </a>
                          {canEditComment(comment) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDeleteAttachment(attachment.id)}
                              className="p-1 text-red-600 rounded dark:text-red-400 hover:bg-red-500/10"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Edit/Delete Actions - For own comments or admin */}
                  {canEditComment(comment) && (
                    <div className="flex gap-2 pt-3 mt-3 border-t">
                      <Button size="sm" variant="ghost" onClick={() => handleEditStart(comment)}>
                        <Edit2 className="mr-1 w-3 h-3" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClick(comment.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="mr-1 w-3 h-3" />
                        Delete
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <div className="pt-4 border-t">
        <RichTextEditor
          content={newComment}
          onChange={setNewComment}
          placeholder="Add a comment... (formatting supported)"
          minHeight="120px"
          editable={!isSubmitting}
        />

        {/* Selected Files Display */}
        {selectedFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {selectedFiles.map((file, index) => (
              <div
                key={file.name}
                className="flex gap-2 items-center p-2 rounded border bg-muted border-border"
              >
                <Paperclip className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-sm truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                <Button
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 text-red-600 rounded dark:text-red-400 hover:bg-red-500/10"
                  disabled={isSubmitting}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-2">
          <div className="flex gap-3 items-center">
            <label className="flex gap-2 items-center text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded"
                disabled={isSubmitting}
              />
              <span className="text-muted-foreground">Internal note (won&apos;t sync to Jira)</span>
            </label>

            <label className="flex gap-1 items-center px-3 py-1 text-sm font-medium rounded-md border cursor-pointer text-foreground bg-input border-border hover:bg-accent">
              <Paperclip className="w-3 h-3" />
              Add Files
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                disabled={isSubmitting}
              />
            </label>
          </div>

          <Button
            onClick={handleAddComment}
            disabled={!newComment.trim() || isSubmitting}
            isLoading={isSubmitting}
            size="sm"
          >
            <Send className="mr-1 w-3 h-3" />
            Post Comment
          </Button>
        </div>

        {!isInternal && hasJiraLink && (
          <p className="mt-2 text-xs text-muted-foreground">
            💡 This comment will be posted to Jira automatically
          </p>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Comment</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <p className="mb-4 text-sm text-gray-600">
            Are you sure you want to delete this comment? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setCommentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Attachment Confirmation Dialog */}
      <Dialog open={deleteAttachmentDialogOpen} onOpenChange={setDeleteAttachmentDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Attachment</DialogTitle>
          <DialogClose onClose={() => setDeleteAttachmentDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-gray-700">Are you sure you want to delete this attachment?</p>
          <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDeleteAttachmentDialogOpen(false);
              setAttachmentToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteAttachment}>
            <Trash2 className="mr-2 w-4 h-4" />
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Alert Dialog */}
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
