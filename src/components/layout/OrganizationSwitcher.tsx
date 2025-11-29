import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const OrganizationSwitcher = () => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false); // Prevent duplicate simultaneous calls

  // Only show for global admins
  const isGlobalAdmin = user?.role === 'admin';

  const loadOrganizations = useCallback(async () => {
    // Prevent duplicate simultaneous calls (e.g., from React StrictMode)
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
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
      loadingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove dependencies to prevent recreation on every org change

  useEffect(() => {
    if (isGlobalAdmin) {
      loadOrganizations().catch((error) => {
        console.error('Failed to load organizations:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalAdmin]); // Only run when admin status changes

  // Log current organization on mount and when it changes
  useEffect(() => {
    // Organization tracking handled by store
  }, [selectedOrganizationId, organizations]);

  const handleSelectOrganization = (orgId: number) => {
    setSelectedOrganization(orgId);
    setIsOpen(false);

    // Clear URL parameters (closes any open message/ticket) and reload
    const baseUrl = window.location.pathname; // e.g., /messages or /tickets
    window.location.href = baseUrl; // Navigate to base URL without params, triggering reload
  };

  if (!isGlobalAdmin) {
    return null;
  }

  const selectedOrg = organizations.find((org) => org.id === selectedOrganizationId);

  return (
    <div className="relative mb-3">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium rounded-md border text-foreground bg-card border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={loading}
      >
        <div className="flex flex-1 gap-2 items-center min-w-0">
          <Building2 className="flex-shrink-0 w-4 h-4" />
          <span className="truncate">{selectedOrg ? selectedOrg.name : 'Select Organization'}</span>
        </div>
        <ChevronDown className="flex-shrink-0 w-4 h-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            aria-label="Close organization menu"
          />

          {/* Dropdown */}
          <div className="overflow-y-auto absolute left-0 bottom-full z-20 mb-2 w-full max-h-64 rounded-md border shadow-lg bg-card border-border">
            <div className="p-2">
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
              ) : organizations.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No organizations found
                </div>
              ) : (
                organizations.map((org) => (
                  <Button
                    key={org.id}
                    variant="ghost"
                    onClick={() => handleSelectOrganization(org.id)}
                    className="flex justify-between items-center px-3 py-2 w-full h-auto text-sm text-left rounded-md transition-colors hover:bg-accent"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{org.name}</div>
                      {org.description && (
                        <div className="text-xs truncate text-muted-foreground">
                          {org.description}
                        </div>
                      )}
                    </div>
                    {selectedOrganizationId === org.id && (
                      <Check className="flex-shrink-0 ml-2 w-4 h-4 text-primary" />
                    )}
                  </Button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
