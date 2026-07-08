import { safeCssColor } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { labelService, type Label } from '@/services/settings.service';
import { useDepartments } from '@/hooks/useDepartments';
import { logger } from '@/lib/logger';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1e293b',
];

export const LabelsSettings = () => {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [labelToDelete, setLabelToDelete] = useState<Label | null>(null);
  const [formData, setFormData] = useState<{ name: string; color: string; departmentIds: number[] }>(
    { name: '', color: '#6366f1', departmentIds: [] }
  );
  const [saving, setSaving] = useState(false);
  const { data: allDepts = [] } = useDepartments();
  const activeDepts = allDepts.filter((dept) => dept.active);

  const toggleDept = (deptId: number) =>
    setFormData((prev) => ({
      ...prev,
      departmentIds: prev.departmentIds.includes(deptId)
        ? prev.departmentIds.filter((id) => id !== deptId)
        : [...prev.departmentIds, deptId],
    }));

  const deptScopeLabel = (ids?: number[]): string => {
    if (!ids || ids.length === 0) return 'All departments';
    return activeDepts
      .filter((dept) => ids.includes(dept.id))
      .map((dept) => dept.name)
      .join(', ') || `${ids.length} department(s)`;
  };

  const fetchLabels = async () => {
    try {
      setLoading(true);
      setLabels(await labelService.getLabels());
    } catch (error) {
      logger.error('Error fetching labels:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabels().catch((err) => { logger.error(err); });
  }, []);

  const handleEdit = (label: Label) => {
    setEditingLabel(label);
    setFormData({ name: label.name, color: label.color, departmentIds: label.departmentIds ?? [] });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', color: '#6366f1', departmentIds: [] });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    try {
      setSaving(true);
      if (editingLabel) {
        await labelService.updateLabel(editingLabel.id, formData);
      } else if (isCreating) {
        await labelService.createLabel(formData);
      }
      await fetchLabels();
      setEditingLabel(null);
      setIsCreating(false);
    } catch (error) {
      logger.error('Error saving label:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingLabel(null);
    setIsCreating(false);
    setFormData({ name: '', color: '#6366f1', departmentIds: [] });
  };

  const handleDeleteConfirm = async () => {
    if (!labelToDelete) return;
    try {
      await labelService.deleteLabel(labelToDelete.id);
      await fetchLabels();
    } catch (error) {
      logger.error('Error deleting label:', error);
    } finally {
      setDeleteDialogOpen(false);
      setLabelToDelete(null);
    }
  };

  const isEditing = editingLabel !== null || isCreating;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Labels</h2>
          <p className="text-sm text-muted-foreground">
            Create labels to categorise and filter tickets. Only admins and moderators can manage labels.
          </p>
        </div>
        {!isEditing && (
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1 w-4 h-4" />
            New Label
          </Button>
        )}
      </div>

      {/* Create / Edit Form */}
      {isEditing && (
        <div className="p-4 rounded-lg border space-y-4">
          <h3 className="text-sm font-medium">{editingLabel ? 'Edit Label' : 'New Label'}</h3>
          <div className="flex items-center gap-3">
            {/* Color swatch preview */}
            <div
              className="w-8 h-8 rounded-full border flex-shrink-0"
              style={{ backgroundColor: formData.color }}
            />
            <input
              type="text"
              placeholder="Label name"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              className="flex-1 px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={50}
            />
          </div>
          {/* Color picker */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Color</p>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((clr) => (
                <button
                  key={clr}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    formData.color === clr ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: clr }}
                  onClick={() => setFormData((prev) => ({ ...prev, color: clr }))}
                  type="button"
                />
              ))}
              <input
                type="color"
                value={formData.color}
                onChange={(event) => setFormData((prev) => ({ ...prev, color: event.target.value }))}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="Custom color"
              />
            </div>
          </div>
          {/* Department scope */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Departments</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeDepts.map((dept) => {
                const selected = formData.departmentIds.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDept(dept.id)}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formData.departmentIds.length === 0
                ? 'No departments selected — this label applies to all departments (org-wide).'
                : 'The label can be applied only to messages in the selected department(s).'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} isLoading={saving} disabled={!formData.name.trim()}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Labels list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading labels…</p>
      ) : labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: safeCssColor(label.color) }}
                />
                <span className="text-sm font-medium truncate">{label.name}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {deptScopeLabel(label.departmentIds)}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEdit(label)}
                  disabled={isEditing}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setLabelToDelete(label); setDeleteDialogOpen(true); }}
                  disabled={isEditing}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Label</DialogTitle>
            <DialogClose onClose={() => setDeleteDialogOpen(false)} />
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{labelToDelete?.name}</strong>? It will be removed from all tickets.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
