import { Link } from 'react-router-dom';
import { Network, Building2, Users, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { usePlatformOverview } from '@/hooks/usePlatformAdmin';

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

  const stats = [
    { label: 'Alliances', value: counts.alliances, icon: Network, to: '/console/platform/alliances' },
    {
      label: 'Organizations',
      value: counts.organizations,
      hint: `${counts.activeOrganizations} active`,
      icon: Building2,
      to: '/console/platform/organizations',
    },
    { label: 'Users', value: counts.users, icon: Users, to: '/console/platform/users' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Platform-wide administration at a glance.</p>
      </div>

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
                  <li key={row.status} className="flex justify-between items-center">
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'}>{row.status}</Badge>
                    <span className="text-sm font-medium text-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
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
                {plans.map((plan) => (
                  <li key={plan.id} className="flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium text-foreground">{plan.displayName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatPrice(plan.price)}/mo
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {plan.orgCount} {plan.orgCount === 1 ? 'org' : 'orgs'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
