import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Network, Plus, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { useCreateAlliance } from '@/hooks/usePlatformAdmin';

/**
 * Platform console → Alliances. Lists every alliance (for a global admin the
 * `/api/alliances/mine` read returns them all — allianceOverviewService.listMyAlliances
 * self-filters by role), with a create action and a drill-in to the per-alliance console
 * at `/console/alliance/:id`. No new BE endpoint — reuses the existing global-admin reads.
 */

/** Derive a URL-safe slug from a display name (lowercase, hyphens, trimmed). */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const SLUG_RE = /^[a-z0-9-]+$/;

export const PlatformAlliances = () => {
  const alliancesQuery = useMyAlliances();
  const createAlliance = useCreateAlliance();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const resetForm = () => {
    setName('');
    setSlug('');
    setSlugEdited(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const canSubmit = name.trim().length >= 2 && slug.length >= 2 && SLUG_RE.test(slug);

  const handleCreate = async () => {
    try {
      await createAlliance.mutateAsync({ name: name.trim(), slug });
      toast.success(`Created ${name.trim()}`);
      setCreateOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create alliance');
    }
  };

  if (alliancesQuery.isLoading) {
    return <ConsoleLoading />;
  }

  if (alliancesQuery.isError) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load alliances.</span>
          <Button variant="secondary" onClick={() => void alliancesQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const alliances = alliancesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="Alliances"
        description="Every alliance on the platform. Open one to manage its members, identity and workspaces."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 w-4 h-4" />
            Create alliance
          </Button>
        }
      />

      {alliances.length === 0 ? (
        <Card className="flex flex-col flex-1 min-h-0">
          <ConsoleEmpty
            icon={Network}
            message="No alliances yet. Create one to group multiple workspaces under a single identity."
          />
        </Card>
      ) : (
        <Card padding="none" className="flex overflow-hidden flex-col flex-1 min-h-0">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Workspaces</th>
                <th className="px-3 py-2 font-medium sr-only">Manage</th>
              </tr>
            </thead>
            <tbody>
              {alliances.map((alliance) => (
                <tr key={alliance.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{alliance.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{alliance.slug}</td>
                  <td className="px-3 py-2 text-muted-foreground">{alliance.orgCount}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/console/alliance/${alliance.id}`}>
                      <Button variant="ghost" size="sm">
                        Manage
                        <ArrowRight className="ml-1 w-4 h-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create alliance</DialogTitle>
          <DialogClose onClose={() => setCreateOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="alliance-name" className="mb-1">
                Name
              </Label>
              <Input
                id="alliance-name"
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Acme Group"
              />
            </div>
            <div>
              <Label htmlFor="alliance-slug" className="mb-1">
                Slug
              </Label>
              <Input
                id="alliance-slug"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value);
                }}
                placeholder="acme-group"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens only.
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setCreateOpen(false)}
            disabled={createAlliance.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit} isLoading={createAlliance.isPending}>
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
