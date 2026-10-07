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
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { useDepartments } from '@/hooks/useDepartments';
import { getErrorBody } from '@/lib/errorMessages';
import { kbService, type KBEntry } from '@/services/kb.service';
import { isCaseRow, mayRemoveCase } from '@/lib/kbConsolidation';
import {
  editableQaOf,
  editCanSave,
  editSaveBody,
  QA_DRIFT_NOTE,
  type EditStart,
} from '@/lib/kbQaText';

/** The backend's refusal of a department change on an entry learned from a mailbox. */
const FOLLOWS_MAILBOX_CODE = 'KB_DEPARTMENT_FOLLOWS_MAILBOX';
export const FOLLOWS_MAILBOX_MESSAGE =
  'This entry comes from a mailbox; its department follows the mailbox.';

/**
 * Who sets the entry's department: `pick` — nobody but a person (no mailbox: an uploaded
 * document, a manual entry); `mailbox` — its mailbox; `unknown` — the entry arrived without
 * `messageSourceId` (a detail-route shape), so neither is claimed and no picker is offered.
 */
const departmentMode = (entry: KBEntry): 'pick' | 'mailbox' | 'unknown' => {
  if (entry.messageSourceId === null) return 'pick';
  if (typeof entry.messageSourceId === 'number') return 'mailbox';
  return 'unknown';
};

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

  // Department: picked by hand only on an entry with no mailbox (null until a pick). Sent only
  // when the pick differs from the entry's department.
  const deptMode = departmentMode(entry);
  const [pickedDepartment, setPickedDepartment] = useState<number | null>(null);
  const departmentChanged =
    deptMode === 'pick' && pickedDepartment !== null && pickedDepartment !== entry.departmentId;
  const saveBody = () => ({
    ...editSaveBody(editForm, editStart),
    ...(departmentChanged && pickedDepartment !== null ? { departmentId: pickedDepartment } : {}),
  });
  // A department-only save is a save. A Q&A entry still needs both halves filled (as before).
  const canSave =
    editCanSave(editForm, editStart) ||
    (departmentChanged &&
      (!editsQa || (editForm.question.trim() !== '' && editForm.answer.trim() !== '')));

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const response = await kbService.update(entry.id, saveBody());
      if (response.success && response.data) onSaved(response.data);
    } catch (error) {
      setEditError(
        getErrorBody(error)?.code === FOLLOWS_MAILBOX_CODE
          ? FOLLOWS_MAILBOX_MESSAGE
          : error instanceof Error
            ? error.message
            : 'Failed to update entry. Please try again.'
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
          {deptMode === 'pick' && (
            <DepartmentPicker
              departmentId={entry.departmentId}
              picked={pickedDepartment}
              onPick={setPickedDepartment}
            />
          )}
          {deptMode === 'mailbox' && (
            <div>
              <span className="block mb-1 text-sm font-medium">Department</span>
              <div className="flex gap-2 items-center">
                <DepartmentBadge departmentId={entry.departmentId} />
                {/* The badge is the department of the ONE ticket the entry came from; a mailbox can
                    serve several departments, and the AI uses the entry for all of them. */}
                <span className="text-xs text-muted-foreground">
                  from the ticket it came from — the mailbox decides where it is used
                </span>
              </div>
            </div>
          )}
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
          disabled={!canSave}
        >
          Save Changes
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

/**
 * The department select of a source-less entry: the org's ACTIVE departments (the backend refuses
 * any other). An entry with no department, or one no longer active, starts on "Unassigned" — what
 * the list's badge says for it — which cannot be picked back (the API takes a department id only).
 */
const DepartmentPicker = ({
  departmentId,
  picked,
  onPick,
}: {
  departmentId: number | null;
  picked: number | null;
  onPick: (departmentId: number) => void;
}) => {
  const { data: departments = [], isError } = useDepartments();
  const current = departments.some((dept) => dept.id === departmentId) ? departmentId : null;
  const shown = picked ?? current;
  return (
    <div>
      <label htmlFor="edit-department" className="block mb-1 text-sm font-medium">
        Department
      </label>
      <Select
        id="edit-department"
        value={shown === null ? '' : String(shown)}
        onChange={(event) => {
          if (event.target.value !== '') onPick(Number(event.target.value));
        }}
      >
        <option value="" disabled>
          Unassigned
        </option>
        {departments.map((dept) => (
          <option key={dept.id} value={String(dept.id)}>
            {dept.name}
          </option>
        ))}
      </Select>
      {isError && <p className="mt-1 text-xs text-destructive">Could not load the departments.</p>}
    </div>
  );
};
