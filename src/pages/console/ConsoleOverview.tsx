import { useParams } from 'react-router-dom';
import { Building2, Users, UsersRound, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
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

  const stats = [
    { label: 'Organizations', value: data.counts.orgs, icon: Building2 },
    { label: 'Members', value: data.counts.members, icon: Users },
    { label: 'Groups', value: data.counts.groups, icon: UsersRound },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
        <p className="text-sm text-muted-foreground">/{data.slug}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent>
                <div className="flex gap-3 items-center">
                  <Icon className="w-5 h-5 text-primary" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Connections</h2>
          <div className="flex flex-wrap gap-6">
            <div className="flex gap-2 items-center">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">SSO</span>
              <Badge variant={data.sso.connected ? 'success' : 'secondary'}>
                {data.sso.connected ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
            <div className="flex gap-2 items-center">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">SCIM</span>
              <Badge variant={data.scim.connected ? 'success' : 'secondary'}>
                {data.scim.connected ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
