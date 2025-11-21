/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { useEffect, useState } from 'react';
import { Check, X, Zap } from 'lucide-react';
import { Layout } from '@/components/Layout';
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

export const AdminPlansPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<{ type: 'plan' | 'module'; id: number } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [plansRes, modulesRes] = await Promise.all([
        apiClient.get('/api/admin/plans'),
        apiClient.get('/api/admin/modules'),
      ]);

      if (plansRes.data.success) {
        setPlans(plansRes.data.data as Plan[]);
      }
      if (modulesRes.data.success) {
        setModules(modulesRes.data.data as Module[]);
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

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 mx-auto space-y-8 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold">System Admin - Plans & Modules</h1>
          <p className="mt-1 text-gray-400">
            Manage which plans and modules are available system-wide
          </p>
        </div>

        {/* Subscription Plans */}
        <div>
          <h2 className="mb-4 text-xl font-semibold">Subscription Plans</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isToggling = toggling?.type === 'plan' && toggling.id === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={`relative ${plan.isActive ? 'border-green-500' : 'opacity-60'}`}
                >
                  {plan.isActive && (
                    <Badge className="absolute top-4 right-4 text-white bg-green-500">
                      <Check className="mr-1 w-3 h-3" />
                      Active
                    </Badge>
                  )}
                  {!plan.isActive && (
                    <Badge className="absolute top-4 right-4 text-white bg-gray-500">
                      <X className="mr-1 w-3 h-3" />
                      Inactive
                    </Badge>
                  )}

                  <CardHeader>
                    <CardTitle className="pr-20">
                      {plan.displayName}
                      <div className="mt-2 text-sm font-normal text-gray-400">
                        {plan.planType} • {plan.name}
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {plan.currency === 'EUR' ? '€' : '$'}
                        {(plan.price / 100).toFixed(0)}
                        <span className="text-sm font-normal text-gray-400">
                          /{plan.billingInterval}
                        </span>
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
            })}
          </div>
        </div>

        {/* AI Modules */}
        <div>
          <h2 className="mb-4 text-xl font-semibold">AI Modules</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => {
              const isToggling = toggling?.type === 'module' && toggling.id === module.id;
              return (
                <Card
                  key={module.id}
                  className={`relative ${module.isActive ? 'border-purple-500' : 'opacity-60'}`}
                >
                  {module.isActive && (
                    <Badge className="absolute top-4 right-4 text-white bg-purple-500">
                      <Zap className="mr-1 w-3 h-3" />
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
                      {module.displayName}
                      <p className="mt-2 text-sm font-normal text-gray-400">{module.description}</p>
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
                      <p>
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

        {/* Info Card */}
        <Card className="bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-6">
            <h3 className="mb-2 font-semibold">💡 Testing Tips</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>
                • <strong>Disable a plan/module</strong> to test how the system handles unavailable
                options
              </p>
              <p>
                • <strong>Only active items</strong> will appear in the pricing page and
                subscription management
              </p>
              <p>
                • <strong>Existing subscriptions</strong> are not affected when you disable their
                plan/module
              </p>
              <p>
                • Changes take effect <strong>immediately</strong> for new subscriptions/activations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
