import { Link, useParams } from 'react-router-dom';
import { Building2, Users, UsersRound, KeyRound, ShieldCheck, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { useAllianceOverview } from '@/hooks/useAllianceAdmin';

/**
 * Console landing page — real orgs/members/groups counts and SSO/SCIM connection
 * status for the scoped alliance, from GET /api/alliances/:id/overview.
 */
export const ConsoleOverview = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;
  const { data, isLoading, isError, refetch } = useAllianceOverview(numericId);

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError || !data) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load this alliance&apos;s overview.</span>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const base = `/console/alliance/${allianceId}`;
  const stats = [
    { label: 'Workspaces', value: data.counts.orgs, icon: Building2, to: `${base}/organizations` },
    { label: 'Members', value: data.counts.members, icon: Users, to: `${base}/members` },
    { label: 'Groups', value: data.counts.groups, icon: UsersRound, to: `${base}/groups` },
  ];

  const connections = [
    { label: 'SSO', icon: KeyRound, connected: data.sso.connected, to: `${base}/identity` },
    { label: 'SCIM', icon: ShieldCheck, connected: data.scim.connected, to: `${base}/provisioning` },
  ];

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={data.name} description={`/${data.slug}`} />

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
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Connections</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {connections.map((conn) => {
              const Icon = conn.icon;
              return (
                <Link
                  key={conn.label}
                  to={conn.to}
                  className="flex gap-3 items-center px-3 py-2 rounded-md border border-border transition-colors hover:border-primary hover:bg-accent/50"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{conn.label}</span>
                  <Badge variant={conn.connected ? 'success' : 'secondary'}>
                    {conn.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
