import { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { useDepartments } from '@/hooks/useDepartments';
import { deriveTeamsEnabled } from '@/hooks/useTeamsEnabled';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { settingsService, type Category } from '@/services/settings.service';
import { logger } from '@/lib/logger';
import { Alert } from '@/components/ui/Alert';
import {
  CATEGORIES_RELOAD_FAILED_MESSAGE,
  CATEGORY_CHANGED_UNDERNEATH_NOTICE,
  CATEGORY_SAVE_PENDING_NOTICE,
  earlierSaveFailedNotice,
  getApiErrorMessage,
  getCategorySaveErrorMessage,
  shouldShowSaveError,
} from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { sameFormValues } from '@/lib/sameFormValues';

type CategoryForm = {
  name: string;
  description: string;
  keywords: string;
  /** null = baseline: the category applies in every department. */
  departmentId: number | null;
};
const EMPTY_FORM: CategoryForm = { name: '', description: '', keywords: '', departmentId: null };

const formFromCategory = (category: Category): CategoryForm => ({
  name: category.name,
  description: category.description ?? '',
  keywords: category.keywords ?? '',
  departmentId: category.departmentId,
});

/**
 * One form's request bookkeeping. The create form and the edit form can be open together; each
 * has its own values, its own session (bumped when it opens or closes: a late answer must not
 * land on a later form) and its own in-flight Save.
 */
const useFormSession = () => {
  const sessionRef = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const restart = () => {
    sessionRef.current += 1;
    savingRef.current = false;
    setSaving(false);
  };
  const begin = (): number | null => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    return sessionRef.current;
  };
  const isCurrent = (session: number) => sessionRef.current === session;
  const end = (session: number) => {
    if (!isCurrent(session)) return;
    savingRef.current = false;
    setSaving(false);
  };
  return { saving, restart, begin, isCurrent, end };
};

