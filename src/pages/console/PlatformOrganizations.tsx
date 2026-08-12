import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Save, X, Edit2, Trash2, Settings2, Network, Unlink } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { formatMemberCount, formatPlanLabel } from '@/pages/console/platformOrganizations.format';
import { CreateOrganizationModal } from '@/components/modals/CreateOrganizationModal';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { allianceAdminService } from '@/services/alliance-admin.service';
import { organizationService } from '@/services/organization.service';
import { formatDate } from '@/lib/utils';
import { logger } from '@/lib/logger';

type OrgRow = Awaited<ReturnType<typeof organizationService.getAll>>['data'][number];
type EditForm = { name: string; description: string; active: boolean };

/** Deployment-type → DS Badge variant (replaces the old hand-styled pill). */
const DEPLOYMENT_BADGE: Record<string, 'secondary' | 'default' | 'warning'> = {
  shared: 'secondary',
  dedicated: 'default',
  external: 'warning',
};

/** Inline edit-in-row form (rendered by DataTable's renderEditRow for the editing workspace). */
function EditRow({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: EditForm;
  onChange: (next: EditForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <Input
        label="Name"
        type="text"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.target.value })}
      />
      <Input
        label="Description"
        type="text"
        value={form.description}
        onChange={(event) => onChange({ ...form, description: event.target.value })}
      />
      <Toggle checked={form.active} onChange={(next) => onChange({ ...form, active: next })} label="Active" />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          <Save className="mr-2 w-4 h-4" />
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="mr-2 w-4 h-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Platform console → Organizations. The cross-org, global-admin workspace directory
 * (create / edit-in-row / delete / manage). Every /api/organizations admin route requires
 * global admin (requireGlobalAdmin) and takes no org context: the platform api-client scope
 * suppresses X-Organization-Context (D-ADM-1) and the BE authorizes from the role. Rendered
 * on the shared DataTable (server-paged, committed search).
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
  const [detachTarget, setDetachTarget] = useState<{ id: number; name: string; allianceId: number } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Alliance id → name, to show WHICH alliance each in-an-alliance workspace belongs to (badge)
  // and to label the per-row Detach action. Attach still lives in the alliance console; detach
  // is also offered here for convenience (both go through the same A1-guarded BE route).
  const alliancesQuery = useMyAlliances();
  const allianceNameById = new Map(
    (alliancesQuery.data ?? []).map((alliance) => [alliance.id, alliance.name])
  );

  const fetchOrgs = useCallback(async () => {
    try {
      // Paginate: without page/limit the service defaults to limit=10, so a platform with
      // >10 workspaces would silently show only the first page.
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

  const startEdit = (org: OrgRow) => {
    setEditingOrgId(org.id);
    setEditOrgForm({ name: org.name, description: org.description ?? '', active: org.active });
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

  // Detach this workspace from its alliance (global-admin). The workspace itself survives
  // — only the alliance link is removed (A1-guarded per org on the BE). Mirrors the
  // alliance console's per-org detach; offered here for convenience on the workspace list.
  const handleDetach = async () => {
    if (!detachTarget) {
      return;
    }
    try {
      await allianceAdminService.detachOrg(detachTarget.allianceId, detachTarget.id);
      toast.success(`Detached ${detachTarget.name} from its alliance`);
      setDetachTarget(null);
      await fetchOrgs();
    } catch (error) {
      logger.error('Failed to detach organization from alliance', error);
      toast.error(error instanceof Error ? error.message : 'Could not detach workspace');
      setDetachTarget(null);
    }
  };

  // B2: enter per-workspace management inside the console. Drop into the WorkspaceShell for
  // this org — it reuses the full per-workspace surfaces (invite/create/skills/permission
  // overrides, workspace config) that the org-agnostic platform views can't perform. The shell
  // itself sets the org context + clears scope on mount, so setting context here is redundant;
  // kept only to avoid a flash before the shell mounts.
  const handleManage = (org: OrgRow) => {
    setSelectedOrganization(org.id);
    toast.success(`Now managing ${org.name}`);
    navigate(`/console/workspace/${org.id}?from=/console/platform/organizations`);
  };

  const allianceLabel = (org: OrgRow) =>
    typeof org.allianceId === 'number'
      ? (allianceNameById.get(org.allianceId) ?? `Alliance #${org.allianceId}`)
      : null;

  if (loading) {
    return <ConsoleLoading />;
  }

  const columns: ColumnDef<OrgRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (org) => (
        <div>
          <div className="text-sm font-medium text-foreground">{org.name}</div>
          {org.description && (
            <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
              {org.description}
            </div>
          )}
          {allianceLabel(org) && (
            <div className="mt-1">
              <Badge variant="secondary">
                <Network className="mr-1 w-3 h-3" />
                {allianceLabel(org)}
              </Badge>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'slug',
      header: 'Slug',
      cell: (org) => <code className="text-sm text-muted-foreground">{org.slug}</code>,
    },
    {
      id: 'plan',
      header: 'Plan',
      cell: (org) =>
        org.plan ? (
          <Badge variant="secondary">{formatPlanLabel(org.plan)}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">{formatPlanLabel(org.plan)}</span>
        ),
    },
    {
      id: 'members',
      header: 'Members',
      align: 'right',
      cell: (org) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          {formatMemberCount(org.memberCount)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (org) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={org.active ? 'default' : 'secondary'}>
            {org.active ? 'Active' : 'Inactive'}
          </Badge>
          {org.tenantDb && (
            <Badge variant={DEPLOYMENT_BADGE[org.tenantDb.deploymentType] ?? 'secondary'}>
              {org.tenantDb.deploymentType}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      cell: (org) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(org.createdAt)}</span>
      ),
    },
  ];

  const rowActions = (org: OrgRow) => (
    <div className="flex gap-1 justify-end">
      <Button size="sm" onClick={() => handleManage(org)}>
        <Settings2 className="mr-1 w-4 h-4" />
        Manage
      </Button>
      {typeof org.allianceId === 'number' && (
        <Tooltip content={`Detach ${org.name} from ${allianceLabel(org) ?? 'its alliance'}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDetachTarget({ id: org.id, name: org.name, allianceId: org.allianceId as number })
            }
            aria-label={`Detach ${org.name} from alliance`}
          >
            <Unlink className="w-4 h-4" />
          </Button>
        </Tooltip>
      )}
      <Tooltip content={`Edit ${org.name}`}>
        <Button variant="outline" size="sm" onClick={() => startEdit(org)} aria-label={`Edit ${org.name}`}>
          <Edit2 className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content={`Delete ${org.name}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteTarget({ id: org.id, name: org.name })}
          aria-label={`Delete ${org.name}`}
          className="text-destructive hover:text-destructive hover:border-destructive/40"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </Tooltip>
    </div>
  );

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

      <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
        <CardContent padding="none" className="flex overflow-hidden flex-col flex-1 min-h-0">
          <DataTable
            rows={orgs}
            rowKey={(org) => org.id}
            columns={columns}
            actions={rowActions}
            renderEditRow={(org) =>
              editingOrgId === org.id ? (
                <EditRow
                  form={editOrgForm}
                  onChange={setEditOrgForm}
                  onSave={() => handleSaveEdit(org.id)}
                  onCancel={() => setEditingOrgId(null)}
                />
              ) : null
            }
            toolbarStart={
              <p className="text-sm text-muted-foreground">
                {total} workspace{total === 1 ? '' : 's'}
              </p>
            }
            search={{
              value: pendingSearch,
              onChange: setPendingSearch,
              onCommit: handleSearch,
              onBlur: handleSearchBlur,
              showButton: true,
              placeholder: 'Search by ID, name, slug, description…',
            }}
            pagination={{
              mode: 'server',
              page,
              totalPages,
              total,
              limit: PAGE_SIZE,
              onPageChange: setPage,
            }}
            empty={{
              message: 'No workspaces available.',
              filteredMessage: 'No workspaces found matching your search.',
            }}
          />
        </CardContent>
      </Card>

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

      <ConfirmDialog
        open={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetachTarget(null);
          }
        }}
        onConfirm={() => void handleDetach()}
        variant="warning"
        confirmText="Detach"
        title={`Detach ${detachTarget?.name ?? 'this workspace'} from its alliance?`}
        description="The workspace and its data are kept — only its alliance membership is removed. Alliance admins will no longer manage it, and it won't share the alliance's SSO/SCIM."
      />
    </div>
  );
};
