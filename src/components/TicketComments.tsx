import { useState, useEffect } from 'react';
import { commentsService } from '../services/comments.service';
import type { Comment } from '../services/comments.service';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatDate } from '../lib/utils';
import { MessageSquare, RefreshCw, Send, Lock } from 'lucide-react';

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
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchComments = async () => {
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
  };

  useEffect(() => {
    fetchComments();
  }, [ticketId]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      setIsSubmitting(true);
      const response = await commentsService.create(ticketId, newComment.trim(), isInternal);
      if (response.success) {
        setNewComment('');
        setIsInternal(false);
        await fetchComments();
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    if (!hasJiraLink) return;

    try {
      setIsSyncing(true);
      const response = await commentsService.sync(ticketId);
      if (response.success && response.data) {
        setComments(response.data);
      }
    } catch (error) {
      console.error('Failed to sync comments:', error);
      alert('Failed to sync comments from Jira');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddComment();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquare className="w-5 h-5" />
          Comments ({comments.length})
        </h3>
        {hasJiraLink && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            isLoading={isSyncing}
            disabled={isSyncing}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Sync from Jira
          </Button>
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
                comment.isInternal ? 'bg-yellow-50 border-yellow-200' : 'bg-white'
              }`}
            >
              {/* Comment Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
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
                        <Lock className="w-3 h-3 mr-1" />
                        Internal
                      </Badge>
                    )}
                  </div>
                  {comment.user && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{comment.user.email}</span>
                      {comment.user.organization && (
                        <>
                          <span>•</span>
                          <span>{comment.user.organization}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(comment.createdAt)}
                </span>
              </div>

              {/* Comment Content */}
              <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <div className="pt-4 border-t">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Add a comment... (Cmd/Ctrl+Enter to submit)"
          className="w-full px-3 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          disabled={isSubmitting}
        />

        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded"
              disabled={isSubmitting}
            />
            <span className="text-muted-foreground">
              Internal note (won't sync to Jira)
            </span>
          </label>

          <Button
            onClick={handleAddComment}
            disabled={!newComment.trim() || isSubmitting}
            isLoading={isSubmitting}
            size="sm"
          >
            <Send className="w-3 h-3 mr-1" />
            Post Comment
          </Button>
        </div>

        {!isInternal && hasJiraLink && (
          <p className="mt-2 text-xs text-muted-foreground">
            💡 This comment will be posted to Jira automatically
          </p>
        )}
      </div>
    </div>
  );
};
