import { useState } from 'react';
import { StickyNote, Pencil, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/Button';
import { messageService, type MessageNote } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { relativeTime } from './messageDetailConstants';

type Props = {
  note: MessageNote;
  messageId: number;
  currentUserId: number | null;
  onUpdated: (noteId: number, content: string) => void;
  onDeleted: (noteId: number) => void;
};

export function InlineNoteBubble({ note, messageId, currentUserId, onUpdated, onDeleted }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isOwner = currentUserId !== null && currentUserId === note.userId;
  const who = note.user
    ? `${note.user.firstName}${note.user.lastName ? ' ' + note.user.lastName : ''}`
    : note.authorName;

  const handleSave = async () => {
    if (!editContent || editContent === '<p></p>') return;
    try {
      const res = await messageService.updateNote(messageId, note.id, editContent);
      if (res.success) {
        onUpdated(note.id, editContent);
        setIsEditing(false);
        setEditContent('');
      }
    } catch (err) {
      logger.error('Failed to update note:', err);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const res = await messageService.deleteNote(messageId, note.id);
      if (res.success) onDeleted(note.id);
    } catch (err) {
      logger.error('Failed to delete note:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <StickyNote className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" />
      <div className="flex flex-col flex-1 max-w-[90%]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-display text-[9px] uppercase tracking-widest text-foreground/55 font-medium">
            INTERNAL NOTE · {who} · {relativeTime(note.createdAt)}
          </span>
          {isOwner && !isEditing && (
            <div className="flex gap-1 items-center ml-auto">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit note"
                onClick={() => {
                  setIsEditing(true);
                  setEditContent(note.content);
                }}
                className="p-0 w-auto h-auto text-note hover:text-note"
              >
                <Pencil className="w-2.5 h-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete note"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="p-0 w-auto h-auto text-note hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-1">
            <div className="rounded border border-l-2 border-l-note-line border-border dark:bg-note-muted">
              <RichTextEditor
                content={editContent}
                onChange={setEditContent}
                placeholder="Edit note…"
                minHeight="52px"
                className="rounded-none border-0 shadow-none"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleSave()}
                className="p-0 h-auto text-[10px] font-mono text-muted-foreground hover:text-foreground"
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent('');
                }}
                className="p-0 h-auto text-[10px] text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg px-3 py-2 border-l-2 border-l-note-line border border-border bg-card text-foreground text-[12px] leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content, { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre'], ALLOWED_ATTR: [] }) }}
          />
        )}
      </div>
    </div>
  );
}
