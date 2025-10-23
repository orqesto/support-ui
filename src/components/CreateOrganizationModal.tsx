import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Building2, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type CreateOrganizationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, slug: string, description?: string) => Promise<void>;
};

export const CreateOrganizationModal = ({
  isOpen,
  onClose,
  onCreate,
}: CreateOrganizationModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const generateSlug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    });
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.slug) {
      setError('Name and slug are required');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      setError('Slug must be lowercase alphanumeric with hyphens only');
      return;
    }

    setIsLoading(true);

    try {
      await onCreate(formData.name, formData.slug, formData.description || undefined);
      setFormData({ name: '', slug: '', description: '' });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create organization');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="flex fixed inset-0 z-50 justify-center items-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-card rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 bg-purple-500/10 dark:bg-purple-500/10 rounded-lg">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold">Create Organization</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Input
              label="Organization Name"
              type="text"
              placeholder="Acme Corporation"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">The full name of your organization</p>
          </div>

          <div>
            <Input
              label="Slug"
              type="text"
              placeholder="acme-corp"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              URL-friendly identifier (lowercase, alphanumeric with hyphens)
            </p>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Description (Optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="Brief description of the organization"
            />
          </div>

          {error && (
            <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={isLoading}>
              <Plus className="mr-2 w-4 h-4" />
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
