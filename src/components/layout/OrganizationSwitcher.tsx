import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { authService } from '@/services/auth.service';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';

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
      // A global admin browses ALL workspaces (admin-only endpoint) and switches by
      // context header. A member may only see their OWN memberships — `getAll` would
      // 403 for them — and switches by re-minting the token.
      const data = isGlobalAdmin
        ? (await organizationService.getAll('', 1, 100)).data
        : await authService.myOrganizations();
      setOrganizations(data as Organization[]);

      // Auto-select first organization if none selected
      if (!selectedOrganizationId && data.length > 0) {
        setSelectedOrganization(data[0].id);
      }
    } catch (error) {
      logger.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [isGlobalAdmin]); // Recreate only when the admin/member data source changes

  useEffect(() => {
    loadOrganizations().catch((error) => {
      logger.error('Failed to load organizations:', error);
    });
  }, [isGlobalAdmin, loadOrganizations]);

  // Refresh organizations when dropdown opens to show newly created ones
  useEffect(() => {
    if (isOpen) {
      loadOrganizations().catch((error) => {
        logger.error('Failed to load organizations:', error);
      });
    }
  }, [isOpen, loadOrganizations]);

  const handleSelectOrganization = async (orgId: number) => {
    setIsOpen(false);

    // A member's JWT is bound to one organization, so switching means asking the server
    // for a new token. A global admin needs no such call — the backend accepts their
    // org-context header — and must NOT make one: this endpoint only accepts orgs you
    // are a member of, which a global admin frequently is not.
    if (!isGlobalAdmin) {
      try {
        await authService.switchOrganization(orgId);
      } catch (error) {
        logger.error('Failed to switch workspace:', error);
        toast.error('Could not switch workspace');
        return; // Stay put rather than reloading into a workspace we were refused.
      }
    }

    setSelectedOrganization(orgId);

    // Clear URL parameters (closes any open message/ticket) and reload
    const baseUrl = window.location.pathname; // e.g., /messages or /tickets
    window.location.href = baseUrl; // Navigate to base URL without params, triggering reload
  };

  // A member with a single workspace has nothing to switch to; showing a dead control
  // would just be noise. Global admins keep the card even at one, since it doubles as
  // the indicator of which workspace they are acting in.
  if (!isGlobalAdmin && organizations.length < 2) {
    return null;
  }

  const selectedOrg = organizations.find((org) => org.id === selectedOrganizationId);

  return (
    <>
      {organizations.length === 1 && selectedOrganizationId ? (
        <div className="mb-3 p-2.5 rounded-lg bg-muted/10 border border-primary/20">
          <p className="mb-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Workspace
          </p>
          <div className="flex gap-2 items-center mb-1.5">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-medium truncate text-foreground">
              {selectedOrg?.name}
            </span>
          </div>
        </div>
      ) : null}

      <div className="relative mb-3">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium rounded-md border text-foreground bg-card border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={loading}
        >
          <div className="flex flex-1 gap-2 items-center min-w-0">
            <Building2 className="flex-shrink-0 w-4 h-4" />
            <span className="truncate">
              {selectedOrg ? selectedOrg.name : 'Select Workspace'}
            </span>
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
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              aria-label="Close workspace menu"
            />

            {/* Dropdown */}
            <div className="overflow-y-auto absolute left-0 bottom-full z-20 mb-2 w-full max-h-80 rounded-md border shadow-lg bg-card border-border">
              <div className="p-2">
                {loading ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
                ) : organizations.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No workspaces found
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
    </>
  );
};
