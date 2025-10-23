import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { settingsService, type Category } from '@/services/settings.service';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '../ui/Dialog';

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
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      keywords: category.keywords || '',
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
      console.error('Error saving category:', error);
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
    if (!categoryToDelete) return;
    try {
      await settingsService.deleteCategory(categoryToDelete.id);
      await fetchCategories();
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Ticket Categories</h3>
          <p className="text-sm text-muted-foreground">
            Manage categories for automatic ticket classification
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="mr-2 w-4 h-4" />
          Add Category
        </Button>
      </div>

      {/* New Category Form */}
      {isCreating && (
        <div className="p-4 space-y-4 bg-blue-500/10 dark:bg-blue-500/10 rounded-lg border border-blue-500/20">
          <h4 className="font-semibold">New Category</h4>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="e.g., Technical Support"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                rows={2}
                placeholder="Brief description of this category"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Keywords (comma-separated)</label>
              <textarea
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                rows={3}
                placeholder="technical, bug, error, crash, not working, broken"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Keywords help AI categorize tickets automatically
              </p>
            </div>
          </div>
          <div className="flex gap-2">
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
                    <label className="text-sm font-medium">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Keywords</label>
                    <textarea
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                      className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
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
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold">{category.name}</h4>
                    {category.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                    {category.keywords && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Keywords:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {category.keywords.split(',').map((keyword, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-xs bg-muted rounded"
                            >
                              {keyword.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                      <Edit2 className="mr-1 w-3 h-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
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
            <div className="p-4 mt-4 bg-muted rounded">
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
