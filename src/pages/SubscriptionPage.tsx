/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, CreditCard, TrendingUp, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, Permission } from '@/types/roles';

type Subscription = {
  plan: {
    name: string;
    displayName: string;
    price: number;
    currency: string;
    billingInterval: string;
  };
  status: string;
  currentPeriodEnd: string;
  features: Record<string, boolean>;
};

type UsageModule = {
  moduleName: string;
  displayName: string;
  current: number;
  included: number;
  overage: number;
  overagePrice: number;
  estimatedOverageCost: number;
  unitName: string;
};

export const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageModule[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = user
    ? hasPermission(user.role, user.organizationRole, Permission.MANAGE_SUBSCRIPTION)
    : false;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subRes, usageRes] = await Promise.all([
          apiClient.get('/api/subscriptions/current'),
          apiClient.get('/api/subscriptions/usage'),
        ]);

        setSubscription(subRes.data.data);
        setUsage(usageRes.data.data.usage || []);
      } catch (error) {
        console.error('Failed to load subscription:', error);
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
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading subscription...</div>
        </div>
      </Layout>
    );
  }

  if (!subscription) {
    return (
      <Layout>
        <div className="p-6 mx-auto max-w-4xl">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="mx-auto mb-4 w-12 h-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold">No Subscription</h3>
              <p className="mb-4 text-gray-400">You don't have an active subscription yet.</p>
              {canManage && <Button onClick={() => navigate('/pricing')}>View Plans</Button>}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Subscription & Billing</h1>
            <p className="mt-1 text-gray-400">Manage your plan and track usage</p>
          </div>
          {canManage && (
            <Button onClick={() => navigate('/pricing')} variant="outline">
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
                <p className="mb-1 text-sm text-gray-400">Plan</p>
                <p className="text-2xl font-bold">{subscription.plan.displayName}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-400">Price</p>
                <p className="text-2xl font-bold">
                  {subscription.plan.currency === 'EUR' ? '€' : '$'}
                  {(subscription.plan.price / 100).toFixed(2)}
                  <span className="text-sm font-normal text-gray-400">
                    /{subscription.plan.billingInterval}
                  </span>
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-400">Next Billing Date</p>
                <p className="text-lg font-semibold">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="pt-6 mt-6 border-t">
              <p className="mb-3 text-sm font-semibold">Plan Features</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {subscription.features &&
                  Object.entries(subscription.features)
                    .filter(([_, enabled]) => enabled)
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

            {/* View All Plans Button */}
            <div className="pt-6 mt-6 border-t">
              <Button variant="outline" className="w-full" onClick={() => navigate('/pricing')}>
                <CreditCard className="mr-2 w-4 h-4" />
                View All Plans & Pricing
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Module Usage */}
        {usage.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>
                  <Zap className="inline mr-2 w-5 h-5" />
                  AI Module Usage
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate('/settings/usage')}>
                  <TrendingUp className="mr-2 w-4 h-4" />
                  View Details
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {usage.map((module) => {
                  const percentage = (module.current / module.included) * 100;
                  const isNearLimit = percentage >= 90;

                  return (
                    <div key={module.moduleName} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{module.displayName}</p>
                          <p className="text-sm text-gray-400">
                            {module.current.toLocaleString()} / {module.included.toLocaleString()}{' '}
                            {module.unitName}s used
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{percentage.toFixed(1)}%</p>
                          {module.overage > 0 && (
                            <p className="text-sm text-orange-600">+{module.overage} overage</p>
                          )}
                        </div>
                      </div>

                      <Progress value={percentage} className={getUsageColor(percentage)} />

                      {isNearLimit && (
                        <div className="flex gap-2 items-start p-3 bg-orange-50 rounded-lg">
                          <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                          <div className="text-sm text-orange-800">
                            <p className="font-medium">Approaching limit</p>
                            <p>
                              You&apos;ve used {percentage.toFixed(0)}% of your included{' '}
                              {module.unitName}s.
                              {module.overage > 0 &&
                                ` Estimated overage cost: €${(module.estimatedOverageCost / 100).toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card
            className="transition-shadow cursor-pointer hover:shadow-md"
            onClick={() => navigate('/settings/usage')}
          >
            <CardContent className="p-6">
              <TrendingUp className="mb-3 w-8 h-8 text-blue-600" />
              <h3 className="mb-1 font-semibold">Usage Statistics</h3>
              <p className="text-sm text-gray-400">View detailed usage trends and analytics</p>
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
                <p className="text-sm text-gray-400">
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
