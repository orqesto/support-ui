import { useState, useEffect, type FormEvent } from 'react';
import { X, Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';

/**
 * The workspace's database is NOT chosen here (BYODB §4). Like AI and storage, it is picked in
 * the wizard's Database step or Settings → Integrations → Database, where the URL is probed
 * and stored encrypted. The old `shared | dedicated | external` chooser with its env-var
 * "DB Secret Ref" was removed with the collapse of `dedicated`; an ops-provisioned env
 * reference is registered by script, never typed into a form.
 */
type CreateOrganizationData = {
  name: string;
  slug: string;
  description?: string;
};

type CreateOrganizationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateOrganizationData) => Promise<void>;
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
    setFormData({ ...formData, name, slug: generateSlug(name) });
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      await onCreate({
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
      });
      setFormData({ name: '', slug: '', description: '' });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create workspace');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="flex fixed inset-0 z-50 justify-center items-center p-4 bg-black/50"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg shadow-xl bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/10">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold">Create Workspace</h2>
          </div>
          <Button
            aria-label="Close"
            title="Close"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-2 h-auto transition-colors text-muted-foreground hover:text-foreground hover:bg-transparent"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Input
              label="Workspace Name"
              type="text"
              placeholder="Arasaka Corporation"
              value={formData.name}
              onChange={(event) => handleNameChange(event.target.value)}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">The full name of your workspace</p>
          </div>

          <div>
            <Input
              label="Slug"
              type="text"
              placeholder="arasaka"
              value={formData.slug}
              onChange={(event) => setFormData({ ...formData, slug: event.target.value })}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              URL-friendly identifier (lowercase, alphanumeric with hyphens)
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block mb-1 text-sm font-medium">
              Description (Optional)
            </label>
            <Textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              rows={3}
              placeholder="Brief description of the workspace"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The workspace starts on the managed database. Its own Postgres is connected in the setup
            wizard or in Settings → Integrations → Database, like AI keys and storage.
          </p>

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
              <Plus className="mr-2 w-4 h-4 hidden sm:block" />
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
