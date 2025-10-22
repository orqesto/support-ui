import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogHeader, DialogTitle, DialogClose, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService, type Organization, type OrganizationMember } from '@/services/organization.service';
import { CreateOrganizationModal } from '@/components/CreateOrganizationModal';
import { formatDate } from '@/lib/utils';
import { Building2, Users, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';

export const OrganizationPage = () => {
  const { canManageOrganization, isAdmin } = usePermissions();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editOrgForm, setEditOrgForm] = useState<{ name: string; description: string; active: boolean }>({ name: '', description: '', active: true });
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; orgId: number | null; orgName: string }>({ isOpen: false, orgId: null, orgName: '' });
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
  });

  const fetchOrganization = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        organizationService.getCurrent(),
        organizationService.getMembers(),
      ];

      // Global admins fetch all organizations
      if (isAdmin) {
        promises.push(organizationService.getAll());
      }

      const results = await Promise.all(promises);
      const [orgData, membersData, allOrgsData] = results;

      setOrganization(orgData);
      setMembers(membersData);
      if (allOrgsData) {
        setAllOrganizations(allOrgsData);
      }
      setEditForm({
        name: orgData.name,
        description: orgData.description || '',
      });
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganization();
  }, []);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (organization) {
      setEditForm({
        name: organization.name,
        description: organization.description || '',
      });
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!organization) return;

    setSaving(true);
    try {
      const updated = await organizationService.update({
        name: editForm.name,
        description: editForm.description || undefined,
      });
      setOrganization(updated);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update organization:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrganization = async (name: string, slug: string, description?: string) => {
    await organizationService.create({ name, slug, description });
    // Refresh the page to show the newly created organization
    fetchOrganization();
  };

  const confirmDeleteOrg = (orgId: number, orgName: string) => {
    setDeleteDialog({ isOpen: true, orgId, orgName });
  };

  const handleDeleteOrg = async () => {
    if (!deleteDialog.orgId) return;

    try {
      await organizationService.delete(deleteDialog.orgId);
      // Refresh organizations list
      setAllOrganizations(allOrganizations.filter(org => org.id !== deleteDialog.orgId));
      setDeleteDialog({ isOpen: false, orgId: null, orgName: '' });
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete organization. Please check the console for details.';
      alert(`Error: ${errorMessage}`);
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
      setAllOrganizations(allOrganizations.map(org => org.id === orgId ? updated : org));
      setEditingOrgId(null);
    } catch (error) {
      console.error('Failed to update organization:', error);
      alert('Failed to update organization.');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading organization...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!organization) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Building2 className="w-16 h-16 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Organization</h2>
          <p className="text-gray-600 text-center max-w-md">
            You are not currently associated with an organization.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Organization Settings</h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'Manage all organizations in the system' : 'Manage your organization\'s details and members'}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          )}
        </div>

        {/* All Organizations (Global Admin Only) */}
        {isAdmin && allOrganizations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>All Organizations</CardTitle>
              <CardDescription>
                {allOrganizations.length} organization{allOrganizations.length !== 1 ? 's' : ''} in the system
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile/Tablet Card View - Default up to XL */}
              <div className="xl:hidden divide-y divide-gray-200 overflow-auto max-h-[600px]">
                {allOrganizations.map((org) => (
                  editingOrgId === org.id ? (
                    <div key={org.id} className="p-4 bg-blue-50">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                          <input
                            type="text"
                            value={editOrgForm.name}
                            onChange={(e) => setEditOrgForm({ ...editOrgForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <input
                            type="text"
                            value={editOrgForm.description}
                            onChange={(e) => setEditOrgForm({ ...editOrgForm, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`active-mobile-${org.id}`}
                            checked={editOrgForm.active}
                            onChange={(e) => setEditOrgForm({ ...editOrgForm, active: e.target.checked })}
                            className="rounded"
                          />
                          <label htmlFor={`active-mobile-${org.id}`} className="text-sm font-medium text-gray-700">
                            Active
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateOrg(org.id)} className="flex-1">
                            <Save className="w-4 h-4 mr-2" />
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingOrgId(null)} className="flex-1">
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={org.id} className="p-4 hover:bg-gray-50">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900">{org.name}</h3>
                            {org.description && (
                              <p className="text-sm text-gray-500 mt-1">{org.description}</p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingOrgId(org.id);
                                setEditOrgForm({ name: org.name, description: org.description || '', active: org.active });
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDeleteOrg(org.id, org.name)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center text-xs">
                          <Badge variant={org.active ? 'default' : 'secondary'}>
                            {org.active ? 'Active' : 'Inactive'}
                          </Badge>
                          <code className="px-2 py-1 bg-gray-100 rounded text-gray-600">{org.slug}</code>
                          <span className="text-gray-500">{formatDate(org.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Desktop Table View - Only on XL+ screens */}
              <div className="hidden xl:block">
                <div className="overflow-auto max-h-[600px]">
                  <table className="min-w-full">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Slug
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allOrganizations.map((org) => (
                      editingOrgId === org.id ? (
                        <tr key={org.id} className="bg-blue-50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                  type="text"
                                  value={editOrgForm.name}
                                  onChange={(e) => setEditOrgForm({ ...editOrgForm, name: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                  type="text"
                                  value={editOrgForm.description}
                                  onChange={(e) => setEditOrgForm({ ...editOrgForm, description: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`active-${org.id}`}
                                  checked={editOrgForm.active}
                                  onChange={(e) => setEditOrgForm({ ...editOrgForm, active: e.target.checked })}
                                  className="rounded"
                                />
                                <label htmlFor={`active-${org.id}`} className="text-sm font-medium text-gray-700">
                                  Active
                                </label>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleUpdateOrg(org.id)}>
                                  <Save className="w-4 h-4 mr-2" />
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingOrgId(null)}>
                                  <X className="w-4 h-4 mr-2" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={org.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{org.name}</div>
                            {org.description && (
                              <div className="text-sm text-gray-500">{org.description}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <code className="text-sm text-gray-600">{org.slug}</code>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={org.active ? 'default' : 'secondary'}>
                              {org.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(org.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingOrgId(org.id);
                                  setEditOrgForm({ name: org.name, description: org.description || '', active: org.active });
                                }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDeleteOrg(org.id, org.name)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Organization Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle>{isAdmin ? 'My Current Organization' : 'Organization Details'}</CardTitle>
                  <CardDescription>
                    {isAdmin ? `Details of your assigned organization (${organization.name})` : 'Basic information about your organization'}
                  </CardDescription>
                </div>
              </div>
              {canManageOrganization && !isEditing && (
                <Button onClick={handleEdit} variant="outline" size="sm">
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Enter organization name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Enter organization description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} isLoading={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button onClick={handleCancel} variant="outline" disabled={saving}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="text-base font-medium mt-1">{organization.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Slug</label>
                  <p className="text-base font-mono text-gray-700 mt-1">{organization.slug}</p>
                </div>
                {organization.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Description</label>
                    <p className="text-base text-gray-700 mt-1">{organization.description}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    <Badge variant={organization.active ? 'default' : 'secondary'}>
                      {organization.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Created</label>
                    <p className="text-sm text-gray-700 mt-1">
                      {formatDate(organization.createdAt)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Last Updated</label>
                    <p className="text-sm text-gray-700 mt-1">
                      {formatDate(organization.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Members List */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>{isAdmin ? `${organization.name} Members` : 'Members'}</CardTitle>
                <CardDescription>
                  {members.length} member{members.length !== 1 ? 's' : ''} in {isAdmin ? 'this organization' : 'your organization'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile/Tablet Card View - Default up to XL */}
            <div className="xl:hidden divide-y divide-gray-200 overflow-auto max-h-[600px]">
              {members.map((member) => (
                <div key={member.id} className="p-4 hover:bg-gray-50">
                  <div className="flex gap-3 items-start">
                    <div className="flex flex-shrink-0 justify-center items-center w-10 h-10 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                      {member.firstName?.charAt(0).toUpperCase()}
                      {member.lastName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {member.firstName} {member.lastName}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{member.email}</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge variant={member.organizationRole === 'org_admin' ? 'default' : 'secondary'}>
                            {member.organizationRole}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-gray-500">
                          {member.position && (
                            <div>
                              <span className="font-medium">Position:</span> {member.position}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Joined:</span> {formatDate(member.joinedAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View - Only on XL+ screens */}
            <div className="hidden xl:block">
              <div className="overflow-auto max-h-[600px]">
                <table className="min-w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Position
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={member.organizationRole === 'org_admin' ? 'default' : 'secondary'}>
                          {member.organizationRole}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.position || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(member.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
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
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, isOpen: open })}>
        <DialogHeader>
          <DialogTitle>Delete Organization</DialogTitle>
          <DialogClose onClose={() => setDeleteDialog({ isOpen: false, orgId: null, orgName: '' })} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong className="font-semibold text-gray-900">{deleteDialog.orgName}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm font-semibold text-red-900 mb-2">This will permanently delete:</p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                <li>The organization</li>
                <li>All users in this organization</li>
                <li>All tickets and messages</li>
                <li>All categories and settings</li>
              </ul>
            </div>
            <p className="text-sm font-semibold text-red-600">This action cannot be undone.</p>
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
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Organization
          </Button>
        </DialogFooter>
      </Dialog>
    </Layout>
  );
};
