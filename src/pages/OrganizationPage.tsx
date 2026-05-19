import { useCallback, useEffect, useState } from 'react';
import { Building2, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';
import { OrgAdminTable } from '@/components/organization/OrgAdminTable';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { organizationService } from '@/services/organization.service';
import { useOrganizationsStore } from '@/stores/organizationsStore';
import { CreateOrganizationModal } from '@/components/modals/CreateOrganizationModal';
import { logger } from '@/lib/logger';

export const OrganizationPage = () => {
  const { canManageOrganization, isAdmin } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editOrgForm, setEditOrgForm] = useState<{
    name: string;
    description: string;
    active: boolean;
  }>({ name: '', description: '', active: true });
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    orgId: number | null;
    orgName: string;
  }>({ isOpen: false, orgId: null, orgName: '' });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
  });

  // Use organizations store
  const organization = useOrganizationsStore((state) => state.currentOrganization);
  const setOrganization = useOrganizationsStore((state) => state.setCurrentOrganization);
  const allOrganizationsFromStore = useOrganizationsStore((state) => state.allOrganizations);
  const allOrganizations = Array.isArray(allOrganizationsFromStore)
    ? allOrganizationsFromStore
    : [];
  const searchOrg = useOrganizationsStore((state) => state.searchQuery);
  const setSearchOrg = useOrganizationsStore((state) => state.setSearchQuery);
  const setAllOrganizations = useOrganizationsStore((state) => state.setAllOrganizations);

  // Local pending search state
  const [pendingSearch, setPendingSearch] = useState(searchOrg || '');

  const fetchCurrentOrganization = useCallback(async () => {
    setLoading(true);
    try {
      const orgData = await organizationService.getCurrent();
      setOrganization(orgData);
      setEditForm({
        name: orgData.name,
        description: orgData.description ?? '',
      });
    } catch (error) {
      logger.error('Failed to fetch current organization:', error);
    } finally {
      setLoading(false);
    }
  }, [setOrganization]);

  const fetchAllOrganizations = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    try {
      const result = await organizationService.getAll(searchOrg || undefined);
      setAllOrganizations(result.data); // Extract data array from response
    } catch (error) {
      logger.error('Failed to fetch all organizations:', error);
    }
  }, [isAdmin, searchOrg, setAllOrganizations]);

  // Fetch current organization once on mount
  useEffect(() => {
    fetchCurrentOrganization().catch((error) => {
      logger.error('Failed to fetch current organization:', error);
    });
  }, [fetchCurrentOrganization]);

  // Fetch all organizations on mount (for admins)
  useEffect(() => {
    if (isAdmin) {
      fetchAllOrganizations().catch((error) => {
        logger.error('Failed to fetch organizations:', error);
      });
    }
  }, [fetchAllOrganizations, isAdmin]);

  // Re-fetch only all organizations when search changes (not current org)
  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    fetchAllOrganizations().catch((error) => {
      logger.error('Failed to fetch organizations:', error);
    });
  }, [fetchAllOrganizations, isAdmin, searchOrg]);

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setSearchOrg(pendingSearch);
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && searchOrg) {
      setSearchOrg('');
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (organization) {
      setEditForm({
        name: organization.name,
        description: organization.description ?? '',
      });
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!organization) {
      return;
    }

    setSaving(true);
    try {
      const updated = await organizationService.update({
        name: editForm.name,
        description: editForm.description || undefined,
      });
      setOrganization(updated);
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to update organization:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrganization = async (
    data: Parameters<typeof organizationService.create>[0]
  ) => {
    await organizationService.create(data);
    // Refresh the lists to show the newly created organization
    if (isAdmin) {
      await fetchAllOrganizations();
    }
    await fetchCurrentOrganization();
  };

  const confirmDeleteOrg = (orgId: number, orgName: string) => {
    setDeleteDialog({ isOpen: true, orgId, orgName });
  };

  const handleDeleteOrg = async () => {
    if (!deleteDialog.orgId) {
      return;
    }

    try {
      await organizationService.delete(deleteDialog.orgId);
      // Refresh organizations list
      setAllOrganizations(allOrganizations.filter((org) => org.id !== deleteDialog.orgId));
      setDeleteDialog({ isOpen: false, orgId: null, orgName: '' });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to delete organization:', error);
        const apiError = error as Error & { response?: { data?: { message?: string } } };
        const errorMessage =
          apiError.response?.data?.message ??
          error.message ??
          'Failed to delete organization. Please check the console for details.';
        setAlertDialog({
          open: true,
          title: 'Delete Failed',
          description: `Error: ${errorMessage}`,
          variant: 'error',
        });
      }
      setDeleteDialog({ isOpen: false, orgId: null, orgName: '' });
    }
  };

  const handleUpdateOrg = async (orgId: number) => {
    try {
      const updated = await organizationService.updateById(orgId, {
        name: editOrgForm.name,
        description: editOrgForm.description || undefined,
        active: editOrgForm.active,
      });
      // Update in the list
      setAllOrganizations(allOrganizations.map((org) => (org.id === orgId ? updated : org)));
      setEditingOrgId(null);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to update organization:', error);
        const apiError = error as Error & { response?: { data?: { message?: string } } };
        const errorMessage =
          apiError.response?.data?.message ??
          error.message ??
          'Failed to update organization. Please check the console for details.';
        setAlertDialog({
          open: true,
          title: 'Update Failed',
          description: `Error: ${errorMessage}`,
          variant: 'error',
        });
      }
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="px-4 mx-auto w-full max-w-7xl flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
            <p className="text-muted-foreground">Loading organization...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!organization) {
    return (
      <Layout>
        <div className="px-4 mx-auto w-full max-w-7xl flex flex-col items-center justify-center min-h-[60vh]">
          <Building2 className="mb-4 w-16 h-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">No Organization</h2>
          <p className="max-w-md text-center text-gray-600">
            You are not currently associated with an organization.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Organization Settings</h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? 'Manage all organizations in the system'
                : "Manage your organization's details"}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 w-4 h-4" />
              Create Organization
            </Button>
          )}
        </div>

        {/* All Organizations (Global Admin Only) */}
        {isAdmin && (
          <OrgAdminTable
            allOrganizations={allOrganizations}
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
              setEditOrgForm({
                name: org.name,
                description: org.description ?? '',
                active: org.active,
              });
            }}
            onCancelEdit={() => setEditingOrgId(null)}
            onSaveEdit={handleUpdateOrg}
            onDelete={confirmDeleteOrg}
          />
        )}

        {/* Organization Details */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex gap-3 items-center">
                <div className="block flex hidden justify-center items-center w-12 h-12 bg-purple-100 rounded-lg sm:">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold sm:text-xl">
                    {isAdmin ? 'My Current Organization' : 'Organization Details'}
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm text-gray-600 sm:text-base">
                    {isAdmin
                      ? `Details of your assigned organization (${organization.name})`
                      : 'Basic information about your organization'}
                  </CardDescription>
                </div>
              </div>
              {canManageOrganization && !isEditing && (
                <Button onClick={handleEdit} variant="outline" size="sm">
                  <Edit2 className="mr-2 w-4 h-4" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div>
                  <label htmlFor="name" className="block mb-1 text-sm font-medium">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                    placeholder="Enter organization name"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="description" className="block mb-1 text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    rows={3}
                    placeholder="Enter organization description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} isLoading={saving}>
                    <Save className="mr-2 w-4 h-4" />
                    Save Changes
                  </Button>
                  <Button onClick={handleCancel} variant="outline" disabled={saving}>
                    <X className="mr-2 w-4 h-4" />
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="text-sm font-medium text-gray-500">
                    Name
                  </label>
                  <p className="mt-1 text-base font-medium">{organization.name}</p>
                </div>
                <div>
                  <label htmlFor="slug" className="text-sm font-medium text-gray-500">
                    Slug
                  </label>
                  <p className="mt-1 font-mono text-base">{organization.slug}</p>
                </div>
                {organization.description && (
                  <div>
                    <label htmlFor="description" className="text-sm font-medium text-gray-500">
                      Description
                    </label>
                    <p className="mt-1 text-base">{organization.description}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="active" className="text-sm font-medium text-gray-500">
                    Status
                  </label>
                  <div className="mt-1">
                    <Badge variant={organization.active ? 'default' : 'secondary'}>
                      {organization.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <label htmlFor="createdAt" className="text-sm font-medium text-gray-500">
                      Created
                    </label>
                    <p className="mt-1 text-sm">{formatDate(organization.createdAt)}</p>
                  </div>
                  <div>
                    <label htmlFor="updatedAt" className="text-sm font-medium text-gray-500">
                      Last Updated
                    </label>
                    <p className="mt-1 text-sm">{formatDate(organization.updatedAt)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Organization Modal */}
      <CreateOrganizationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateOrganization}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, isOpen: open })}
      >
        <DialogHeader>
          <DialogTitle>Delete Organization</DialogTitle>
          <DialogClose
            onClose={() => setDeleteDialog({ isOpen: false, orgId: null, orgName: '' })}
          />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm">
              Are you sure you want to delete{' '}
              <strong className="font-semibold">{deleteDialog.orgName}</strong>?
            </p>
            <div className="p-4 rounded-md border bg-red-500/10 dark:bg-red-500/10 border-red-500/20">
              <p className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
                This will permanently delete:
              </p>
              <ul className="space-y-1 text-sm list-disc list-inside text-red-600 dark:text-red-400">
                <li>The organization</li>
                <li>All users in this organization</li>
                <li>All tickets and messages</li>
                <li>All categories and settings</li>
              </ul>
            </div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              This action cannot be undone.
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteDialog({ isOpen: false, orgId: null, orgName: '' })}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteOrg}
            className="text-white bg-red-600 hover:bg-red-700"
          >
            <Trash2 className="mr-2 w-4 h-4" />
            Delete Organization
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
