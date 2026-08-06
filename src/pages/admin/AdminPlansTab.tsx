import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

type Plan = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number;
  currency: string;
  billingInterval: string;
  isActive: boolean;
  limits: {
    maxUsers: number;
    maxMessagesPerMonth?: number;
    maxIntegrations: number;
  };
};

export const AdminPlansTab = () => {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subscriptionRes, availablePlansRes] = await Promise.all([
        apiClient
          .get<{ success: boolean; data?: unknown }>('/api/organizations/subscription')
          .catch(() => ({ data: { success: false as const } })),
        apiClient.get<{ success: boolean; data: unknown }>('/api/organizations/available-plans'),
      ]);

      if (subscriptionRes.data.success && subscriptionRes.data.data) {
        // Current subscription
        const sub = subscriptionRes.data.data as {
          planId: number;
          planName: string;
          planDisplayName: string;
          planPrice: number;
          planCurrency: string;
          status: string;
          planLimits: {
            maxUsers: number;
            maxMessagesPerMonth?: number;
            maxIntegrations: number;
          };
        };
        setCurrentPlan({
          id: sub.planId,
          name: sub.planName,
          displayName: sub.planDisplayName,
          planType: 'current',
          price: sub.planPrice,
          currency: sub.planCurrency,
          billingInterval: 'month',
          limits: sub.planLimits as {
            maxUsers: number;
            maxMessagesPerMonth?: number;
            maxIntegrations: number;
          },
          isActive: sub.status === 'active',
        });
      }

      if (availablePlansRes.data.success) {
        setAvailablePlans(availablePlansRes.data.data as Plan[]);
      }
    } catch (error) {
      logger.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleSwitchPlan = async (planId: number) => {
    if (!currentPlan || planId === currentPlan.id) {
      return; // Already on this plan
    }

    try {
      setSwitching(true);
      const response = await apiClient.patch<{ success: boolean }>(
        '/api/organizations/subscription/plan',
        { planId }
      );

      if (response.data.success) {
        // Refresh data to show new plan
        await fetchData();
      }
    } catch (error) {
      logger.error('Failed to switch plan:', error);
    } finally {
      setSwitching(false);
    }
  };

  const renderPlanCard = (plan: Plan) => {
    const borderColor = plan.planType === 'base' ? 'border-blue-500' : 'border-purple-500';

    return (
      <Card
        key={plan.id}
        className={`relative flex flex-col justify-between ${plan.isActive ? borderColor : 'opacity-60'}`}
      >
        <div className="flex absolute top-4 right-4 flex-col gap-2 items-end">
          {plan.isActive && (
            <Badge
              className={`text-white ${plan.planType === 'base' ? 'bg-blue-500' : 'bg-purple-500'}`}
            >
              <Check className="mr-1 w-3 h-3" />
              Active
            </Badge>
          )}
          {!plan.isActive && (
            <Badge className="text-white bg-gray-500">
              <X className="mr-1 w-3 h-3" />
              Inactive
            </Badge>
          )}
          {/* Organization-specific view - no popularity stats */}
        </div>

        <CardHeader>
          <CardTitle className="pr-20">
            {plan.displayName}
            <div className="mt-2 text-sm font-normal text-gray-400">{plan.name}</div>
            <div className="mt-2 text-2xl font-bold">
              {plan.price === 0 ? (
                <span className="text-xl">Custom Pricing</span>
              ) : (
                <>
                  {plan.currency === 'EUR' ? '€' : '$'}
                  {(plan.price / 100).toFixed(0)}
                  <span className="text-sm font-normal text-gray-400">/{plan.billingInterval}</span>
                </>
              )}
            </div>
            {/* Organization-specific subscription */}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="pb-4 mb-4 space-y-2 text-sm text-gray-400 border-b">
            <p>
              <strong>{plan.limits.maxUsers}</strong> users
            </p>
            <p>
              <strong>{plan.limits.maxMessagesPerMonth?.toLocaleString() ?? '—'}</strong>{' '}
              messages/month
            </p>
            <p>
              <strong>{plan.limits.maxIntegrations}</strong> integrations
            </p>
          </div>
          {plan.isActive ? (
            <Button className="w-full" disabled>
              Current Plan
            </Button>
          ) : (
            <Button
              onClick={() => handleSwitchPlan(plan.id)}
              variant="outline"
              className="w-full"
              disabled={switching}
            >
              {switching ? 'Switching...' : 'Switch to This Plan'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const basePlans = availablePlans.filter((plan) => plan.planType === 'base');
  const enterprisePlans = availablePlans.filter((plan) => plan.planType === 'enterprise');

  return (
    <div className="space-y-8">
      {/* Current Subscription */}
      {currentPlan && (
        <div>
          <h2 className="mb-4 text-xl font-semibold text-gray-300">Current Subscription</h2>
          <p className="mb-4 text-sm text-gray-400">Your workspace&apos;s active plan</p>
          <div className="grid grid-cols-1 gap-6">
            {renderPlanCard({ ...currentPlan, isActive: true })}
          </div>
        </div>
      )}

      {/* Base Platform Plans */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-300">Base Platform Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Core platform plans without AI features</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {basePlans.length > 0 ? (
            basePlans.map((plan) =>
              renderPlanCard({ ...plan, isActive: plan.id === currentPlan?.id })
            )
          ) : (
            <p className="text-gray-500">No base plans available</p>
          )}
        </div>
      </div>

      {/* Enterprise Plans */}
      <div>
        <h2 className="mb-2 text-xl font-semibold text-gray-300">Enterprise Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Custom enterprise solutions</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {enterprisePlans.length > 0 ? (
            enterprisePlans.map((plan) =>
              renderPlanCard({ ...plan, isActive: plan.id === currentPlan?.id })
            )
          ) : (
            <p className="text-gray-500">No enterprise plans available</p>
          )}
        </div>
      </div>
    </div>
  );
};
