import type { ElementType } from 'react';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Users,
  Plug,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, Permission } from '@/types/roles';
import { logger } from '@/lib/logger';

type UsageItem = {
  current: number;
  limit: number;
  percentage: number;
  warning: boolean;
  critical: boolean;
  formatted: string;
};

type DashboardData = {
  plan: {
    id: number;
    name: string;
    displayName: string;
    planType: string;
    price: number;
    currency: string;
  } | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  usage: {
    users: UsageItem;
    integrations: UsageItem;
    messages: UsageItem;
    aiCalls: UsageItem;
  };
  limits: {
    maxUsers: number;
    maxIntegrations: number;
    maxMessagesPerMonth: number;
    maxAICallsPerMonth: number;
  };
};

type SubscriptionDetails = {
  plan: {
    id: number;
    name: string;
    displayName: string;
    planType: string;
    price: number;
    currency: string;
    billingInterval: string;
    limits: Record<string, number>;
    features: Record<string, boolean>;
  };
  subscription: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAt: string | null;
  };
};

export const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const canManage = user
    ? hasPermission(
        user.role,
        user.organizationRole,
        Permission.MANAGE_SUBSCRIPTION,
        user.permissionOverrides
      )
    : false;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardRes, subRes] = await Promise.all([
          apiClient.get<{ success: boolean; data: DashboardData }>('/api/subscriptions/dashboard'),
          apiClient.get<{ success: boolean; data: SubscriptionDetails }>(
            '/api/subscriptions/current'
          ),
        ]);

        setDashboard(dashboardRes.data.data);
        setSubscriptionDetails(subRes.data.data);
      } catch (error) {
        logger.error('Failed to load subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'trialing':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
        return 'bg-orange-100 text-orange-800';
      case 'cancelled':
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getUsageBarColor = (item: UsageItem) => {
    if (item.critical) return 'bg-red-500';
    if (item.warning) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  const UsageCard = ({
    title,
    icon: Icon,
    item,
  }: {
    title: string;
    icon: ElementType;
    item: UsageItem;
  }) => (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-2 items-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {item.warning && (
          <AlertTriangle
            className={`w-4 h-4 ${item.critical ? 'text-red-500' : 'text-orange-500'}`}
          />
        )}
      </div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-2xl font-bold">{item.current.toLocaleString()}</span>
        <span className="text-sm text-muted-foreground">/ {item.limit.toLocaleString()}</span>
      </div>
      <Progress value={Math.min(item.percentage, 100)} className={getUsageBarColor(item)} />
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs text-muted-foreground">{item.percentage}% used</span>
        {item.critical && <span className="text-xs font-medium text-red-600">Limit reached!</span>}
        {item.warning && !item.critical && (
          <span className="text-xs font-medium text-orange-600">Approaching limit</span>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading subscription...</div>
        </div>
      </Layout>
    );
  }

  if (!dashboard || !subscriptionDetails) {
    return (
      <Layout>
        <div className="p-6 mx-auto max-w-4xl">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No Subscription</h3>
              <p className="mb-4 text-muted-foreground">
                You don&apos;t have an active subscription yet.
              </p>
              {canManage && <Button onClick={() => navigate('/pricing')}>View Plans</Button>}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const { plan, subscription } = subscriptionDetails;
  const { usage } = dashboard;

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Subscription & Usage</h1>
            <p className="mt-1 text-muted-foreground">Monitor your plan usage and limits</p>
          </div>
          {canManage && (
            <Button onClick={() => navigate('/pricing')}>
              <CreditCard className="mr-2 w-4 h-4" />
              Change Plan
            </Button>
          )}
        </div>

        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Current Plan</CardTitle>
              <Badge className={getStatusColor(subscription.status)}>{subscription.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Plan</p>
                <p className="text-2xl font-bold">{plan.displayName}</p>
                <Badge variant="secondary" className="mt-1">
                  {plan.planType}
                </Badge>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Price</p>
                <p className="text-2xl font-bold">
                  {plan.currency === 'EUR' ? '€' : '$'}
                  {(plan.price / 100).toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{plan.billingInterval}
                  </span>
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  {subscription.status === 'cancelled' || subscription.status === 'expired'
                    ? 'Period Ends'
                    : 'Next Billing Date'}
                </p>
                <p className="text-lg font-semibold">
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'N/A'}
                </p>
                {subscription.trialEndsAt && (
                  <p className="text-sm text-blue-600">
                    Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Features */}
            <div className="pt-6 mt-6 border-t">
              <p className="mb-3 text-sm font-semibold">Plan Features</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {plan.features &&
                  Object.entries(plan.features)
                    .filter(([, enabled]) => enabled)
                    .map(([feature]) => (
                      <div key={feature} className="flex gap-2 items-center">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm capitalize">
                          {feature.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Dashboard */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                <TrendingUp className="inline mr-2 w-5 h-5" />
                Usage This Month
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings/usage')}>
                View Details
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <UsageCard title="Users" icon={Users} item={usage.users} />
              <UsageCard title="Integrations" icon={Plug} item={usage.integrations} />
              <UsageCard title="Messages" icon={MessageSquare} item={usage.messages} />
              <UsageCard title="AI Calls" icon={Zap} item={usage.aiCalls} />
            </div>

            {/* Warning Alert */}
            {(usage.users.warning ||
              usage.integrations.warning ||
              usage.messages.warning ||
              usage.aiCalls.warning) && (
              <div className="flex gap-3 items-start p-4 mt-4 bg-orange-50 rounded-lg border border-orange-200">
                <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                <div>
                  <p className="font-medium text-orange-800">Approaching Usage Limits</p>
                  <p className="text-sm text-orange-700">
                    Some of your usage metrics are approaching their limits. Consider upgrading your
                    plan for more capacity.
                  </p>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => navigate('/pricing')}
                    >
                      View Upgrade Options
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan Limits Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Limits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Max Users</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxUsers.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Max Integrations</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxIntegrations.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Messages / Month</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxMessagesPerMonth.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">AI Calls / Month</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxAICallsPerMonth === 0
                    ? 'Not included'
                    : dashboard.limits.maxAICallsPerMonth.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card
            className="transition-shadow cursor-pointer hover:shadow-md"
            onClick={() => navigate('/settings/usage')}
          >
            <CardContent className="p-6">
              <TrendingUp className="mb-3 w-8 h-8 text-blue-600" />
              <h3 className="mb-1 font-semibold">Usage Statistics</h3>
              <p className="text-sm text-foreground/70">View detailed usage trends and analytics</p>
            </CardContent>
          </Card>

          {canManage && (
            <Card
              className="transition-shadow cursor-pointer hover:shadow-md"
              onClick={() => navigate('/pricing')}
            >
              <CardContent className="p-6">
                <CreditCard className="mb-3 w-8 h-8 text-green-600" />
                <h3 className="mb-1 font-semibold">Manage Plan</h3>
                <p className="text-sm text-foreground/70">
                  Upgrade, downgrade, or cancel your subscription
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};
