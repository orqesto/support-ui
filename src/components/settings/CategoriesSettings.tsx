import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Button } from '@/components/ui/Button';
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

export const CategoriesSettings = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: '',
  });

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getCategories();
      setCategories(data);
    } catch (error) {
      logger.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories().catch((error) => {
      logger.error('Failed to fetch categories:', error);
    });
  }, []);

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description ?? '',
      keywords: category.keywords ?? '',
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', description: '', keywords: '' });
  };

  const handleSave = async () => {
    try {
      if (editingCategory) {
        await settingsService.updateCategory(editingCategory.id, formData);
      } else if (isCreating) {
        await settingsService.createCategory(formData);
      }
      await fetchCategories();
      setEditingCategory(null);
      setIsCreating(false);
      setFormData({ name: '', description: '', keywords: '' });
    } catch (error) {
      logger.error('Error saving category:', error);
    }
  };

  const handleCancel = () => {
    setEditingCategory(null);
    setIsCreating(false);
    setFormData({ name: '', description: '', keywords: '' });
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
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-star">
        <div>
          <h3 className="text-lg font-semibold">Ticket Categories</h3>
          <p className="text-sm text-muted-foreground">
            Manage categories for automatic ticket classification
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating} className="px-6 py-4 py-6" >
          <Plus className="mr-2 w-4 h-4 hidden sm:block" />
          Add Category
        </Button>

      </div>

      {/* New Category Form */}
      {isCreating && (
        <div className="p-4 space-y-4 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
          <h4 className="font-semibold">New Category</h4>
          <div className="grid gap-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="e.g., Technical Support"
              />
            </div>
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                rows={2}
                placeholder="Brief description of this category"
              />
            </div>
            <div>
              <label htmlFor="keywords" className="text-sm font-medium">
                Keywords (comma-separated)
              </label>
              <textarea
                value={formData.keywords}
                onChange={(event) => setFormData({ ...formData, keywords: event.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                rows={3}
                placeholder="technical, bug, error, crash, not working, broken"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Keywords help AI categorize tickets automatically
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-center sm:items-start justify-center sm:justify-start"
          >
            <Button onClick={handleSave} disabled={!formData.name}>
              <Save className="mr-2 w-4 h-4" />
              Save
            </Button>
            <Button variant="outline" onClick={handleCancel}>
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
              editingCategory?.id === category.id ? 'bg-blue-500/10 dark:bg-blue-500/10' : 'bg-card'
            }`}
          >
            {editingCategory?.id === category.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Category</h4>
                <div className="grid gap-4">
                  <div>
                    <label htmlFor="name" className="text-sm font-medium">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="text-sm font-medium">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label htmlFor="keywords" className="text-sm font-medium">
                      Keywords
                    </label>
                    <textarea
                      value={formData.keywords}
                      onChange={(event) => setFormData({ ...formData, keywords: event.target.value })}
                      className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">

                  <Button onClick={handleSave}>
                    <Save className="mr-2 w-4 h-4" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>
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
                      <h4 className="text-lg font-semibold">{category.name}</h4>
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
