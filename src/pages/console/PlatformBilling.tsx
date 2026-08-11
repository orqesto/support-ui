import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PlatformPlans } from '@/components/console/PlatformPlans';
import { StripePriceMapping } from '@/components/console/StripePriceMapping';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { Alert } from '@/components/ui/Alert';

/**
 * Platform console → Plans & Pricing. The plan CATALOG + Stripe wiring, NOT per-workspace
 * billing: PlatformPlans defines the plans (name/price/limits/features, activate/deactivate)
 * and StripePriceMapping maps each paid plan to its Stripe Price id. Both authorize on the
 * global-admin role; org context is suppressed on platform scope (D-ADM-1). Putting a specific
 * workspace ON a plan (or toggling its features) lives in the Subscriptions page — this page
 * intentionally has no per-org "switch plan", which only makes sense for a single workspace.
 */
export const PlatformBilling = () => (
  <div className="space-y-6">
    <ConsolePageHeader
      title="Plans & Pricing"
      description="Define the plan catalog and its Stripe pricing. To put a workspace on a plan, use Subscriptions."
    />
    <Alert variant="info">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <span>
          This is the plan <strong>catalog</strong> (definitions + Stripe prices). To assign a plan
          or override features for a specific workspace, go to Subscriptions.
        </span>
        <Link
          to="/console/platform/usage"
          className="inline-flex gap-1 items-center text-sm font-medium text-primary hover:underline"
        >
          Go to Subscriptions
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Alert>
    <PlatformPlans />
    <StripePriceMapping />
  </div>
);
