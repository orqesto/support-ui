import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const OrganizationSwitcher = () => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only show for global admins
  const isGlobalAdmin = user?.role === 'admin';

  useEffect(() => {
    if (isGlobalAdmin) {
      loadOrganizations();
    }
  }, [isGlobalAdmin]);

  // Log current organization on mount and when it changes
  useEffect(() => {
    if (selectedOrganizationId) {
      const org = organizations.find((o) => o.id === selectedOrganizationId);
      console.log(
        `🏢 [ORG SWITCHER] Current Organization: ${org?.name || 'Loading...'} (ID: ${selectedOrganizationId})`
      );
    } else {
      console.warn('⚠️ [ORG SWITCHER] No organization selected!');
    }
  }, [selectedOrganizationId, organizations]);

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      const result = await organizationService.getAll('', 1, 100);
      setOrganizations(result.data);

      // Auto-select first organization if none selected
      if (!selectedOrganizationId && result.data.length > 0) {
        setSelectedOrganization(result.data[0].id);
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrganization = (orgId: number) => {
    const org = organizations.find((o) => o.id === orgId);
    console.log(`🔄 [ORG SWITCHER] Switching to organization: ${org?.name} (ID: ${orgId})`);

    setSelectedOrganization(orgId);
    setIsOpen(false);

    // Reload to apply new context
    console.log('🔄 [ORG SWITCHER] Reloading page to apply new organization context...');
    window.location.reload();
  };

  if (!isGlobalAdmin) {
    return null;
  }

  const selectedOrg = organizations.find((org) => org.id === selectedOrganizationId);

  return (
    <div className="relative mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={loading}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{selectedOrg ? selectedOrg.name : 'Select Organization'}</span>
        </div>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute left-0 bottom-full z-20 mb-2 w-full bg-card rounded-md shadow-lg border border-border max-h-64 overflow-y-auto">
            <div className="p-2">
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
              ) : organizations.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No organizations found
                </div>
              ) : (
                organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSelectOrganization(org.id)}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-md hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{org.name}</div>
                      {org.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {org.description}
                        </div>
                      )}
                    </div>
                    {selectedOrganizationId === org.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
