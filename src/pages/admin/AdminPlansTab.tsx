import { useEffect, useState } from 'react';
import { Check, X, Zap } from 'lucide-react';
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

type Module = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  monthlyFee: number;
  includedUnits: number;
  overagePrice: number;
  unitName: string;
  isActive: boolean;
};

export const AdminPlansTab = () => {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<{ type: 'plan' | 'module'; id: number } | null>(null);
  const [switching, setSwitching] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subscriptionRes, availablePlansRes, modulesRes] = await Promise.all([
        apiClient
          .get<{ success: boolean; data?: unknown }>('/api/organizations/subscription')
          .catch(() => ({ data: { success: false as const } })),
        apiClient.get<{ success: boolean; data: unknown }>('/api/organizations/available-plans'),
        apiClient.get<{ success: boolean; data: unknown }>('/api/organizations/ai-modules'),
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

      if (modulesRes.data.success) {
        setModules(modulesRes.data.data as Module[]);
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

  const handleToggleModule = async (moduleId: number) => {
    try {
      setToggling({ type: 'module', id: moduleId });
      const response = await apiClient.patch<{ success: boolean; data: { isActive: boolean } }>(
        `/api/organizations/ai-modules/${moduleId}/toggle`
      );

      if (response.data.success) {
        setModules((prev) =>
          prev.map((module) =>
            module.id === moduleId ? { ...module, isActive: response.data.data.isActive } : module
          )
        );
      }
    } catch (error) {
      logger.error('Failed to toggle module:', error);
    } finally {
      setToggling(null);
    }
  };

  const renderPlanCard = (plan: Plan) => {
    const borderColor =
      plan.planType === 'base'
        ? 'border-blue-500'
        : plan.planType === 'bundle'
          ? 'border-green-500'
          : 'border-purple-500';

    return (
      <Card
        key={plan.id}
        className={`relative flex flex-col justify-between ${plan.isActive ? borderColor : 'opacity-60'}`}
      >
        <div className="flex absolute top-4 right-4 flex-col gap-2 items-end">
          {plan.isActive && (
            <Badge
              className={`text-white ${plan.planType === 'base' ? 'bg-blue-500' : plan.planType === 'bundle' ? 'bg-green-500' : 'bg-purple-500'}`}
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
  const bundlePlans = availablePlans.filter((plan) => plan.planType === 'bundle');
  const enterprisePlans = availablePlans.filter((plan) => plan.planType === 'enterprise');

  return (
    <div className="space-y-8">
      {/* Current Subscription */}
      {currentPlan && (
        <div>
          <h2 className="mb-4 text-xl font-semibold text-gray-300">Current Subscription</h2>
          <p className="mb-4 text-sm text-gray-400">Your organization&apos;s active plan</p>
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

      {/* Bundle Plans */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-300">Bundle Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Complete packages with AI features included</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bundlePlans.length > 0 ? (
            bundlePlans.map((plan) =>
              renderPlanCard({ ...plan, isActive: plan.id === currentPlan?.id })
            )
          ) : (
            <p className="text-gray-500">No bundle plans available</p>
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

      {/* AI Modules */}
      <div>
        <h2 className="mb-2 text-xl font-semibold">AI Modules</h2>
        <p className="mb-4 text-sm text-gray-400">Optional add-ons for enhanced AI capabilities</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => {
            const isToggling = toggling?.type === 'module' && toggling.id === module.id;
            return (
              <Card
                key={module.id}
                className={`relative flex flex-col justify-between ${module.isActive ? 'border-purple-500' : 'opacity-60'}`}
              >
                {module.isActive && (
                  <Badge className="absolute top-4 right-4 text-white bg-green-500">
                    <Check className="mr-1 w-3 h-3" />
                    Active
                  </Badge>
                )}
                {!module.isActive && (
                  <Badge className="absolute top-4 right-4 text-white bg-gray-500">
                    <X className="mr-1 w-3 h-3" />
                    Inactive
                  </Badge>
                )}

                <CardHeader>
                  <CardTitle className="pr-20">
                    <div className="flex gap-2 items-center">
                      <Zap className="w-5 h-5 text-purple-600" />
                      <span>{module.displayName}</span>
                    </div>
                    <div className="mt-2 text-sm font-normal text-gray-400">
                      {module.description}
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      €{(module.monthlyFee / 100).toFixed(0)}
                      <span className="text-sm font-normal text-gray-400">/month</span>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="pb-4 mb-4 space-y-2 text-sm text-gray-400 border-b">
                    <p>
                      <strong>{module.includedUnits.toLocaleString()}</strong> {module.unitName}s
                      included
                    </p>
                    <p className="text-xs">
                      +€{(module.overagePrice / 100).toFixed(2)} per additional {module.unitName}
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    variant={module.isActive ? 'destructive' : 'primary'}
                    onClick={() => handleToggleModule(module.id)}
                    disabled={isToggling}
                  >
                    {isToggling
                      ? 'Toggling...'
                      : module.isActive
                        ? 'Disable Module'
                        : 'Enable Module'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
