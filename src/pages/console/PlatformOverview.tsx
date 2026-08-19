import { Link } from 'react-router-dom';
import { Network, Building2, Users, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { usePlatformOverview } from '@/hooks/usePlatformAdmin';
import { useBackendVersion } from '@/hooks/useBackendVersion';

/**
 * Platform console → Overview. Cross-platform KPIs (alliances / orgs / users) plus the
 * subscription-status and plan-distribution breakdown, from the new
 * GET /api/admin/platform/overview aggregation. Read-only landing page.
 */

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  active: 'success',
  trialing: 'secondary',
  past_due: 'warning',
  cancelled: 'danger',
  expired: 'danger',
};

/** Plan price is stored in cents — render as a whole-euro monthly figure. */
const formatPrice = (cents: number): string => `€${Math.round(cents / 100).toLocaleString()}`;

export const PlatformOverview = () => {
  const overviewQuery = usePlatformOverview();
  const selfHostedDeployment = useBackendVersion().data?.selfHostedDeployment ?? false;

  if (overviewQuery.isLoading) {
    return <ConsoleLoading />;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load the platform overview.</span>
          <Button variant="secondary" onClick={() => void overviewQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const { counts, subscriptions, plans } = overviewQuery.data;

  // Workspaces the plan-distribution accounts for vs. the total — the remainder have no
  // plan/subscription at all and are otherwise invisible here (they only surface in the
  // Subscriptions page). Surface the gap so the numbers reconcile with the workspace count.
  const workspacesOnAPlan = plans.reduce((sum, plan) => sum + plan.orgCount, 0);
  const workspacesWithoutPlan = Math.max(0, counts.organizations - workspacesOnAPlan);

  const stats = [
    { label: 'Alliances', value: counts.alliances, icon: Network, to: '/console/platform/alliances' },
    {
      label: 'Workspaces',
      value: counts.organizations,
      hint: `${counts.activeOrganizations} active`,
      icon: Building2,
      to: '/console/platform/organizations',
    },
    { label: 'Users', value: counts.users, icon: Users, to: '/console/platform/users' },
  ];

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Overview"
        description="Platform-wide administration at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} to={stat.to} className="block group">
              <Card className="transition-colors group-hover:border-primary">
                <CardContent className="flex gap-4 items-center py-6">
                  <div className="flex justify-center items-center w-12 h-12 rounded-lg bg-primary/10">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">
                      {stat.label}
                      {stat.hint ? ` · ${stat.hint}` : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <CreditCard className="w-5 h-5 text-primary" />
              Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptions.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : (
              <ul className="space-y-2">
                {subscriptions.map((row) => (
                  <li key={row.status}>
                    <Link
                      to={`/console/platform/usage?status=${encodeURIComponent(row.status)}`}
                      className="flex justify-between items-center px-2 py-1 -mx-2 rounded-md hover:bg-muted"
                    >
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'}>{row.status}</Badge>
                      <span className="text-sm font-medium text-foreground">{row.count} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-3 mt-3 border-t border-border">
              <Link to="/console/platform/usage" className="text-sm text-primary hover:underline">
                Manage subscriptions →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No plans configured.</p>
            ) : (
              <ul className="space-y-2">
                {plans.map((plan) => {
                  // Absent isActive means the BE predates the field — read it as active
                  // rather than labelling the whole catalog inactive during a deploy.
                  const inactive = plan.isActive === false;
                  return (
                  <li key={plan.id} className="flex justify-between items-center">
                    <div className={inactive ? 'opacity-60' : undefined}>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-foreground">{plan.displayName}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatPrice(plan.price)}/mo
                        </span>
                        {/* Without this the card showed deactivated plans exactly like
                            live ones, so the catalog read as far bigger than it is. */}
                        {inactive && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      {/* Slug disambiguates same-named plans (e.g. two "Enterprise Cloud"). */}
                      <code className="text-xs text-muted-foreground">{plan.name}</code>
                    </div>
                    {plan.orgCount > 0 ? (
                      <Link
                        to={`/console/platform/usage?plan=${encodeURIComponent(plan.name)}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {plan.orgCount} {plan.orgCount === 1 ? 'workspace' : 'workspaces'} →
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">0 workspaces</span>
                    )}
                  </li>
                  );
                })}
                {workspacesWithoutPlan > 0 && (
                  <li className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-sm font-medium text-muted-foreground">No plan</span>
                    <Link
                      to="/console/platform/usage?plan=none"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {workspacesWithoutPlan}{' '}
                      {workspacesWithoutPlan === 1 ? 'workspace' : 'workspaces'} →
                    </Link>
                  </li>
                )}
              </ul>
            )}
            {/* A licensed box has no catalog to sell from — the page it links to redirects
                away there, so the link would be a dead end. */}
            {!selfHostedDeployment && (
              <div className="pt-3 mt-3 border-t border-border">
                <Link
                  to="/console/platform/billing"
                  className="text-sm text-primary hover:underline"
                >
                  Edit plans &amp; pricing →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
