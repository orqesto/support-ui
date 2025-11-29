import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, CreditCard, TrendingUp, Zap, Check } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
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

type AIModule = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  monthlyFee: number;
  includedUnits: number;
  overagePrice: number;
  unitName: string;
  category: string;
};

type EnabledModule = {
  moduleId: number;
  moduleName: string;
  displayName: string;
  isEnabled: boolean;
  currentPeriodUsage: number;
  includedUnits: number;
};

type TabType = 'plans' | 'ai-modules';

export const SubscriptionPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageModule[]>([]);
  const [availableModules, setAvailableModules] = useState<AIModule[]>([]);
  const [enabledModules, setEnabledModules] = useState<EnabledModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(
    (searchParams.get('tab') as TabType) || 'plans'
  );
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const canManage = user
    ? hasPermission(user.role, user.organizationRole, Permission.MANAGE_SUBSCRIPTION)
    : false;

  const canManageAI = user
    ? hasPermission(user.role, user.organizationRole, Permission.MANAGE_AI_MODULES)
    : false;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subRes, usageRes, modulesRes, myModulesRes] = await Promise.all([
          apiClient.get('/api/subscriptions/current'),
          apiClient.get('/api/subscriptions/usage'),
          apiClient.get('/api/subscriptions/modules'),
          apiClient.get('/api/subscriptions/my-modules'),
        ]);

        setSubscription(subRes.data.data);
        setUsage(usageRes.data.data.usage || []);
        setAvailableModules(modulesRes.data.data.modules || []);
        setEnabledModules(myModulesRes.data.data.modules || []);
      } catch (error) {
        console.error('Failed to load subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const isModuleEnabled = (moduleId: number) =>
    enabledModules.some((m) => m.moduleId === moduleId && m.isEnabled);

  const calculateTotalCost = () => {
    const enabledIds = enabledModules.filter((m) => m.isEnabled).map((m) => m.moduleId);
    return availableModules
      .filter((m) => enabledIds.includes(m.id))
      .reduce((sum, m) => sum + m.monthlyFee, 0);
  };

  const handleToggleModule = async (moduleId: number) => {
    const module = availableModules.find((m) => m.id === moduleId);
    const isEnabled = isModuleEnabled(moduleId);
    const endpoint = isEnabled
      ? `/api/subscriptions/modules/${moduleId}/disable`
      : `/api/subscriptions/modules/${moduleId}/enable`;

    try {
      await apiClient.post(endpoint);
      const myModulesRes = await apiClient.get('/api/subscriptions/my-modules');
      setEnabledModules(myModulesRes.data.data.modules || []);

      setAlertDialog({
        open: true,
        title: 'Success',
        description: `${module?.displayName ?? 'Module'} ${isEnabled ? 'disabled' : 'enabled'} successfully!`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to toggle module:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: `Failed to ${isEnabled ? 'disable' : 'enable'} ${module?.displayName ?? 'module'}.`,
        variant: 'error',
      });
    }
  };

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

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading subscription...</div>
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
              <AlertCircle className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No Subscription</h3>
              <p className="mb-4 text-muted-foreground">
                You don't have an active subscription yet.
              </p>
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
            <p className="mt-1 text-muted-foreground">Manage your plan and AI modules</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg border bg-muted">
          <button
            onClick={() => handleTabChange('plans')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'plans'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CreditCard className="inline mr-2 w-4 h-4" />
            Base Plans
          </button>
          <button
            onClick={() => handleTabChange('ai-modules')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'ai-modules'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="inline mr-2 w-4 h-4" />
            AI Modules
          </button>
        </div>

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <>
            {/* Current Plan Card */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Current Plan</CardTitle>
                  <Badge className={getStatusColor(subscription.status)}>
                    {subscription.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Plan</p>
                    <p className="text-2xl font-bold">{subscription.plan.displayName}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Price</p>
                    <p className="text-2xl font-bold">
                      {subscription.plan.currency === 'EUR' ? '€' : '$'}
                      {(subscription.plan.price / 100).toFixed(2)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{subscription.plan.billingInterval}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Next Billing Date</p>
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
                              <p className="text-sm text-foreground/70">
                                {module.current.toLocaleString()} /{' '}
                                {module.included.toLocaleString()} {module.unitName}s used
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
                  <p className="text-sm text-foreground/70">
                    View detailed usage trends and analytics
                  </p>
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
          </>
        )}

        {/* AI Modules Tab */}
        {activeTab === 'ai-modules' && (
          <>
            {/* Cost Summary Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Total AI Modules Cost</p>
                    <p className="text-3xl font-bold">€{(calculateTotalCost() / 100).toFixed(2)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {enabledModules.filter((m) => m.isEnabled).length} modules enabled
                    </p>
                  </div>
                  <div className="text-right">
                    <Zap className="mb-2 w-12 h-12 text-purple-600" />
                    <p className="text-sm text-foreground/60">AI-Powered</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modules Grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {availableModules.map((module) => {
                const enabled = isModuleEnabled(module.id);
                const enabledData = enabledModules.find((m) => m.moduleId === module.id);
                const usagePercentage = enabledData
                  ? (enabledData.currentPeriodUsage / enabledData.includedUnits) * 100
                  : 0;

                return (
                  <Card
                    key={module.id}
                    className={`relative flex flex-col justify-between ${enabled ? 'border-2 border-blue-500' : ''}`}
                  >
                    {enabled && (
                      <Badge className="absolute top-4 right-4 text-white bg-green-500">
                        <Check className="mr-1 w-3 h-3" />
                        Enabled
                      </Badge>
                    )}

                    <CardHeader>
                      <CardTitle className="pr-20">
                        <div className="flex gap-3 items-start">
                          <Zap className="flex-shrink-0 mt-1 w-6 h-6 text-purple-600" />
                          <div>
                            <h3 className="text-lg font-semibold">{module.displayName}</h3>
                            <p className="mt-1 text-sm font-normal text-foreground/70">
                              {module.description}
                            </p>
                          </div>
                        </div>
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      {/* Pricing */}
                      <div className="pb-4 mb-4 border-b">
                        <div className="flex gap-2 items-baseline mb-2">
                          <span className="text-2xl font-bold">
                            €{(module.monthlyFee / 100).toFixed(0)}
                          </span>
                          <span className="text-foreground/60">/month</span>
                        </div>
                        <div className="space-y-1 text-sm text-foreground/70">
                          <p>
                            <strong>{module.includedUnits.toLocaleString()}</strong>{' '}
                            {module.unitName}s included
                          </p>
                          <p className="text-xs text-foreground/60">
                            +€{(module.overagePrice / 100).toFixed(2)} per additional{' '}
                            {module.unitName}
                          </p>
                        </div>
                      </div>

                      {/* Usage (if enabled) */}
                      {enabled && enabledData && (
                        <div className="p-3 mb-4 rounded-lg border bg-muted/50">
                          <p className="mb-2 text-sm font-medium">Current Usage</p>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-foreground/70">
                              {enabledData.currentPeriodUsage.toLocaleString()} /{' '}
                              {enabledData.includedUnits.toLocaleString()}
                            </span>
                            <span className="font-semibold">{usagePercentage.toFixed(1)}%</span>
                          </div>
                          <div className="mt-2 w-full h-2 rounded-full bg-muted">
                            <div
                              className="h-2 bg-blue-600 rounded-full transition-all"
                              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      {canManageAI && (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => handleToggleModule(module.id)}
                        >
                          {enabled ? 'Disable Module' : 'Enable Module'}
                        </Button>
                      )}

                      {!canManageAI && enabled && (
                        <div className="text-sm text-center text-foreground/60">
                          Contact admin to manage modules
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
