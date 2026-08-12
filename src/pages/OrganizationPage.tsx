import { Fragment, useCallback, useEffect, useState } from 'react';
import { Building2, Edit2, Save, X } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { organizationService } from '@/services/organization.service';
import { useOrganizationsStore } from '@/stores/organizationsStore';
import { logger } from '@/lib/logger';

/**
 * Per-workspace settings for the user's current workspace (view + edit name/description).
 * The cross-org, global-admin "manage all workspaces" list used to live here too; it now
 * lives solely in the Platform console → Workspaces (PlatformOrganizations), so this page is
 * just the single-workspace editor for everyone.
 */
export const OrganizationPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  // Embedded in the WorkspaceShell → render into its chrome via a Fragment;
  // standalone → wrap in the org-scoped Layout.
  const Wrap = embedded ? Fragment : Layout;
  const { canManageOrganization } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
  });

  const organization = useOrganizationsStore((state) => state.currentOrganization);
  const setOrganization = useOrganizationsStore((state) => state.setCurrentOrganization);

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

  useEffect(() => {
    fetchCurrentOrganization().catch((error) => {
      logger.error('Failed to fetch current organization:', error);
    });
  }, [fetchCurrentOrganization]);

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
        description: editForm.description || null,
      });
      setOrganization(updated);
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to update organization:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Wrap>
        <div className="px-4 mx-auto w-full flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
            <p className="text-muted-foreground">Loading workspace...</p>
          </div>
        </div>
      </Wrap>
    );
  }

  if (!organization) {
    return (
      <Wrap>
        <div className="px-4 mx-auto w-full flex flex-col items-center justify-center min-h-[60vh]">
          <Building2 className="mb-4 w-16 h-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">No Workspace</h2>
          <p className="max-w-md text-center text-gray-600">
            You are not currently associated with a workspace.
          </p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="px-4 mx-auto space-y-4 w-full">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Workspace Settings</h2>
            <p className="text-sm text-muted-foreground">Manage your workspace&apos;s details</p>
          </div>
        </div>

        {/* Workspace Details */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex gap-3 items-center">
                <div className="flex justify-center items-center w-12 h-12 bg-purple-100 rounded-lg">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold sm:text-xl">Workspace Details</CardTitle>
                  <CardDescription className="mt-1 text-sm text-gray-600 sm:text-base">
                    Basic information about your workspace
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
                <Input
                  label="Workspace Name"
                  type="text"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  placeholder="Enter workspace name"
                />
                <Textarea
                  label="Description"
                  value={editForm.description}
                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                  rows={3}
                  placeholder="Enter workspace description"
                />
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
    </Wrap>
  );
};
