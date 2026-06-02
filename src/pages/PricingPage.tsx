import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import { BasePlanCard, EnterprisePlanCard, BundlePlanCard, type Plan } from '@/components/pricing/PricingPlanCard';

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
  const [removingModule, setRemovingModule] = useState<number | null>(null);
  const [moduleAction, setModuleAction] = useState<'add' | 'remove'>('add');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<AIModule | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean; title: string; description: string;
    variant: 'success' | 'error' | 'warning' | 'info'; confirmAction?: boolean;
  }>({ open: false, title: '', description: '', variant: 'info', confirmAction: false });

  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const [plansRes, modulesRes, currentRes, activeModulesRes] = await Promise.all([
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
          apiClient.get<{ success: boolean; data: { modules: AIModule[] } }>('/api/subscriptions/modules'),
          apiClient.get<{ success: boolean; data: { plan: { name: string } } }>('/api/subscriptions/current').catch(() => null),
          apiClient.get<{ success: boolean; data: { modules: { moduleId: number }[] } }>('/api/subscriptions/modules/active').catch(() => null),
        ]);
        setPlans(plansRes.data.data.plans);
        setModules(modulesRes.data.data.modules);
        if (currentRes?.data?.data?.plan?.name) setCurrentPlanName(currentRes.data.data.plan.name);
        if (activeModulesRes?.data?.data?.modules) {
          setActiveModuleIds(new Set(activeModulesRes.data.data.modules.map((mod) => mod.moduleId)));
        }
      } catch (error) {
        logger.error('Failed to load pricing:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchPricing();
  }, []);

  const extractApiError = (error: unknown, fallback: string): string => {
    if (error instanceof Error && 'response' in error) {
      const resp = (error as { response?: { data?: { error?: string } } }).response;
      if (typeof resp?.data?.error === 'string') return resp.data.error;
    }
    return fallback;
  };

  const handleSelectPlan = (planName: string) => {
    if (planName === 'admin' && !isGlobalAdmin) {
      setAlertDialog({ open: true, title: 'Not Available', description: 'Admin plan cannot be selected. This plan is reserved for system administrators.', variant: 'error', confirmAction: false });
      return;
    }
    setSelectedPlan(planName);
    setAlertDialog({ open: true, title: 'Confirm Upgrade', description: `Are you sure you want to upgrade to the ${planName} plan? This change will take effect immediately.`, variant: 'info', confirmAction: true });
  };

  const confirmUpgrade = async () => {
    if (!selectedPlan) return;
    setUpgrading(selectedPlan);
    setAlertDialog({ ...alertDialog, open: false });
    try {
      await apiClient.post('/api/subscriptions/upgrade', { planName: selectedPlan });
      setCurrentPlanName(selectedPlan);
      setAlertDialog({ open: true, title: 'Success!', description: `Successfully upgraded to ${selectedPlan} plan! Redirecting...`, variant: 'success', confirmAction: false });
      setTimeout(() => { navigate('/subscription'); }, 1500);
    } catch (error: unknown) {
      setAlertDialog({ open: true, title: 'Error', description: extractApiError(error, 'Failed to upgrade plan'), variant: 'error', confirmAction: false });
    } finally {
      setUpgrading(null);
      setSelectedPlan(null);
    }
  };

  const handleAddModule = (module: AIModule) => {
    setSelectedModule(module);
    setModuleAction('add');
    setAlertDialog({ open: true, title: 'Add Module', description: `Add ${module.displayName} to your plan for €${(module.monthlyFee / 100).toFixed(0)}/month?`, variant: 'info', confirmAction: true });
  };

  const confirmAddModule = async () => {
    if (!selectedModule) return;
    setAddingModule(selectedModule.id);
    setAlertDialog({ ...alertDialog, open: false });
    try {
      await apiClient.post(`/api/subscriptions/modules/${selectedModule.id}/add`, {});
      setActiveModuleIds((prev) => new Set([...prev, selectedModule.id]));
      setAlertDialog({ open: true, title: 'Module Added!', description: `${selectedModule.displayName} has been added to your plan.`, variant: 'success', confirmAction: false });
    } catch (error: unknown) {
      setAlertDialog({ open: true, title: 'Error', description: extractApiError(error, 'Failed to add module'), variant: 'error', confirmAction: false });
    } finally {
      setAddingModule(null);
      setSelectedModule(null);
    }
  };

  const handleRemoveModule = (module: AIModule) => {
    setSelectedModule(module);
    setModuleAction('remove');
    setAlertDialog({ open: true, title: 'Disable Module', description: `Disable ${module.displayName}? You will lose access to this feature immediately.`, variant: 'warning', confirmAction: true });
  };

  const confirmRemoveModule = async () => {
    if (!selectedModule) return;
    setRemovingModule(selectedModule.id);
    setAlertDialog({ ...alertDialog, open: false });
    try {
      await apiClient.post(`/api/subscriptions/modules/${selectedModule.id}/disable`, {});
      setActiveModuleIds((prev) => { const next = new Set(prev); next.delete(selectedModule.id); return next; });
      setAlertDialog({ open: true, title: 'Module Disabled', description: `${selectedModule.displayName} has been disabled.`, variant: 'success', confirmAction: false });
    } catch (error: unknown) {
      setAlertDialog({ open: true, title: 'Error', description: extractApiError(error, 'Failed to disable module'), variant: 'error', confirmAction: false });
    } finally {
      setRemovingModule(null);
      setSelectedModule(null);
    }
  };

  const basePlans = plans.filter((plan) => plan.planType === 'base');
  const bundlePlans = plans.filter((plan) => plan.planType === 'bundle');
  const enterprisePlans = plans.filter((plan) => plan.planType === 'enterprise' && (isGlobalAdmin || plan.name !== 'admin'));

  if (loading) {
    return <Layout><div className="flex justify-center items-center h-64"><div className="text-gray-500">Loading pricing...</div></div></Layout>;
  }

  return (
    <Layout>
      <div className="p-6 mx-auto space-y-12 max-w-7xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/subscription')}><ArrowLeft className="mr-2 w-4 h-4" />Back</Button>
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold">Choose Your Plan</h1>
          <p className="text-xl text-gray-400">Scale your support operations with flexible pricing</p>
        </div>

        {/* Base Plans */}
        <div>
          <h2 className="mb-6 text-2xl font-bold">Base Plans</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {basePlans.map((plan) => <BasePlanCard key={plan.id} plan={plan} currentPlanName={currentPlanName} upgrading={upgrading} onSelect={handleSelectPlan} />)}
          </div>
        </div>

        {/* Admin/Enterprise Plans */}
        {isGlobalAdmin && enterprisePlans.length > 0 && (
          <div>
            <h2 className="mb-6 text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-purple-600" />Administrator Plans</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {enterprisePlans.map((plan) => <EnterprisePlanCard key={plan.id} plan={plan} currentPlanName={currentPlanName} upgrading={upgrading} onSelect={handleSelectPlan} />)}
            </div>
          </div>
        )}

        {/* Bundle Plans */}
        {bundlePlans.length > 0 && (
          <div>
            <h2 className="mb-6 text-2xl font-bold">AI-Powered Bundles</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {bundlePlans.map((plan) => <BundlePlanCard key={plan.id} plan={plan} currentPlanName={currentPlanName} upgrading={upgrading} onSelect={handleSelectPlan} />)}
            </div>
          </div>
        )}

        {/* AI Modules */}
        <div>
          <h2 className="mb-3 text-2xl font-bold">AI Module Add-ons</h2>
          <p className="mb-6 text-gray-400">Enhance your plan with powerful AI capabilities</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <Card key={module.id} className="flex flex-col justify-between h-full transition-shadow hover:shadow-md">
                <div>
                  <CardHeader>
                    <CardTitle className="flex justify-between items-start">
                      <div><div className="font-semibold">{module.displayName}</div><p className="mt-1 text-sm font-normal text-gray-400">{module.description}</p></div>
                      <div className="flex flex-col flex-shrink-0 items-end ml-4"><span className="text-2xl font-bold">€{(module.monthlyFee / 100).toFixed(0)}</span><span className="text-sm text-gray-400">/month</span></div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p><strong>{module.includedUnits.toLocaleString()}</strong> {module.unitName}s included</p>
                      <p>€{(module.overagePrice / 100).toFixed(2)} per additional {module.unitName}</p>
                    </div>
                  </CardContent>
                </div>
                <CardContent className="pt-0">
                  {activeModuleIds.has(module.id) ? (
                    <Button variant="destructive" className="w-full" onClick={() => handleRemoveModule(module)} disabled={removingModule === module.id}>{removingModule === module.id ? 'Disabling...' : 'Disable'}</Button>
                  ) : (
                    <Button variant="outline" className="w-full" onClick={() => handleAddModule(module)} disabled={addingModule === module.id}>{addingModule === module.id ? 'Adding...' : 'Add to Plan'}</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <Card className="text-white bg-gradient-to-r from-gray-900 to-gray-800">
          <CardContent className="p-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">Enterprise</h2>
            <p className="mb-6 text-xl text-gray-300">Custom solutions for large teams with specific requirements</p>
            <div className="flex flex-wrap gap-6 justify-center mb-8">
              {['Unlimited users','Custom integrations','Dedicated support','SLA guarantees'].map((feat) => (
                <div key={feat} className="flex gap-2 items-center"><Check className="w-5 h-5" /><span>{feat}</span></div>
              ))}
            </div>
            <Button size="lg" variant="outline" className="text-gray-900 bg-white">Contact Sales</Button>
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-2xl font-bold text-center">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {[
              { question: 'Can I change plans later?', answer: 'Yes, you can upgrade or downgrade your plan at any time. Plan changes take effect immediately.' },
              { question: 'What happens if I exceed my limits?', answer: "For AI modules, you'll be charged the overage rate shown. For user/storage limits, you'll need to upgrade your plan." },
              { question: 'Is there a free trial?', answer: 'Yes, all plans come with a 14-day free trial. No credit card required.' },
            ].map(({ question, answer }) => (
              <div key={question}><h3 className="mb-2 font-semibold">{question}</h3><p className="text-gray-400">{answer}</p></div>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
        onConfirm={alertDialog.confirmAction ? (selectedModule ? (moduleAction === 'remove' ? confirmRemoveModule : confirmAddModule) : confirmUpgrade) : undefined}
        confirmText={alertDialog.confirmAction ? (selectedModule ? (moduleAction === 'remove' ? 'Disable' : 'Add Module') : 'Upgrade') : 'OK'}
      />
    </Layout>
  );
};
