import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { messageService, type MessageNote } from '@/services/message.service';
import { logger } from '@/lib/logger';

type MessageNotesProps = {
  messageId: number;
};

export const MessageNotes = ({ messageId }: MessageNotesProps) => {
  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20"
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
                <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add an internal note..."
          rows={2}
          disabled={isSubmitting}
          className="flex-1 px-3 py-2 text-sm rounded-md border resize-none bg-background border-input focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
