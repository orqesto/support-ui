import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Zap, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';

type Plan = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number;
  currency: string;
  billingInterval: string;
  features: Record<string, boolean>;
  limits: {
    maxUsers: number;
    maxMessagesPerMonth?: number;
    maxStorageGB?: number; // Legacy field - for backward compatibility
    maxIntegrations: number;
  };
};

type AIModule = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  monthlyFee: number;
  includedUnits: number;
  overagePrice: number;
  unitName: string;
};

export const PricingPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<AIModule[]>([]);
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);
  const [activeModuleIds, setActiveModuleIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [addingModule, setAddingModule] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<AIModule | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    confirmAction?: boolean;
  }>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
    confirmAction: false,
  });
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const [plansRes, modulesRes, currentRes, activeModulesRes] = await Promise.all([
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
          apiClient.get<{ success: boolean; data: { modules: AIModule[] } }>(
            '/api/subscriptions/modules'
          ),
          apiClient.get<{ success: boolean; data: { plan: { name: string } } }>(
            '/api/subscriptions/current'
          ).catch(() => null),
          apiClient.get<{ success: boolean; data: { modules: { moduleId: number }[] } }>(
            '/api/subscriptions/modules/active'
          ).catch(() => null),
        ]);

        setPlans(plansRes.data.data.plans);
        setModules(modulesRes.data.data.modules);
        if (currentRes?.data?.data?.plan?.name) {
          setCurrentPlanName(currentRes.data.data.plan.name);
        }
        if (activeModulesRes?.data?.data?.modules) {
          setActiveModuleIds(new Set(activeModulesRes.data.data.modules.map((m) => m.moduleId)));
        }
      } catch (error) {
        console.error('Failed to load pricing:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchPricing();
  }, []);

  const handleSelectPlan = (planName: string) => {
    if (planName === 'admin' && !isGlobalAdmin) {
      setAlertDialog({
        open: true,
        title: 'Not Available',
        description:
          'Admin plan cannot be selected. This plan is reserved for system administrators.',
        variant: 'error',
        confirmAction: false,
      });
      return;
    }

    // Store selected plan and show confirmation
    setSelectedPlan(planName);
    setAlertDialog({
      open: true,
      title: 'Confirm Upgrade',
      description: `Are you sure you want to upgrade to the ${planName} plan? This change will take effect immediately.`,
      variant: 'info',
      confirmAction: true,
    });
  };

  const confirmUpgrade = async () => {
    if (!selectedPlan) return;

    setUpgrading(selectedPlan);
    setAlertDialog({ ...alertDialog, open: false });

    try {
      await apiClient.post('/api/subscriptions/upgrade', { planName: selectedPlan });

      setCurrentPlanName(selectedPlan);
      setAlertDialog({
        open: true,
        title: 'Success!',
        description: `Successfully upgraded to ${selectedPlan} plan! Redirecting...`,
        variant: 'success',
        confirmAction: false,
      });

      // Navigate to subscription page after delay
      setTimeout(() => {
        navigate('/subscription');
      }, 1500);
    } catch (error: unknown) {
      console.error('Failed to upgrade plan:', error);
      const message =
        error instanceof Error &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'data' in error.response &&
        error.response.data &&
        typeof error.response.data === 'object' &&
        'error' in error.response.data &&
        typeof error.response.data.error === 'string'
          ? error.response.data.error
          : 'Failed to upgrade plan';
      setAlertDialog({
        open: true,
        title: 'Error',
        description: message,
        variant: 'error',
        confirmAction: false,
      });
    } finally {
      setUpgrading(null);
      setSelectedPlan(null);
    }
  };

  const handleAddModule = (module: AIModule) => {
    setSelectedModule(module);
    setAlertDialog({
      open: true,
      title: 'Add Module',
      description: `Add ${module.displayName} to your plan for €${(module.monthlyFee / 100).toFixed(0)}/month?`,
      variant: 'info',
      confirmAction: true,
    });
  };

  const confirmAddModule = async () => {
    if (!selectedModule) return;

    setAddingModule(selectedModule.id);
    setAlertDialog({ ...alertDialog, open: false });

    try {
      await apiClient.post(`/api/subscriptions/modules/${selectedModule.id}/add`, {});

      setActiveModuleIds((prev) => new Set([...prev, selectedModule.id]));
      setAlertDialog({
        open: true,
        title: 'Module Added!',
        description: `${selectedModule.displayName} has been added to your plan.`,
        variant: 'success',
        confirmAction: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'data' in error.response &&
        error.response.data &&
        typeof error.response.data === 'object' &&
        'error' in error.response.data &&
        typeof error.response.data.error === 'string'
          ? error.response.data.error
          : 'Failed to add module';
      setAlertDialog({
        open: true,
        title: 'Error',
        description: message,
        variant: 'error',
        confirmAction: false,
      });
    } finally {
      setAddingModule(null);
      setSelectedModule(null);
    }
  };

  const basePlans = plans.filter((p) => p.planType === 'base');
  const bundlePlans = plans.filter((p) => p.planType === 'bundle');
  const enterprisePlans = plans.filter((p) => p.planType === 'enterprise' && (isGlobalAdmin || p.name !== 'admin'));

  const getFeatureLabel = (key: string): string => {
    const labels: Record<string, string> = {
      multiTenant: 'Multi-tenant Support',
      emailIngestion: 'Email Ingestion',
      ticketing: 'Ticketing System',
      integrations: 'Integrations',
      rbac: 'Role-Based Access Control',
      basicDashboard: 'Basic Dashboard',
      aiSpamFiltering: 'AI Spam Filtering',
      aiClassification: 'AI Classification',
      aiKnowledgeBase: 'AI Knowledge Base',
      aiAutoReply: 'AI Auto-Reply',
      translations: 'Translations',
      advancedAnalytics: 'Advanced Analytics',
      sla: 'SLA Management',
      customWorkflows: 'Custom Workflows',
      dedicatedOnboarding: 'Dedicated Onboarding',
      jiraSync: 'Jira Sync',
    };
    return labels[key] || key;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading pricing...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 mx-auto space-y-12 max-w-7xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/subscription')}>
          <ArrowLeft className="mr-2 w-4 h-4" />
          Back
        </Button>
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold">Choose Your Plan</h1>
          <p className="text-xl text-gray-400">
            Scale your support operations with flexible pricing
          </p>
        </div>

        {/* Base Plans */}
        <div>
          <h2 className="mb-6 text-2xl font-bold">Base Plans</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {basePlans.map((plan) => {
              const isPopular = plan.name === 'growing';

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col justify-between ${isPopular ? 'border-2 border-blue-500 shadow-lg' : ''}`}
                >
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 text-white bg-blue-500 -translate-x-1/2">
                      Most Popular
                    </Badge>
                  )}

                  <CardHeader>
                    <CardTitle className="text-center">
                      <div className="text-2xl font-bold">{plan.displayName}</div>
                      <div className="mt-4">
                        <span className="text-4xl font-bold">
                          {plan.currency === 'EUR' ? '€' : '$'}
                          {(plan.price / 100).toFixed(0)}
                        </span>
                        <span className="text-gray-400">/{plan.billingInterval}</span>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {/* Limits */}
                    <div className="pb-6 mb-6 space-y-2 border-b">
                      <p className="text-sm text-gray-400">
                        <strong>{plan.limits.maxUsers.toLocaleString()}</strong> users
                      </p>
                      <p className="text-sm text-gray-400">
                        <strong>
                          {plan.limits.maxMessagesPerMonth
                            ? plan.limits.maxMessagesPerMonth.toLocaleString()
                            : plan.limits.maxStorageGB
                              ? `${plan.limits.maxStorageGB}GB (legacy)`
                              : '—'}
                        </strong>{' '}
                        {plan.limits.maxMessagesPerMonth ? 'messages/month' : 'storage'}
                      </p>
                      <p className="text-sm text-gray-400">
                        <strong>{plan.limits.maxIntegrations}</strong> integrations
                      </p>
                    </div>

                    {/* Features */}
                    <div className="mb-6 space-y-3">
                      {Object.entries(plan.features)
                        .filter(([_, enabled]) => enabled)
                        .map(([key]) => (
                          <div key={key} className="flex gap-2 items-start">
                            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">{getFeatureLabel(key)}</span>
                          </div>
                        ))}
                    </div>

                    <Button
                      className="w-full"
                      variant={isPopular ? 'primary' : 'outline'}
                      onClick={() => handleSelectPlan(plan.name)}
                      disabled={
                        upgrading === plan.name ||
                        plan.name === 'admin' ||
                        plan.name === currentPlanName
                      }
                    >
                      {upgrading === plan.name
                        ? 'Processing...'
                        : plan.name === currentPlanName
                          ? 'Current Plan'
                          : plan.name === 'admin'
                            ? 'Not Available'
                            : 'Get Started'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Admin/Enterprise Plans - Only for Global Admins */}
        {isGlobalAdmin && enterprisePlans.length > 0 && (
          <div>
            <h2 className="mb-6 text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-600" />
              Administrator Plans
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {enterprisePlans.map((plan) => (
                <Card key={plan.id} className="border-purple-500 border-2">
                  <CardHeader>
                    <CardTitle className="text-center">
                      <div className="flex gap-2 justify-center items-center mb-2">
                        <Shield className="w-6 h-6 text-purple-600" />
                        <span className="text-2xl font-bold">{plan.displayName}</span>
                      </div>
                      <div className="mt-4">
                        <span className="text-4xl font-bold">
                          {plan.currency === 'EUR' ? '€' : '$'}
                          {(plan.price / 100).toFixed(0)}
                        </span>
                        <span className="text-gray-400">/{plan.billingInterval}</span>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {/* Limits */}
                    <div className="pb-6 mb-6 space-y-2 border-b">
                      <p className="text-sm text-gray-400">
                        <strong>{plan.limits.maxUsers.toLocaleString()}</strong> users
                      </p>
                      <p className="text-sm text-gray-400">
                        <strong>
                          {plan.limits.maxMessagesPerMonth
                            ? plan.limits.maxMessagesPerMonth.toLocaleString()
                            : '—'}
                        </strong>{' '}
                        messages/month
                      </p>
                      <p className="text-sm text-gray-400">
                        <strong>{plan.limits.maxIntegrations}</strong> integrations
                      </p>
                    </div>

                    {/* Features */}
                    <div className="mb-6 space-y-3">
                      {Object.entries(plan.features)
                        .filter(([_, enabled]) => enabled)
                        .slice(0, 8)
                        .map(([key]) => (
                          <div key={key} className="flex gap-2 items-start">
                            <Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">{getFeatureLabel(key)}</span>
                          </div>
                        ))}
                    </div>

                    <Button
                      className="w-full"
                      variant="primary"
                      onClick={() => handleSelectPlan(plan.name)}
                      disabled={upgrading === plan.name || plan.name === currentPlanName}
                    >
                      {upgrading === plan.name
                        ? 'Processing...'
                        : plan.name === currentPlanName
                          ? 'Current Plan'
                          : 'Select Plan'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Bundle Plans */}
        {bundlePlans.length > 0 && (
          <div>
            <h2 className="mb-6 text-2xl font-bold">AI-Powered Bundles</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {bundlePlans.map((plan) => (
                <Card key={plan.id} className="border-purple-200">
                  <CardHeader>
                    <CardTitle className="text-center">
                      <div className="flex gap-2 justify-center items-center mb-2">
                        <Zap className="w-6 h-6 text-purple-600" />
                        <span className="text-2xl font-bold">{plan.displayName}</span>
                      </div>
                      <div className="mt-4">
                        <span className="text-4xl font-bold">
                          {plan.currency === 'EUR' ? '€' : '$'}
                          {(plan.price / 100).toFixed(0)}
                        </span>
                        <span className="text-gray-400">/{plan.billingInterval}</span>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {/* Limits */}
                    <div className="pb-6 mb-6 space-y-2 border-b">
                      <p className="text-sm text-gray-400">
                        <strong>{plan.limits.maxUsers.toLocaleString()}</strong> users
                      </p>
                      <p className="text-sm text-gray-400">
                        <strong>
                          {plan.limits.maxMessagesPerMonth
                            ? plan.limits.maxMessagesPerMonth.toLocaleString()
                            : plan.limits.maxStorageGB
                              ? `${plan.limits.maxStorageGB}GB (legacy)`
                              : '—'}
                        </strong>{' '}
                        {plan.limits.maxMessagesPerMonth ? 'messages/month' : 'storage'}
                      </p>
                    </div>

                    {/* Features */}
                    <div className="mb-6 space-y-3">
                      {Object.entries(plan.features)
                        .filter(([_, enabled]) => enabled)
                        .slice(0, 8)
                        .map(([key]) => (
                          <div key={key} className="flex gap-2 items-start">
                            <Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">{getFeatureLabel(key)}</span>
                          </div>
                        ))}
                    </div>

                    <Button
                      className="w-full"
                      variant="primary"
                      onClick={() => handleSelectPlan(plan.name)}
                      disabled={upgrading === plan.name || plan.name === currentPlanName}
                    >
                      {upgrading === plan.name
                        ? 'Processing...'
                        : plan.name === currentPlanName
                          ? 'Current Plan'
                          : 'Get Started'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* AI Modules Add-ons */}
        <div>
          <h2 className="mb-3 text-2xl font-bold">AI Module Add-ons</h2>
          <p className="mb-6 text-gray-400">Enhance your plan with powerful AI capabilities</p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <Card
                key={module.id}
                className="flex flex-col justify-between h-full transition-shadow hover:shadow-md"
              >
                <div>
                  <CardHeader>
                    <CardTitle className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold">{module.displayName}</div>
                        <p className="mt-1 text-sm font-normal text-gray-400">
                          {module.description}
                        </p>
                      </div>
                      <div className="flex flex-col flex-shrink-0 items-end ml-4">
                        <span className="text-2xl font-bold">
                          €{(module.monthlyFee / 100).toFixed(0)}
                        </span>
                        <span className="text-sm text-gray-400">/month</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p>
                        <strong>{module.includedUnits.toLocaleString()}</strong> {module.unitName}s
                        included
                      </p>
                      <p>
                        €{(module.overagePrice / 100).toFixed(2)} per additional {module.unitName}
                      </p>
                    </div>
                  </CardContent>
                </div>
                <CardContent className="pt-0">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleAddModule(module)}
                    disabled={addingModule === module.id || activeModuleIds.has(module.id)}
                  >
                    {addingModule === module.id
                      ? 'Adding...'
                      : activeModuleIds.has(module.id)
                        ? 'Active'
                        : 'Add to Plan'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Enterprise */}
        <Card className="text-white bg-gradient-to-r from-gray-900 to-gray-800">
          <CardContent className="p-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">Enterprise</h2>
            <p className="mb-6 text-xl text-gray-300">
              Custom solutions for large teams with specific requirements
            </p>
            <div className="flex flex-wrap gap-6 justify-center mb-8">
              <div className="flex gap-2 items-center">
                <Check className="w-5 h-5" />
                <span>Unlimited users</span>
              </div>
              <div className="flex gap-2 items-center">
                <Check className="w-5 h-5" />
                <span>Custom integrations</span>
              </div>
              <div className="flex gap-2 items-center">
                <Check className="w-5 h-5" />
                <span>Dedicated support</span>
              </div>
              <div className="flex gap-2 items-center">
                <Check className="w-5 h-5" />
                <span>SLA guarantees</span>
              </div>
            </div>
            <Button size="lg" variant="outline" className="text-gray-900 bg-white">
              Contact Sales
            </Button>
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-2xl font-bold text-center">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">Can I change plans later?</h3>
              <p className="text-gray-400">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the
                next billing cycle.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">What happens if I exceed my limits?</h3>
              <p className="text-gray-400">
                For AI modules, you'll be charged the overage rate shown. For user/storage limits,
                you'll need to upgrade your plan.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Is there a free trial?</h3>
              <p className="text-gray-400">
                Yes, all plans come with a 14-day free trial. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
        onConfirm={alertDialog.confirmAction ? (selectedModule ? confirmAddModule : confirmUpgrade) : undefined}
        confirmText={alertDialog.confirmAction ? (selectedModule ? 'Add Module' : 'Upgrade') : 'OK'}
      />
    </Layout>
  );
};
