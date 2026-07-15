import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { formatDate } from '@/lib/utils';
import type { ContactNote } from '@/services/contact.service';

// Contact-level notes list + add form. Shared between the standalone Contact
// profile (ContactProfileDetails) and the message-detail CUSTOMER tab so both
// render the exact same notes UI. Consumers own the header and the state/handlers
// (notes fetch, add, delete) and pass them in.
export type ContactNotesPanelProps = {
  notes: ContactNote[];
  noteInput: string;
  setNoteInput: (val: string) => void;
  addingNote: boolean;
  onAddNote: () => void;
  onDeleteNote: (noteId: number) => void;
};

export function ContactNotesPanel({
  notes,
  noteInput,
  setNoteInput,
  addingNote,
  onAddNote,
  onDeleteNote,
}: ContactNotesPanelProps) {
  return (
    <div className="space-y-2">
      {notes.map((note) => (
        <div
          key={note.id}
          className="p-2.5 rounded-lg border group bg-amber-50/60 dark:bg-amber-500/5 border-amber-100 dark:border-amber-500/15"
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] font-semibold text-foreground">
              {note.authorFirstName ?? 'Unknown'} {note.authorLastName ?? ''}
            </span>
            <div className="flex gap-2 items-center">
              <span className="text-[10.5px] text-muted-foreground">{formatDate(note.createdAt)}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => onDeleteNote(note.id)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground">{note.content}</p>
        </div>
      ))}
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <div className="flex gap-2 items-start">
        <Textarea
          className="flex-1 resize-none"
          rows={2}
          placeholder="Add a note… (Ctrl+Enter to save)"
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onAddNote();
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          className="self-end"
          onClick={onAddNote}
          disabled={addingNote || !noteInput.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
