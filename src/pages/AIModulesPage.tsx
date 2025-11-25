/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react';
import { Check, CreditCard, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, Permission } from '@/types/roles';

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

export const AIModulesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [availableModules, setAvailableModules] = useState<AIModule[]>([]);
  const [enabledModules, setEnabledModules] = useState<EnabledModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const canManage = user
    ? hasPermission(user.role, user.organizationRole, Permission.MANAGE_AI_MODULES)
    : false;

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const [modulesRes, myModulesRes] = await Promise.all([
          apiClient.get('/api/subscriptions/modules'),
          apiClient.get('/api/subscriptions/my-modules'),
        ]);

        setAvailableModules(modulesRes.data.data.modules || []);
        setEnabledModules(myModulesRes.data.data.modules || []);
      } catch (error) {
        console.error('Failed to load modules:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchModules();
  }, []);

  const isModuleEnabled = (moduleId: number) =>
    enabledModules.some((m) => m.moduleId === moduleId && m.isEnabled);

  const calculateTotalCost = () => {
    const enabledIds = enabledModules.filter((m) => m.isEnabled).map((m) => m.moduleId);
    const enabledModuleCosts = availableModules
      .filter((m) => enabledIds.includes(m.id))
      .reduce((sum, m) => sum + m.monthlyFee, 0);
    return enabledModuleCosts;
  };

  const handleToggleModule = async (moduleId: number) => {
    const module = availableModules.find((m) => m.id === moduleId);
    const isEnabled = isModuleEnabled(moduleId);
    const endpoint = isEnabled
      ? `/api/subscriptions/modules/${moduleId}/disable`
      : `/api/subscriptions/modules/${moduleId}/enable`;

    try {
      await apiClient.post(endpoint);

      // Refresh module data after toggle
      const myModulesRes = await apiClient.get('/api/subscriptions/my-modules');
      setEnabledModules(myModulesRes.data.data.modules || []);

      // Show success notification
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `${module?.displayName ?? 'Module'} ${isEnabled ? 'disabled' : 'enabled'} successfully!`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to toggle module:', error);

      // Show error notification
      setAlertDialog({
        open: true,
        title: 'Error',
        description: `Failed to ${isEnabled ? 'disable' : 'enable'} ${module?.displayName ?? 'module'}. Please try again.`,
        variant: 'error',
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading AI modules...</div>
        </div>
      </Layout>
    );
  }

  const totalCost = calculateTotalCost();

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <div>
              <h1 className="text-2xl font-bold">AI Modules</h1>
              <p className="mt-1 text-gray-500">Manage your AI-powered features</p>
            </div>
          </div>
        </div>

        {/* Cost Summary Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="mb-1 text-sm text-gray-500">Total Monthly Cost</p>
                <p className="text-3xl font-bold">€{(totalCost / 100).toFixed(2)}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {enabledModules.filter((m) => m.isEnabled).length} modules enabled
                </p>
              </div>
              <div className="text-right">
                <Zap className="mb-2 w-12 h-12 text-purple-600" />
                <p className="text-sm text-gray-500">AI-Powered</p>
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
                        <p className="mt-1 text-sm font-normal text-gray-500">
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
                      <span className="text-gray-500">/month</span>
                    </div>
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>
                        <strong>{module.includedUnits.toLocaleString()}</strong> {module.unitName}s
                        included
                      </p>
                      <p className="text-xs text-gray-400">
                        +€{(module.overagePrice / 100).toFixed(2)} per additional {module.unitName}
                      </p>
                    </div>
                  </div>

                  {/* Usage (if enabled) */}
                  {enabled && enabledData && (
                    <div className="p-3 mb-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="mb-2 text-sm font-medium">Current Usage</p>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">
                          {enabledData.currentPeriodUsage.toLocaleString()} /{' '}
                          {enabledData.includedUnits.toLocaleString()}
                        </span>
                        <span className="font-semibold">{usagePercentage.toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 w-full h-2 bg-gray-200 rounded-full">
                        <div
                          className="h-2 bg-blue-600 rounded-full transition-all"
                          style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Features */}
                  <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium">What's included:</p>
                    <div className="space-y-1">
                      {module.category === 'detection' && (
                        <>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Automatic content filtering</span>
                          </div>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Real-time detection</span>
                          </div>
                        </>
                      )}
                      {module.category === 'automation' && (
                        <>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Smart categorization</span>
                          </div>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Priority assignment</span>
                          </div>
                        </>
                      )}
                      {module.category === 'engagement' && (
                        <>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Context-aware responses</span>
                          </div>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">24/7 availability</span>
                          </div>
                        </>
                      )}
                      {module.category === 'localization' && (
                        <>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">100+ languages</span>
                          </div>
                          <div className="flex gap-2 items-start">
                            <Check className="h-4 w-4 text-green-500 mt-0.5" />
                            <span className="text-sm">Preserve formatting</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  {canManage && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => handleToggleModule(module.id)}
                    >
                      {enabled ? 'Disable Module' : 'Enable Module'}
                    </Button>
                  )}

                  {!canManage && enabled && (
                    <div className="text-sm text-center text-gray-400">
                      Contact admin to manage modules
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>💡 About AI Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-400">
              <p>
                • AI modules are billed separately from your base plan and can be enabled/disabled
                anytime
              </p>
              <p>
                • Each module includes a generous allocation of units per month (e.g., messages,
                tickets, translations)
              </p>
              <p>
                • If you exceed your included units, you'll be charged the overage rate shown per
                additional unit
              </p>
              <p>• Overage charges are calculated and billed at the end of your billing period</p>
              <p>
                • You can monitor usage in real-time on the{' '}
                <button
                  onClick={() => navigate('/settings/usage')}
                  className="text-blue-600 hover:underline"
                >
                  Usage Statistics
                </button>{' '}
                page
              </p>
            </div>
          </CardContent>
        </Card>

        {/* View Base Plans Link */}
        <Card>
          <CardContent className="p-6 text-center">
            <p className="mb-4 text-sm text-gray-400">
              AI Modules work with all subscription plans. Need to upgrade your base plan?
            </p>
            <Button variant="outline" onClick={() => navigate('/subscription')}>
              <CreditCard className="mr-2 w-4 h-4" />
              View Subscription & Plans
            </Button>
          </CardContent>
        </Card>
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
