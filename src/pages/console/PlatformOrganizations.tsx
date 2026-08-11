import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { OrgAdminTable } from '@/components/organization/OrgAdminTable';
import { CreateOrganizationModal } from '@/components/modals/CreateOrganizationModal';
import { Pagination } from '@/components/ui/Pagination';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
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
  const navigate = useNavigate();
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOrg, setSearchOrg] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editOrgForm, setEditOrgForm] = useState<EditForm>({ name: '', description: '', active: true });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // Alliance id → name, to show WHICH alliance each in-an-alliance workspace belongs to (an
  // informational badge only — attach/detach live in the alliance console, not here).
  const alliancesQuery = useMyAlliances();
  const allianceNameById = new Map(
    (alliancesQuery.data ?? []).map((alliance) => [alliance.id, alliance.name])
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchOrgs = useCallback(async () => {
    try {
      // Paginate: without page/limit the service defaults to limit=10, so a platform with
      // >10 workspaces would silently show only the first 10 (the pagination meta was
      // discarded entirely before). Request the current page and surface the controls.
      const result = await organizationService.getAll(searchOrg || undefined, page, PAGE_SIZE);
      setOrgs(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (error) {
      logger.error('Failed to fetch organizations', error);
      toast.error('Could not load workspaces');
    } finally {
      setLoading(false);
    }
  }, [searchOrg, page]);

  useEffect(() => {
    void fetchOrgs();
  }, [fetchOrgs]);

  const handleSearch = () => {
    setPage(1);
    setSearchOrg(pendingSearch);
  };
  const handleSearchBlur = () => {
    if (!pendingSearch.trim() && searchOrg) {
      setPage(1);
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
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      // Refetch so total/totalPages reflect the deletion. If we just removed the last row on
      // a non-first page, step back one page (setPage re-fetches via the effect) so we don't
      // strand an empty last page.
      if (orgs.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await fetchOrgs();
      }
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

  // B2: enter per-workspace management inside the console. Drop into the WorkspaceShell
  // for this org — it reuses the full per-workspace surfaces (invite/create/skills/
  // permission overrides, workspace config) that the org-agnostic platform views can't
  // perform. The shell itself sets the org context + clears scope on mount, so setting
  // context here is redundant; kept only to avoid a flash before the shell mounts.
  const handleManage = (orgId: number, orgName: string) => {
    setSelectedOrganization(orgId);
    toast.success(`Now managing ${orgName}`);
    navigate(`/console/workspace/${orgId}?from=/console/platform/organizations`);
  };

  if (loading) {
    return <ConsoleLoading />;
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="Workspaces"
        description="Every workspace on the platform."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 w-4 h-4" />
            Create workspace
          </Button>
        }
      />

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
        onManage={(org) => handleManage(org.id, org.name)}
        allianceNameById={allianceNameById}
        total={total}
      />

      {totalPages > 1 && (
        <div className="flex-shrink-0">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            total={total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

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
