import { AdminUsageTab } from '@/pages/admin/AdminUsageTab';

/**
 * Platform console → Usage. Reuses the global-admin all-orgs usage + feature-override
 * table (AdminUsageTab, self-fetching) under the platform shell. Its /api/admin routes
 * are requireGlobalAdmin; org context is suppressed on platform scope (D-ADM-1).
 */
export const PlatformUsage = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Usage</h1>
      <p className="text-sm text-muted-foreground">
        Usage and feature overrides across all workspaces.
      </p>
    </div>
    <AdminUsageTab />
  </div>
);
