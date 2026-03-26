import { useState, useEffect, type FormEvent } from 'react';
import { X, Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type DeploymentType = 'shared' | 'dedicated' | 'external';

type CreateOrganizationData = {
  name: string;
  slug: string;
  description?: string;
  deploymentType: DeploymentType;
  dbSecretRef?: string;
  region?: string;
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
    deploymentType: 'shared' as DeploymentType,
    dbSecretRef: '',
    region: '',
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

  const needsConnectionDetails = formData.deploymentType !== 'shared';

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

    if (needsConnectionDetails && !formData.dbSecretRef.trim()) {
      setError('DB secret ref is required for dedicated and external deployments');
      return;
    }

    setIsLoading(true);

    try {
      await onCreate({
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
        deploymentType: formData.deploymentType,
        dbSecretRef: needsConnectionDetails ? formData.dbSecretRef : undefined,
        region: needsConnectionDetails && formData.region ? formData.region : undefined,
      });
      setFormData({ name: '', slug: '', description: '', deploymentType: 'shared', dbSecretRef: '', region: '' });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create organization');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
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
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/10">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold">Create Organization</h2>
          </div>
          <Button
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
            <label htmlFor="description" className="block mb-1 text-sm font-medium">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="Brief description of the organization"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Database Deployment</label>
            <div className="grid grid-cols-3 gap-2">
              {(['shared', 'dedicated', 'external'] as DeploymentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, deploymentType: type })}
                  className={`py-2 px-3 rounded-md border text-sm capitalize transition-colors ${
                    formData.deploymentType === type
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formData.deploymentType === 'shared' && 'Uses the platform shared database — no extra config needed'}
              {formData.deploymentType === 'dedicated' && 'Separate DB instance on our infrastructure'}
              {formData.deploymentType === 'external' && 'Client-side DB — you provide the connection'}
            </p>
          </div>

          {needsConnectionDetails && (
            <>
              <div>
                <Input
                  label="DB Secret Ref"
                  type="text"
                  placeholder="ORG_ACME_DB_URL"
                  value={formData.dbSecretRef}
                  onChange={(e) => setFormData({ ...formData, dbSecretRef: e.target.value })}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Env var name holding the full postgres connection string
                </p>
              </div>
              <div>
                <Input
                  label="Region (Optional)"
                  type="text"
                  placeholder="eu-west-1"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                />
              </div>
            </>
          )}

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
