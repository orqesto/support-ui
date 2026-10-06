import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { kbService, type KBEntry } from '@/services/kb.service';
import { isCaseRow, mayRemoveCase } from '@/lib/kbConsolidation';
import {
  editableQaOf,
  editCanSave,
  editSaveBody,
  QA_DRIFT_NOTE,
  type EditStart,
} from '@/lib/kbQaText';

type KBEntryEditDialogProps = {
  /** The entry to edit; null = closed. */
  entry: KBEntry | null;
  /** True once `entry` is the detail route's FULL text (not the list's cut). */
  detailLoaded: boolean;
  onClose: () => void;
  /** The entry as the server saved it. */
  onSaved: (entry: KBEntry) => void;
};

/**
 * The KB entry editor — extracted from the detail drawer (KBEntryDetail) so the KB cases worklist
 * edits an entry with the SAME dialog. Its starting values are taken when it opens: a Q&A entry
 * is edited as question + answer (what AI drafts read), anything else as content.
 */
export const KBEntryEditDialog = ({
  entry,
  detailLoaded,
  onClose,
  onSaved,
}: KBEntryEditDialogProps) =>
  entry ? (
    <OpenEditDialog entry={entry} detailLoaded={detailLoaded} onClose={onClose} onSaved={onSaved} />
  ) : null;

const OpenEditDialog = ({
  entry,
  detailLoaded,
  onClose,
  onSaved,
}: KBEntryEditDialogProps & { entry: KBEntry }) => {
  // The Q&A edit's baseline: the halves AI drafts read, how the shown text relates, the start values.
  const [editStart] = useState<EditStart>(() => ({
    title: entry.title,
    category: entry.category,
    content: entry.content,
    qa: editableQaOf(entry, detailLoaded),
  }));
  // A Q&A entry is edited as question + answer (sent as such); anything else as content.
  const editsQa = editStart.qa !== null;
  const [editForm, setEditForm] = useState(() => ({
    title: entry.title,
    content: entry.content,
    category: entry.category ?? '',
    question: editStart.qa?.question ?? '',
    answer: editStart.qa?.answer ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const response = await kbService.update(entry.id, editSaveBody(editForm, editStart));
      if (response.success && response.data) onSaved(response.data);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Failed to update entry. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit KB Entry</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent>
        {editError && (
          <div className="p-3 mb-4 text-sm text-destructive bg-destructive-muted rounded border border-destructive-line">
            {editError}
          </div>
        )}
        {editStart.qa && editStart.qa.drift !== 'none' && (
          <p className="mb-4 text-sm text-muted-foreground">{QA_DRIFT_NOTE[editStart.qa.drift]}</p>
        )}
        {isCaseRow(entry) && (
          <p className="mb-4 text-sm text-muted-foreground">
            This is a merged case. Edit its wording here; to change what this case is about,
            {mayRemoveCase(entry)
              ? ' Unmerge it.'
              : ' only a moderator covering every department it serves, or an org admin, can Unmerge it.'}
          </p>
        )}
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-title" className="block mb-1 text-sm font-medium">
              Title
            </label>
            <Input
              id="edit-title"
              value={editForm.title}
              onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
              placeholder="Entry title"
            />
          </div>
          <div>
            <label htmlFor="edit-category" className="block mb-1 text-sm font-medium">
              Category
            </label>
            <Input
              id="edit-category"
              value={editForm.category}
              onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
              placeholder="Category"
            />
          </div>
          {editsQa ? (
            <>
              <div>
                <label htmlFor="edit-question" className="block mb-1 text-sm font-medium">
                  Question
                </label>
                <Textarea
                  id="edit-question"
                  value={editForm.question}
                  onChange={(event) => setEditForm({ ...editForm, question: event.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="edit-answer" className="block mb-1 text-sm font-medium">
                  Answer
                </label>
                <Textarea
                  id="edit-answer"
                  value={editForm.answer}
                  onChange={(event) => setEditForm({ ...editForm, answer: event.target.value })}
                  rows={8}
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="edit-content" className="block mb-1 text-sm font-medium">
                Content
              </label>
              <Textarea
                id="edit-content"
                value={editForm.content}
                onChange={(event) => setEditForm({ ...editForm, content: event.target.value })}
                placeholder="Entry content"
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSaveEdit()}
          isLoading={saving}
          disabled={!editCanSave(editForm, editStart)}
        >
          Save Changes
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
