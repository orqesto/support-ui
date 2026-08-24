import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { BasePlanCard, EnterprisePlanCard, type Plan } from '@/components/pricing/PricingPlanCard';

export const PricingPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
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
        const [plansRes, currentRes] = await Promise.all([
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
          apiClient.get<{ success: boolean; data: { plan: { name: string } } }>('/api/subscriptions/current').catch(() => null),
        ]);
        setPlans(plansRes.data.data.plans);
        if (currentRes?.data?.data?.plan?.name) setCurrentPlanName(currentRes.data.data.plan.name);
      } catch (error) {
        logger.error('Failed to load pricing:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchPricing();
  }, []);

  const extractApiError = (error: unknown, fallback: string): string =>
    getApiErrorMessage(error) ?? fallback;

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
      // BE may respond with `requiresCheckout` for paid plans on Stripe-
      // configured installs — in that case we hand off to Stripe Checkout
      // and the webhook closes the loop on success.
      const response = await apiClient.post<{
        success: boolean;
        data: { requiresCheckout?: boolean; checkoutUrl?: string };
      }>('/api/subscriptions/upgrade', { planName: selectedPlan });

      const payload = response.data?.data;
      if (payload?.requiresCheckout && payload.checkoutUrl) {
        // Full-page nav — Stripe Checkout is a hosted page on a different
        // origin. `success_url` brings the customer back to /subscription.
        window.location.href = payload.checkoutUrl;
        return;
      }

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

  const basePlans = plans.filter((plan) => plan.planType === 'base');
  const enterprisePlans = plans.filter((plan) => plan.planType === 'enterprise' && (isGlobalAdmin || plan.name !== 'admin'));

  if (loading) {
    return <Layout><div className="flex justify-center items-center h-64"><div className="text-gray-500">Loading pricing...</div></div></Layout>;
  }

  return (
    <Layout>
      <div className="p-6 w-full space-y-12">
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
              { question: 'What happens if I exceed my limits?', answer: "You'll be prompted to upgrade to a higher plan with more capacity." },
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
        onConfirm={alertDialog.confirmAction ? confirmUpgrade : undefined}
        confirmText={alertDialog.confirmAction ? 'Upgrade' : 'OK'}
      />
    </Layout>
  );
};