export const CategoriesSettings = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Which form the refusal belongs to ('new' = the create form), so two forms never both show it.
  const [saveError, setSaveError] = useState<{ target: 'new' | number; message: string } | null>(
    null
  );
  const createSession = useFormSession();
  const editSession = useFormSession();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [createForm, setCreateFormState] = useState<CategoryForm>(EMPTY_FORM);
  const [editForm, setEditFormState] = useState<CategoryForm>(EMPTY_FORM);
  /** Typing in a form clears that form's refusal only. */
  const setCreateForm = (next: CategoryForm) => {
    setSaveError((error) => (error?.target === 'new' ? null : error));
    setCreateFormState(next);
  };
  const setEditForm = (next: CategoryForm) => {
    setSaveError((error) => (error && error.target !== 'new' ? null : error));
    setEditFormState(next);
  };
  const { data: allDepts = [], teamsEnabled: teamsMode } = useDepartments();
  // Teams off: no team scope to pick; a category applies everywhere.
  const teamsEnabled = deriveTeamsEnabled(teamsMode, allDepts);
  const activeDepts = allDepts.filter((dept) => dept.active);

  /**
   * The picker, shared by the create and edit forms so the two cannot drift; each passes its own
   * values.
   *
   * Single-select, unlike labels: a category belongs to one department or to none. "All
   * departments" is not a convenience — it is the baseline scope the API stores as NULL, and
   * the classifier now treats those as candidates everywhere.
   */
  const departmentPicker = (form: CategoryForm, setForm: (next: CategoryForm) => void) =>
    teamsEnabled && (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Team</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Button
            type="button"
            size="sm"
            variant={form.departmentId === null ? 'primary' : 'secondary'}
            onClick={() => setForm({ ...form, departmentId: null })}
            className="px-2 py-1 h-auto text-xs rounded-full"
          >
            All teams
          </Button>
          {activeDepts.map((dept) => (
            <Button
              key={dept.id}
              type="button"
              size="sm"
              variant={form.departmentId === dept.id ? 'primary' : 'secondary'}
              onClick={() => setForm({ ...form, departmentId: dept.id })}
              className="px-2 py-1 h-auto text-xs rounded-full"
            >
              {dept.name}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {form.departmentId === null
            ? 'Applies everywhere — threads in any team can be given this category.'
            : 'Only threads in this team can be given this category.'}
        </p>
      </div>
    );

  /** True when the list did not reload after a write: it may show old values. */
  const listStaleRef = useRef(false);
  /**
   * (Re)load the list. A failure is shown and marks the list stale: an edit form is then not
   * opened from it until a reload succeeds. Resolves to the rows, or null when the load failed.
   */
  const fetchCategories = async (): Promise<Category[] | null> => {
    try {
      setLoading(true);
      const data = await settingsService.getCategories();
      setCategories(data);
      listStaleRef.current = false;
      return data;
    } catch (error) {
      logger.error('Error fetching categories:', error);
      listStaleRef.current = true;
      // A refusal's own reason (a 4xx the backend wrote for a person) follows the line.
      const reason = getApiErrorMessage(error);
      toast.error(
        reason ? `${CATEGORIES_RELOAD_FAILED_MESSAGE} ${reason}` : CATEGORIES_RELOAD_FAILED_MESSAGE
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories().catch((error) => {
      logger.error('Failed to fetch categories:', error);
    });
  }, []);

  /**
   * Category ids with an update in flight. An edit form reopened on such a category waits for it
   * before it may save (two writes of one category could land in either order); only that form
   * waits — the create form and other categories save at once.
   */
  const pendingRowsRef = useRef(new Map<number, number>());
  const [waitingRow, setWaitingRow] = useState<number | null>(null);
  // A non-error line for the open edit form (an earlier save still running, or just landed).
  const [saveNotice, setSaveNotice] = useState<{ target: number; message: string } | null>(null);
  // Latest edit row and form for answers that land after an await.
  const editingCategoryRef = useRef<Category | null>(null);
  editingCategoryRef.current = editingCategory;
  const editFormRef = useRef(editForm);
  editFormRef.current = editForm;

  /** The edit form opens or closes: a request still in flight belongs to the old one. */
  const restartEdit = () => {
    editSession.restart();
    setWaitingRow(null);
    setSaveNotice(null);
    setSaveError((error) => (error && error.target !== 'new' ? null : error));
  };

  const handleEdit = (category: Category) => {
    if (listStaleRef.current) {
      // The list may hold old values: reload first and open the fresh row (or nothing, if the
      // reload fails again — fetchCategories says so).
      void fetchCategories().then((data) => {
        const fresh = data?.find((row) => row.id === category.id);
        if (fresh) openEditForm(fresh);
      });
      return;
    }
    openEditForm(category);
  };

  const openEditForm = (category: Category) => {
    restartEdit();
    setEditingCategory(category);
    setEditFormState(formFromCategory(category));
    if (pendingRowsRef.current.has(category.id)) {
      setWaitingRow(category.id);
      setSaveNotice({ target: category.id, message: CATEGORY_SAVE_PENDING_NOTICE });
    }
  };

  const cancelEdit = () => {
    restartEdit();
    setEditingCategory(null);
    setEditFormState(EMPTY_FORM);
  };

  /**
   * An earlier form's update of category `rowId` succeeded after the person reopened it. An
   * untouched form takes the saved values (saving it would write the old ones back); a form they
   * typed in keeps their text and says the category changed underneath.
   */
  const applyLateSave = (rowId: number, saved: Category) => {
    const open = editingCategoryRef.current;
    if (open?.id !== rowId) return;
    const untouched = sameFormValues(editFormRef.current, formFromCategory(open));
    setEditingCategory(saved);
    if (untouched) {
      setEditFormState(formFromCategory(saved));
    } else {
      setSaveNotice({ target: rowId, message: CATEGORY_CHANGED_UNDERNEATH_NOTICE });
    }
  };

  const handleCreate = () => {
    createSession.restart();
    setSaveError((error) => (error?.target === 'new' ? null : error));
    setIsCreating(true);
    setCreateFormState(EMPTY_FORM);
  };

  const cancelCreate = () => {
    createSession.restart();
    setSaveError((error) => (error?.target === 'new' ? null : error));
    setIsCreating(false);
    setCreateFormState(EMPTY_FORM);
  };

  const saveErrorText = (error: unknown) =>
    getCategorySaveErrorMessage(error) ?? 'Could not save the category. Try again.';

  /** Save the create form: it creates from its own values and closes only itself. */
  const saveCreate = async () => {
    const session = createSession.begin();
    if (session === null) return;
    setSaveError((error) => (error?.target === 'new' ? null : error));
    try {
      await settingsService.createCategory(createForm);
      await fetchCategories();
      if (createSession.isCurrent(session)) cancelCreate();
    } catch (error) {
      logger.error('Error saving category:', error);
      if (createSession.isCurrent(session) && shouldShowSaveError(error)) {
        setSaveError({ target: 'new', message: saveErrorText(error) });
      }
    } finally {
      createSession.end(session);
    }
  };

  /**
   * Save the edit form of `category` from its own values. Its Save is disabled while an earlier
   * write of that category is in flight (the only way to this function).
   */
  const saveEdit = async (category: Category) => {
    const session = editSession.begin();
    if (session === null) return;
    const rowId = category.id;
    setSaveError((error) => (error && error.target !== 'new' ? null : error));
    setSaveNotice(null);
    pendingRowsRef.current.set(rowId, (pendingRowsRef.current.get(rowId) ?? 0) + 1);
    try {
      const saved = await settingsService.updateCategory(rowId, editForm);
      if (!editSession.isCurrent(session)) applyLateSave(rowId, saved);
      await fetchCategories();
      if (editSession.isCurrent(session)) cancelEdit();
    } catch (error) {
      logger.error('Error saving category:', error);
      if (shouldShowSaveError(error)) {
        const message = saveErrorText(error);
        if (editSession.isCurrent(session)) {
          setSaveError({ target: rowId, message });
        } else if (editingCategoryRef.current?.id === rowId) {
          // The person reopened this category while the save ran: the first edit is lost — say so.
          setSaveNotice({ target: rowId, message: earlierSaveFailedNotice(message) });
        }
      }
    } finally {
      const left = (pendingRowsRef.current.get(rowId) ?? 1) - 1;
      if (left > 0) pendingRowsRef.current.set(rowId, left);
      else pendingRowsRef.current.delete(rowId);
      if (editSession.isCurrent(session)) {
        editSession.end(session);
      } else if (editingCategoryRef.current?.id === rowId && !pendingRowsRef.current.has(rowId)) {
        // The reopened form on this category was only waiting for this write: it may save now.
        setWaitingRow(null);
        setSaveNotice((notice) =>
          notice?.message === CATEGORY_SAVE_PENDING_NOTICE ? null : notice
        );
      }
    }
  };

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) {
      return;
    }
    try {
      await settingsService.deleteCategory(categoryToDelete.id);
      await fetchCategories();
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      logger.error('Error deleting category:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h3 className="font-display text-lg font-semibold">Ticket Categories</h3>
          <p className="text-sm text-muted-foreground">
            Manage categories for automatic ticket classification
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating} className="shrink-0 whitespace-nowrap">
          <Plus className="mr-2 w-4 h-4 hidden sm:block" />
          Add Category
        </Button>

      </div>

      {/* New Category Form */}
      {isCreating && (
        <div className="p-4 space-y-4 rounded-lg border bg-muted border-border">
          <h4 className="font-display font-semibold">New Category</h4>
          <div className="grid gap-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="e.g., Technical Support"
              />
            </div>
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                value={createForm.description}
                onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
                rows={2}
                placeholder="Brief description of this category"
              />
            </div>
            <div>
              <label htmlFor="keywords" className="text-sm font-medium">
                Keywords (comma-separated)
              </label>
              <Textarea
                value={createForm.keywords}
                onChange={(event) => setCreateForm({ ...createForm, keywords: event.target.value })}
                className="font-mono"
                rows={3}
                placeholder="technical, bug, error, crash, not working, broken"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Keywords help AI categorize tickets automatically
              </p>
            </div>
            {departmentPicker(createForm, setCreateForm)}
          </div>
          {saveError?.target === 'new' && <Alert variant="danger">{saveError.message}</Alert>}
          <div className="flex flex-col sm:flex-row gap-2 items-center sm:items-start justify-center sm:justify-start"
          >
            <Button onClick={() => void saveCreate()} disabled={!createForm.name || createSession.saving}>
              <Save className="mr-2 w-4 h-4" />
              Save
            </Button>
            <Button variant="outline" onClick={cancelCreate}>
              <X className="mr-2 w-4 h-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-3">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`border border-border rounded-lg p-4 ${
              editingCategory?.id === category.id ? 'bg-primary-muted' : 'bg-card'
            }`}
          >
            {editingCategory?.id === category.id ? (
              <div className="space-y-4">
                <h4 className="font-display font-semibold">Edit Category</h4>
                <div className="grid gap-4">
                  <div>
                    <label htmlFor="name" className="text-sm font-medium">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="text-sm font-medium">
                      Description
                    </label>
                    <Textarea
                      value={editForm.description}
                      onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <label htmlFor="keywords" className="text-sm font-medium">
                      Keywords
                    </label>
                    <Textarea
                      value={editForm.keywords}
                      onChange={(event) => setEditForm({ ...editForm, keywords: event.target.value })}
                      className="font-mono"
                      rows={3}
                    />
                  </div>
                  {departmentPicker(editForm, setEditForm)}
                </div>
                {saveNotice?.target === category.id && (
                  <Alert variant="warning">{saveNotice.message}</Alert>
                )}
                {saveError?.target === category.id && (
                  <Alert variant="danger">{saveError.message}</Alert>
                )}
                <div className="flex flex-col sm:flex-row gap-2">

                  <Button
                    onClick={() => void saveEdit(category)}
                    disabled={editSession.saving || waitingRow === category.id}
                  >
                    <Save className="mr-2 w-4 h-4" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    <X className="mr-2 w-4 h-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-display text-lg font-semibold">{category.name}</h4>
                      <DepartmentBadge departmentId={category.departmentId} nullVariant="baseline" />
                    </div>

                    {category.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                    )}

                    {category.keywords && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Keywords:</p>
                        <div className="flex flex-wrap gap-1">
                          {category.keywords.split(',').map((keyword) => (
                            <span
                              key={keyword + category.id}
                              className="px-2 py-1 text-xs rounded bg-muted"
                            >
                              {keyword.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                
                  <div className="flex flex-row sm:flex-col gap-2 items-center sm:items-start justify-center sm:justify-start w-full sm:w-auto">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => handleEdit(category)}>
                      <Edit2 className="mr-2 w-4 h-4" />
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDeleteClick(category)}
                      aria-label="Delete category"
                    >
                      <Trash2 className="mr-2 w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>

              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Category</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this category? This action cannot be undone.</p>
          {categoryToDelete && (
            <div className="p-4 mt-4 rounded bg-muted">
              <p className="text-sm font-medium">{categoryToDelete.name}</p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
