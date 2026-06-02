import { useState } from 'react';
import { StickyNote, Pencil, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import RichTextEditor from '@/components/shared/RichTextEditor';
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
      <StickyNote className="w-3.5 h-3.5 text-muted-foreground dark:text-amber-500 flex-shrink-0 mt-1" />
      <div className="flex flex-col flex-1 max-w-[90%]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/55 dark:text-amber-400">
            INTERNAL NOTE · {who} · {relativeTime(note.createdAt)}
          </span>
          {isOwner && !isEditing && (
            <div className="flex gap-1 items-center ml-auto">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditContent(note.content);
                }}
                className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="text-amber-700 hover:text-red-600 dark:text-amber-400 dark:hover:text-red-400 disabled:opacity-40"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-1">
            <div className="rounded border border-l-2 border-l-amber-400 border-border dark:border-amber-700 dark:bg-amber-900/10">
              <RichTextEditor
                content={editContent}
                onChange={setEditContent}
                placeholder="Edit note…"
                minHeight="52px"
                className="rounded-none border-0 shadow-none"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => void handleSave()}
                className="text-[10px] font-mono text-muted-foreground hover:text-foreground dark:text-amber-600 dark:hover:text-amber-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent('');
                }}
                className="text-[10px] text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg px-3 py-2 border-l-2 border-l-amber-400 border border-border bg-card dark:border-amber-700/40 dark:bg-amber-300/5 text-foreground dark:text-amber-50/90 text-[12px] leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content, { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre'], ALLOWED_ATTR: [] }) }}
          />
        )}
      </div>
    </div>
  );
}
