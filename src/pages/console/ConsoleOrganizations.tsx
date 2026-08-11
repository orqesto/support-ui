import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Settings, Unlink, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { Tooltip } from '@/components/ui/Tooltip';
import { Spinner } from '@/components/ui/Spinner';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useAllianceOrgs,
  useAttachableOrgs,
  useAttachOrg,
  useDetachOrg,
} from '@/hooks/useAllianceAdmin';
import { useAuthStore } from '@/stores/authStore';
import type { AllianceOrg } from '@/services/alliance-admin.service';

/**
 * Organizations screen (SPEC §8.3): list the alliance's workspaces, Manage one (per-workspace
 * shell), and — FOR A GLOBAL ADMIN ONLY — attach a standalone workspace to this alliance or
 * detach one (both are platform-tenancy actions; the BE gates them on requireGlobalAdmin). An
 * alliance_admin gets view + Manage but neither attach nor detach. The same attach is also
 * reachable from Platform console → Workspaces. The list is searched + paginated client-side.
 */
type StatusFilter = 'all' | 'active' | 'inactive';

export const ConsoleOrganizations = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;
  const navigate = useNavigate();
  // Attach/detach is a platform-tenancy decision → global-admin only (BE enforces it too).
  // Alliance admins still manage the workspaces already in the alliance (view + Manage).
  const isGlobalAdmin = useAuthStore((state) => state.user?.role === 'admin');

  const { data: orgs, isLoading, isError, refetch } = useAllianceOrgs(numericId);
  const [detachTarget, setDetachTarget] = useState<AllianceOrg | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const detachMutation = useDetachOrg(numericId);
  // Attach picker is only opened by a global admin (the button is gated), and only fetches
  // while the dialog is open. The BE re-checks requireGlobalAdmin regardless.
  const { data: attachable = [], isLoading: attachableLoading } = useAttachableOrgs(
    numericId,
    attachOpen && isGlobalAdmin
  );
  const attachMutation = useAttachOrg(numericId);
  const attachableOptions = useMemo(
    () => attachable.map((org) => ({ value: String(org.id), label: `${org.name} (/${org.slug})` })),
    [attachable]
  );

  // Client-side search (name + slug, case-insensitive) plus a status filter, both
  // applied over the already-fetched list.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (orgs ?? []).filter((org) => {
      const matchesTerm =
        !term ||
        org.name.toLowerCase().includes(term) ||
        org.slug.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? org.active : !org.active);
      return matchesTerm && matchesStatus;
    });
  }, [orgs, query, statusFilter]);

  // Clamp the page against the filtered result so search never strands the user
  // on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  // Drop into the per-workspace WorkspaceShell (same target as the platform
  // workspaces list). The shell sets org context + clears scope on mount. Pass `from` so the
  // shell's "back" affordance returns to THIS alliance console, not the platform console
  // (which an alliance admin may not even be able to access).
  const handleManage = (org: AllianceOrg) => {
    const from = `/console/alliance/${allianceId}/organizations`;
    navigate(`/console/workspace/${org.id}?from=${encodeURIComponent(from)}`);
  };

  const handleAttach = () => {
    if (selectedOrgId === null) {
      return;
    }
    attachMutation.mutate(selectedOrgId, {
      onSuccess: () => {
        toast.success('Workspace attached to the alliance');
        setAttachOpen(false);
        setSelectedOrgId(null);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Attach failed'),
    });
  };

  const handleDetach = () => {
    if (!detachTarget) {
      return;
    }
    detachMutation.mutate(detachTarget.id, {
      onSuccess: () => {
        toast.success(`Detached ${detachTarget.name}`);
        setDetachTarget(null);
      },
      onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Detach failed'),
    });
  };

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError || !orgs) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load workspaces.</span>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="Workspaces"
        description="Every workspace attached to this alliance."
        actions={
          isGlobalAdmin ? (
            <Button onClick={() => setAttachOpen(true)}>
              <Plus className="mr-2 w-4 h-4" />
              Attach workspace
            </Button>
          ) : undefined
        }
      />

      {orgs.length === 0 ? (
        <Card className="flex flex-col flex-1 min-h-0">
          <ConsoleEmpty
            icon={Building2}
            message={
              isGlobalAdmin
                ? 'No workspaces in this alliance yet. Attach a standalone workspace to get started.'
                : 'No workspaces in this alliance yet. A global admin attaches workspaces to an alliance.'
            }
          />
        </Card>
      ) : (
        <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
          <CardContent padding="none" className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-col flex-shrink-0 gap-3 px-4 py-3 border-b sm:flex-row sm:justify-between sm:items-center border-border">
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {orgs.length} workspace{orgs.length === 1 ? '' : 's'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  aria-label="Filter workspaces by status"
                  value={statusFilter}
                  onChange={(event) => handleStatusChange(event.target.value as StatusFilter)}
                  className="w-full sm:w-auto"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
                <SearchInput
                  value={query}
                  onChange={handleSearchChange}
                  placeholder="Search workspaces by name or slug…"
                  className="w-full sm:w-auto sm:min-w-[280px]"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-1 justify-center items-center px-4 py-10 min-h-0 text-center">
                <p className="text-sm text-muted-foreground">
                  No workspaces match the current search or status filter.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-4 py-2 font-medium text-left">Workspace</th>
                      <th className="px-4 py-2 font-medium text-left">Status</th>
                      <th className="px-4 py-2 font-medium text-right">Members</th>
                      <th className="px-4 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((org) => (
                      <tr key={org.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <div className="font-medium text-foreground">{org.name}</div>
                          <div className="text-xs text-muted-foreground">/{org.slug}</div>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={org.active ? 'success' : 'secondary'}>
                            {org.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right text-foreground">{org.memberCount}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                          <Tooltip content={`Manage ${org.name}`}>
                            <Button
                              variant="ghost"
                              onClick={() => handleManage(org)}
                              aria-label={`Manage ${org.name}`}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                          </Tooltip>
                          {isGlobalAdmin && (
                            <Tooltip content={`Detach ${org.name} from this alliance`}>
                              <Button
                                variant="ghost"
                                onClick={() => setDetachTarget(org)}
                                aria-label={`Detach ${org.name}`}
                              >
                                <Unlink className="w-4 h-4" />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > PAGE_SIZE && (
              <div className="flex-shrink-0">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  total={filtered.length}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogHeader>
          <DialogTitle>Attach a workspace to this alliance</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {attachableLoading ? (
            <div className="flex justify-center py-2">
              <Spinner size={18} />
            </div>
          ) : attachableOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No standalone workspaces are available to attach to this alliance.
            </p>
          ) : (
            <div className="space-y-4">
              <ReactSelect
                label="Workspace"
                options={attachableOptions}
                value={selectedOrgId === null ? '' : String(selectedOrgId)}
                onChange={(value) => setSelectedOrgId(value ? Number(value) : null)}
                placeholder="Select a workspace…"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAttachOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAttach}
                  disabled={selectedOrgId === null}
                  isLoading={attachMutation.isPending}
                >
                  Attach
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetachTarget(null);
          }
        }}
        onConfirm={handleDetach}
        variant="danger"
        confirmText="Detach"
        title={`Detach ${detachTarget?.name ?? ''}?`}
        description="Alliance-managed roles in this workspace are unwound. Any member without a direct grant here loses access — their open tickets in this workspace are reassigned and their sessions are revoked. Members with a direct grant keep it. This does not delete the workspace."
      />
    </div>
  );
};
