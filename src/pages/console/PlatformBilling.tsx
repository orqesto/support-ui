import { StripePriceMapping } from '@/components/console/StripePriceMapping';
import { AdminPlansTab } from '@/pages/admin/AdminPlansTab';

/**
 * Platform console → Billing & Plans. Reuses the global-admin plans manager
 * (AdminPlansTab, self-fetching) under the platform shell. Its endpoints authorize
 * on the global-admin role; org context is suppressed on platform scope (D-ADM-1).
 */
export const PlatformBilling = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Billing &amp; Plans</h1>
      <p className="text-sm text-muted-foreground">Subscription plans across the platform.</p>
    </div>
    <AdminPlansTab />
    <StripePriceMapping />
  </div>
);
