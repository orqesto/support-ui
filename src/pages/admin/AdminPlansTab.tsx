/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { useEffect, useState } from 'react';
import { Check, X, Zap, Users, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [planStats, setPlanStats] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<{ type: 'plan' | 'module'; id: number } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [plansRes, modulesRes, statsRes] = await Promise.all([
        apiClient.get('/api/admin/plans'),
        apiClient.get('/api/admin/modules'),
        apiClient.get('/api/admin/plans/stats'),
      ]);

      if (plansRes.data.success) {
        setPlans(plansRes.data.data as Plan[]);
      }
      if (modulesRes.data.success) {
        setModules(modulesRes.data.data as Module[]);
      }
      if (statsRes.data.success) {
        setPlanStats(statsRes.data.data as Record<number, number>);
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  // Find the most popular plan
  const mostPopularPlanId = Object.entries(planStats).reduce(
    (max, [planId, count]) => (count > (planStats[max] || 0) ? Number(planId) : max),
    0
  );

  const handleTogglePlan = async (planId: number) => {
    try {
      setToggling({ type: 'plan', id: planId });
      const response = await apiClient.patch(`/api/admin/plans/${planId}/toggle`);

      if (response.data.success) {
        setPlans((prev) =>
          prev.map((plan) =>
            plan.id === planId ? { ...plan, isActive: response.data.data.isActive } : plan
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle plan:', error);
    } finally {
      setToggling(null);
    }
  };

  const handleToggleModule = async (moduleId: number) => {
    try {
      setToggling({ type: 'module', id: moduleId });
      const response = await apiClient.patch(`/api/admin/modules/${moduleId}/toggle`);

      if (response.data.success) {
        setModules((prev) =>
          prev.map((module) =>
            module.id === moduleId ? { ...module, isActive: response.data.data.isActive } : module
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle module:', error);
    } finally {
      setToggling(null);
    }
  };

  const renderPlanCard = (plan: Plan) => {
    const isToggling = toggling?.type === 'plan' && toggling.id === plan.id;
    const borderColor =
      plan.planType === 'base'
        ? 'border-blue-500'
        : plan.planType === 'bundle'
          ? 'border-green-500'
          : 'border-purple-500';

    return (
      <Card key={plan.id} className={`relative ${plan.isActive ? borderColor : 'opacity-60'}`}>
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
          {mostPopularPlanId === plan.id && planStats[plan.id] > 0 && (
            <Badge className="text-white bg-purple-500">
              <TrendingUp className="mr-1 w-3 h-3" />
              Popular
            </Badge>
          )}
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
            <div className="flex items-center mt-2 text-xs text-gray-500">
              <Users className="inline mr-1 w-3 h-3" />
              {planStats[plan.id] || 0} organization{planStats[plan.id] !== 1 ? 's' : ''}
            </div>
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

          <Button
            className="w-full"
            variant={plan.isActive ? 'destructive' : 'primary'}
            onClick={() => handleTogglePlan(plan.id)}
            disabled={isToggling}
          >
            {isToggling ? 'Toggling...' : plan.isActive ? 'Disable Plan' : 'Enable Plan'}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Base Platform Plans */}
      <div>
        <h2 className="mb-2 text-xl font-semibold">Base Platform Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Core platform plans without AI features</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.filter((plan) => plan.planType === 'base').map((plan) => renderPlanCard(plan))}
        </div>
      </div>

      {/* Bundle Plans */}
      <div>
        <h2 className="mb-2 text-xl font-semibold">Bundle Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Complete packages with AI features included</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.filter((plan) => plan.planType === 'bundle').map((plan) => renderPlanCard(plan))}
        </div>
      </div>

      {/* Enterprise Plans */}
      <div>
        <h2 className="mb-2 text-xl font-semibold">Enterprise Plans</h2>
        <p className="mb-4 text-sm text-gray-400">Custom enterprise solutions</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans
            .filter((plan) => plan.planType === 'enterprise')
            .map((plan) => renderPlanCard(plan))}
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
                className={`relative ${module.isActive ? 'border-purple-500' : 'opacity-60'}`}
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
