import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Lock, Pencil, Trash2, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { getAuthToken } from '@/lib/config';
import { messageService, type MessageNote } from '@/services/message.service';
import { logger } from '@/lib/logger';

type MessageNotesProps = {
  messageId: number;
};

export const MessageNotes = ({ messageId }: MessageNotesProps) => {
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1])) as { userId: number };
        setCurrentUserId(payload.userId);
      } catch (err) {
        logger.error('Failed to parse token:', err);
      }
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await messageService.getNotes(messageId);
      if (response.success && response.data) {
        setNotes(response.data);
      }
    } catch (error) {
      logger.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      setIsSubmitting(true);
      const response = await messageService.addNote(messageId, newNote.trim());
      if (response.success) {
        setNewNote('');
        await fetchNotes();
      }
    } catch (error) {
      logger.error('Failed to add note:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (note: MessageNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (noteId: number) => {
    if (!editContent.trim()) return;
    try {
      const response = await messageService.updateNote(messageId, noteId, editContent.trim());
      if (response.success) {
        setNotes((prev) =>
          prev.map((note) => (note.id === noteId ? { ...note, content: editContent.trim() } : note))
        );
        setEditingId(null);
        setEditContent('');
      }
    } catch (error) {
      logger.error('Failed to update note:', error);
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      setDeletingId(noteId);
      const response = await messageService.deleteNote(messageId, noteId);
      if (response.success) {
        setNotes((prev) => prev.filter((note) => note.id !== noteId));
      }
    } catch (error) {
      logger.error('Failed to delete note:', error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="flex gap-2 items-center text-sm font-semibold text-muted-foreground">
        <MessageSquare className="w-4 h-4" />
        Internal Notes ({notes.length})
      </h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No internal notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const isOwner = currentUserId !== null && currentUserId === note.userId;
            const isEditing = editingId === note.id;
            const isDeleting = deletingId === note.id;

            return (
              <div
                key={note.id}
                className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20"
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-semibold">
                      {note.user
                        ? `${note.user.firstName}${note.user.lastName ? ' ' + note.user.lastName : ''}`
                        : note.authorName}
                    </span>
                    <Badge variant="warning" className="text-xs">
                      <Lock className="mr-1 w-3 h-3" />
                      Internal
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                    {isOwner && !isEditing && (
                      <>
                        <button
                          onClick={() => handleStartEdit(note)}
                          className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit note"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => void handleDelete(note.id)}
                          disabled={isDeleting}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="Delete note"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2 mt-1">
                    <textarea
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-md border resize-none bg-background border-input focus:outline-none focus:ring-1 focus:ring-ring"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void handleSaveEdit(note.id);
                        if (event.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 px-2 text-xs">
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveEdit(note.id)}
                        disabled={!editContent.trim()}
                        className="h-6 px-2 text-xs"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <textarea
          value={newNote}
          onChange={(event) => setNewNote(event.target.value)}
          placeholder="Add an internal note..."
          rows={2}
          disabled={isSubmitting}
          className="flex-1 px-3 py-2 text-sm rounded-md border resize-none bg-background border-input focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              void handleAddNote();
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleAddNote}
          disabled={!newNote.trim() || isSubmitting}
          isLoading={isSubmitting}
          className="self-end"
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};
