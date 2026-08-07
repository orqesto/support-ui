import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { OrgAdminTable } from '@/components/organization/OrgAdminTable';
import { CreateOrganizationModal } from '@/components/modals/CreateOrganizationModal';
import { organizationService } from '@/services/organization.service';
import { logger } from '@/lib/logger';

type OrgRow = Awaited<ReturnType<typeof organizationService.getAll>>['data'][number];
type EditForm = { name: string; description: string; active: boolean };

/**
 * Platform console → Organizations. Reuses the global-admin OrgAdminTable +
 * CreateOrganizationModal — the same all-orgs management previously only on
 * /organization — now under the platform shell. Every /api/organizations admin route
 * requires global admin (requireGlobalAdmin) and takes no org context: the platform
 * api-client scope suppresses X-Organization-Context (D-ADM-1) and the BE authorizes
 * from the role.
 */
export const PlatformOrganizations = () => {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOrg, setSearchOrg] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editOrgForm, setEditOrgForm] = useState<EditForm>({ name: '', description: '', active: true });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const fetchOrgs = useCallback(async () => {
    try {
      const result = await organizationService.getAll(searchOrg || undefined);
      setOrgs(result.data);
    } catch (error) {
      logger.error('Failed to fetch organizations', error);
      toast.error('Could not load organizations');
    } finally {
      setLoading(false);
    }
  }, [searchOrg]);

  useEffect(() => {
    void fetchOrgs();
  }, [fetchOrgs]);

  const handleSearch = () => setSearchOrg(pendingSearch);
  const handleSearchBlur = () => {
    if (!pendingSearch.trim() && searchOrg) {
      setSearchOrg('');
    }
  };

  const handleSaveEdit = async (orgId: number) => {
    try {
      const updated = await organizationService.updateById(orgId, {
        name: editOrgForm.name,
        description: editOrgForm.description || null,
        active: editOrgForm.active,
      });
      setOrgs((prev) => prev.map((org) => (org.id === orgId ? updated : org)));
      setEditingOrgId(null);
      toast.success('Workspace updated');
    } catch (error) {
      logger.error('Failed to update organization', error);
      toast.error(error instanceof Error ? error.message : 'Could not update workspace');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await organizationService.delete(deleteTarget.id);
      setOrgs((prev) => prev.filter((org) => org.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (error) {
      logger.error('Failed to delete organization', error);
      toast.error(error instanceof Error ? error.message : 'Could not delete workspace');
      setDeleteTarget(null);
    }
  };

  const handleCreate = async (data: Parameters<typeof organizationService.create>[0]) => {
    await organizationService.create(data);
    await fetchOrgs();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="text-sm text-muted-foreground">Every workspace on the platform.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 w-4 h-4" />
          Create workspace
        </Button>
      </div>

      <OrgAdminTable
        allOrganizations={orgs}
        searchOrg={searchOrg}
        pendingSearch={pendingSearch}
        editingOrgId={editingOrgId}
        editOrgForm={editOrgForm}
        onPendingSearchChange={setPendingSearch}
        onSearch={handleSearch}
        onSearchBlur={handleSearchBlur}
        onEditOrgFormChange={setEditOrgForm}
        onStartEdit={(org) => {
          setEditingOrgId(org.id);
          setEditOrgForm({ name: org.name, description: org.description ?? '', active: org.active });
        }}
        onCancelEdit={() => setEditingOrgId(null)}
        onSaveEdit={handleSaveEdit}
        onDelete={(orgId, orgName) => setDeleteTarget({ id: orgId, name: orgName })}
      />

      <CreateOrganizationModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDelete}
        variant="danger"
        confirmText="Delete workspace"
        title={`Delete ${deleteTarget?.name ?? 'this workspace'}?`}
        description="This permanently deletes the workspace and all its data. This cannot be undone."
      />
    </div>
  );
};
