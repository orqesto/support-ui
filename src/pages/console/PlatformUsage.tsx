import { AdminUsageTab } from '@/pages/admin/AdminUsageTab';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';

/**
 * Platform console → Subscriptions. The per-workspace plan + feature manager: reuses the
 * global-admin all-orgs table (AdminUsageTab, self-fetching) — assign/change a plan, override
 * feature access (Inherit/On/Off), cancel/reactivate, and track usage for every workspace.
 * Its /api/admin routes are requireGlobalAdmin; org context is suppressed on platform scope
 * (D-ADM-1). Distinct from Plans & Pricing, which only edits the plan catalog + Stripe prices.
 */
export const PlatformUsage = () => (
  <div className="flex flex-col gap-4 h-full min-h-0">
    <ConsolePageHeader
      title="Subscriptions"
      description="Assign a plan, override feature access, and track usage for every workspace. Expand a row to change its plan or toggle features."
    />
    <div className="flex flex-col flex-1 min-h-0">
      <AdminUsageTab />
    </div>
  </div>
);
