import { useState, useEffect, type FormEvent } from 'react';
import { X, Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';

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
  /** Self-hosted only. Absent = the default (implicit) organisation, null = standalone, number = that organisation. */
  allianceId?: number | null;
};

/** An organisation the new workspace can be placed in. */
type OrganisationChoice = { id: number; name: string; slug: string };

/** The implicit organisation of a self-hosted server (BE slug). */
const IMPLICIT_SLUG = '__self_hosted__';
const DEFAULT_CHOICE = 'default';
const NONE_CHOICE = 'none';

type CreateOrganizationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateOrganizationData) => Promise<void>;
  /** Self-hosted deployment: the Organisation select is shown. Hosted: omitted, as before. */
  selfHostedDeployment?: boolean;
  organisations?: OrganisationChoice[];
};

export const CreateOrganizationModal = ({
  isOpen,
  onClose,
  onCreate,
  selfHostedDeployment = false,
  organisations = [],
}: CreateOrganizationModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [choice, setChoice] = useState(DEFAULT_CHOICE);
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
        ...(selfHostedDeployment && choice === NONE_CHOICE ? { allianceId: null } : {}),
        ...(selfHostedDeployment && choice !== NONE_CHOICE && choice !== DEFAULT_CHOICE
          ? { allianceId: Number(choice) }
          : {}),
      });
      setFormData({ name: '', slug: '', description: '' });
      setChoice(DEFAULT_CHOICE);
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

  const implicit = organisations.find((organisation) => organisation.slug === IMPLICIT_SLUG);
  const organisationOptions = [
    { value: DEFAULT_CHOICE, label: implicit?.name ?? 'Organisation' },
    ...organisations
      .filter((organisation) => organisation.slug !== IMPLICIT_SLUG)
      .map((organisation) => ({ value: String(organisation.id), label: organisation.name })),
    { value: NONE_CHOICE, label: 'None (standalone)' },
  ];

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
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-muted">
              <Building2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="font-display text-xl font-semibold">Create Workspace</h2>
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

          {selfHostedDeployment && (
            <div>
              <Label htmlFor="create-workspace-organisation" className="mb-1">
                Organisation
              </Label>
              <Select
                id="create-workspace-organisation"
                value={choice}
                options={organisationOptions}
                onChange={(value) => setChoice(value)}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Workspaces in an organisation share its AI budget.
              </p>
            </div>
          )}

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
