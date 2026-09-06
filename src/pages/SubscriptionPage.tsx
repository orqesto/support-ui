import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Users,
  Plug,
  MessageSquare,
  Zap,
  HardDrive,
  Settings,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AddPaymentMethodDialog } from '@/components/billing/AddPaymentMethodDialog';
import { MessagePackOfferCard } from '@/components/subscription/MessagePackOfferCard';
import { describeUsagePeriod } from '@/components/subscription/usagePeriodCopy';
import { useMessagePackReturn } from '@/components/subscription/useMessagePackReturn';
import { UsageTile, type UsageItem } from '@/components/subscription/UsageTile';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { VAT_NOTE, formatMoney } from '@/lib/money';
import { toast } from '@/lib/toast';
import {
  subscriptionService,
  type MessagePackOffer,
  type UsagePeriod,
} from '@/services/subscription.service';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, Permission } from '@/types/roles';


type DashboardData = {
  plan: {
    id: number;
    name: string;
    displayName: string;
    planType: string;
    price: number;
    currency: string;
  } | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  usage: {
    users: UsageItem;
    integrations: UsageItem;
    messages: UsageItem;
    aiCalls: UsageItem;
    storage: UsageItem;
  };
  limits: {
    maxUsers: number;
    maxIntegrations: number;
    maxMessagesPerMonth: number;
    maxAICallsPerMonth: number;
    maxStorageMb: number;
  };
  /** Both optional for the same skew reason as `UsageItem.extra`. */
  period?: UsagePeriod;
  messagePack?: MessagePackOffer;
};

type SubscriptionDetails = {
  plan: {
    id: number;
    name: string;
    displayName: string;
    planType: string;
    price: number;
    currency: string;
    billingInterval: string;
    limits: Record<string, number>;
    features: Record<string, boolean>;
  };
  subscription: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAt: string | null;
    /**
     * Told to us by the backend rather than derived here — the frontend cannot
     * see whether a Stripe subscription exists, and guessing produced a
     * "cancel subscription" card every org could click and none could use.
     *
     * Optional: this page can deploy ahead of the backend that sends them, and
     * the fallbacks below keep the old behaviour rather than white-screening.
     */
    canCancel?: boolean;
    cancellationRoute?: 'stripe' | 'local' | null;
    hasBillingPortal?: boolean;
    /**
     * Whether "add a card" is a real action here. Reported by the API because
     * this page cannot see whether a Stripe subscription exists — the last time
     * it guessed, it offered every workspace a billing portal none of them
     * could open.
     */
    canAddPaymentMethod?: boolean;
    /**
     * The workspace is on `free`, so paying means picking a plan first — there
     * is no card to add yet. This, not `canAddPaymentMethod`, is the state the
     * onboarding wizard's "finish without a card" actually produces.
     */
    needsPlanToPay?: boolean;
  };
};

/** "8 September 2026" — a last-day-of-access reads better without a clock time. */
const formatAccessEnd = (value: string): string =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  useMessagePackReturn();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);
  const [buyingPack, setBuyingPack] = useState(false);

  const handleBuyPack = async () => {
    setBuyingPack(true);
    try {
      const { checkoutUrl } = await subscriptionService.createMessagePackCheckout();
      // Full-page nav — Stripe Checkout lives on stripe.com and returns to
      // /subscription?status=pack_success per the backend's success_url.
      window.location.href = checkoutUrl;
    } catch (err) {
      logger.error('Failed to start message-pack checkout:', err);
      // 409 carries the one-sentence reason (free plan, trial, no cap…) — show it.
      toast.failure('start the message-pack checkout', err);
      setBuyingPack(false);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const url = await subscriptionService.openCustomerPortal();
      // Full-page nav — Stripe Portal lives on stripe.com and returns to
      // /subscription?status=portal_return per BE's return_url.
      window.location.href = url;
    } catch (err) {
      logger.error('Failed to open customer portal:', err);
      // BE returns 400 when org has no Stripe customer yet (haven't completed
      // checkout) — surface that wording, not a generic error.
      toast.failure('open the billing portal', err);
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const result = await subscriptionService.cancelSubscription();
      // Refetch rather than patching local state: the backend decides the real
      // end date (Stripe's answer wins over our stored period end), so echoing
      // an optimistic guess here is how a customer gets told the wrong last day.
      await refresh();
      toast.success(
        `Subscription cancelled. You keep full access until ${formatAccessEnd(result.accessEndsAt)}.`
      );
    } catch (err) {
      logger.error('Failed to cancel subscription:', err);
      toast.failure('cancel the subscription', err);
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  const handleResume = async () => {
    setResuming(true);
    try {
      await subscriptionService.resumeSubscription();
      await refresh();
      toast.success('Cancellation undone — your subscription continues as normal.');
    } catch (err) {
      logger.error('Failed to resume subscription:', err);
      toast.failure('resume the subscription', err);
    } finally {
      setResuming(false);
    }
  };

  const canManage = user
    ? hasPermission(
        user.role,
        user.organizationRole,
        Permission.MANAGE_SUBSCRIPTION,
        user.permissionOverrides
      )
    : false;

  // Named so cancel/resume can re-read the server's answer rather than patching
  // local state from what they hoped happened.
  const refresh = useCallback(async () => {
    try {
      const [dashboardRes, subRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: DashboardData }>('/api/subscriptions/dashboard'),
        apiClient.get<{ success: boolean; data: SubscriptionDetails }>(
          '/api/subscriptions/current'
        ),
      ]);

      setDashboard(dashboardRes.data.data);
      setSubscriptionDetails(subRes.data.data);
    } catch (error) {
      logger.error('Failed to load subscription:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  // The pack is offered where the limit is felt: on the Messages tile and inside the
  // limit-reached alert, not only in a card further down (owner, staging 2026-09-05:
  // "pretty hard to find where exactly that buy 1000 messages on page").
  const packOffer = dashboard?.messagePack;
  const canBuyPack = canManage && packOffer?.available === true;
  const buyPackButton = (variant: 'primary' | 'outline') =>
    canBuyPack && packOffer ? (
      <Button
        size="sm"
        variant={variant}
        onClick={handleBuyPack}
        isLoading={buyingPack}
        data-testid={variant === 'primary' ? 'buy-message-pack-alert' : 'buy-message-pack-tile'}
      >
        Buy {packOffer.messages.toLocaleString()} messages
      </Button>
    ) : null;

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading subscription...</div>
        </div>
      </Layout>
    );
  }

  if (!dashboard || !subscriptionDetails) {
    return (
      <Layout>
        <div className="p-6 mx-auto max-w-4xl">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No Subscription</h3>
              <p className="mb-4 text-muted-foreground">
                You don&apos;t have an active subscription yet.
              </p>
              {canManage && <Button onClick={() => navigate('/pricing')}>View Plans</Button>}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const { plan, subscription } = subscriptionDetails;
  const { usage } = dashboard;

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Subscription & Usage</h1>
            <p className="mt-1 text-muted-foreground">Monitor your plan usage and limits</p>
          </div>
          {canManage && (
            <Button onClick={() => navigate('/pricing')}>
              <CreditCard className="mr-2 w-4 h-4" />
              Change Plan
            </Button>
          )}
        </div>

        {/* A scheduled cancellation is the single most important thing on this
            page once it exists — it changes when the product stops working, so
            it sits above the plan rather than inside the card grid below. */}
        {subscription.cancelAt && (
          <Card className="border-amber-500/50">
            <CardContent className="flex flex-wrap gap-3 justify-between items-center p-4">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="mt-0.5 w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium">
                    {`Cancelled — your subscription ends on ${formatAccessEnd(subscription.cancelAt)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Nothing changes until then: you keep every feature on your current plan for
                    the period you have already paid for.
                  </p>
                </div>
              </div>
              {canManage && (
                <Button
                  variant="secondary"
                  isLoading={resuming}
                  onClick={() => void handleResume()}
                >
                  Keep my subscription
                </Button>
              )}
            </CardContent>
          </Card>
        )}

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
                <p className="mb-1 text-sm text-muted-foreground">Plan</p>
                <p className="text-2xl font-bold">{plan.displayName}</p>
                <Badge variant="secondary" className="mt-1">
                  {plan.planType}
                </Badge>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Price</p>
                <p className="text-2xl font-bold">
                  {formatMoney(plan.price, plan.currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{plan.billingInterval}
                  </span>
                </p>
                {/* The payment dialog one click away already says "excl. VAT"; this card
                    used to disagree with it, on the same screen. */}
                {plan.price > 0 && (
                  <p className="text-xs text-muted-foreground">{VAT_NOTE}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  {subscription.status === 'cancelled' || subscription.status === 'expired'
                    ? 'Period Ends'
                    : 'Next Billing Date'}
                </p>
                <p className="text-lg font-semibold">
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'N/A'}
                </p>
                {subscription.trialEndsAt && (
                  <p className="text-sm text-blue-600">
                    Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Features */}
            <div className="pt-6 mt-6 border-t">
              <p className="mb-3 text-sm font-semibold">Plan Features</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {plan.features &&
                  Object.entries(plan.features)
                    .filter(([, enabled]) => enabled)
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
          </CardContent>
        </Card>

        {/* Usage Dashboard */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>
                  <TrendingUp className="inline mr-2 w-5 h-5" />
                  {/* The allowance follows the billing cycle, not the calendar month
                      (owner decision 2026-09-04): name the period by its reset day. */}
                  {dashboard.period ? 'Usage This Period' : 'Usage This Month'}
                </CardTitle>
                {dashboard.period && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {describeUsagePeriod(dashboard.period)}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings/usage')}>
                View Details
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <UsageTile title="Users" icon={Users} item={usage.users} />
              <UsageTile title="Integrations" icon={Plug} item={usage.integrations} />
              <UsageTile
                title="Messages"
                icon={MessageSquare}
                item={usage.messages}
                action={buyPackButton('outline')}
              />
              <UsageTile title="AI Calls" icon={Zap} item={usage.aiCalls} />
              <UsageTile title="Storage (MB)" icon={HardDrive} item={usage.storage} />
            </div>

            {/* The message cap is the one limit with a second door besides upgrading. */}
            {canManage && (
              <MessagePackOfferCard
                offer={dashboard.messagePack}
                onBuy={handleBuyPack}
                buying={buyingPack}
              />
            )}

            {/* Warning Alert */}
            {(usage.users.warning ||
              usage.integrations.warning ||
              usage.messages.warning ||
              usage.aiCalls.warning ||
              usage.storage.warning) && (
              <div className="flex gap-3 items-start p-4 mt-4 bg-orange-50 rounded-lg border border-orange-200">
                <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                <div>
                  <p className="font-medium text-orange-800">
                    {usage.messages.critical ? 'Message limit reached' : 'Approaching Usage Limits'}
                  </p>
                  <p className="text-sm text-orange-700">
                    {usage.messages.critical
                      ? 'New messages still arrive in your inbox and you can keep replying. AI analysis, routing and drafts are paused until the period resets, you upgrade, or you add a message pack.'
                      : 'Some of your usage metrics are approaching their limits. Consider upgrading your plan for more capacity.'}
                  </p>
                  {canManage && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {usage.messages.critical && buyPackButton('primary')}
                      <Button size="sm" variant="outline" onClick={() => navigate('/pricing')}>
                        View Upgrade Options
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan Limits Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Limits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Max Users</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxUsers.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Max Integrations</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxIntegrations.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Messages / Month</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxMessagesPerMonth.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">AI Calls / Month</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxAICallsPerMonth === 0
                    ? 'Not included'
                    : dashboard.limits.maxAICallsPerMonth.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Storage</p>
                <p className="text-lg font-semibold">
                  {dashboard.limits.maxStorageMb.toLocaleString()} MB
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card
            className="transition-shadow cursor-pointer hover:shadow-md"
            onClick={() => navigate('/settings/usage')}
          >
            <CardContent className="p-6">
              <TrendingUp className="mb-3 w-8 h-8 text-blue-600" />
              <h3 className="mb-1 font-semibold">Usage Statistics</h3>
              <p className="text-sm text-foreground/70">View detailed usage trends and analytics</p>
            </CardContent>
          </Card>

          {canManage && (
            <Card
              className="transition-shadow cursor-pointer hover:shadow-md"
              onClick={() => navigate('/pricing')}
            >
              <CardContent className="p-6">
                <CreditCard className="mb-3 w-8 h-8 text-green-600" />
                <h3 className="mb-1 font-semibold">Change Plan</h3>
                <p className="text-sm text-foreground/70">
                  {/* This navigates to /pricing, which can upgrade and downgrade
                      but has no cancel — the old copy promised one there. */}
                  Move to a different plan
                </p>
              </CardContent>
            </Card>
          )}

          {/* A free workspace has no plan to put a card against, so the route
              to paying is choosing one. This is where "finish without a card"
              actually lands: the wizard never applies the plan a visitor
              arrived with, so the workspace is on `free` regardless. Offering a
              card form here would check out against a plan with no price. */}
          {canManage && subscription.needsPlanToPay && (
            <Card
              className="transition-shadow cursor-pointer hover:shadow-md"
              onClick={() => navigate('/pricing')}
            >
              <CardContent className="p-6">
                <CreditCard className="mb-3 w-8 h-8 text-blue-600" />
                <h3 className="mb-1 font-semibold">Choose a Plan</h3>
                <p className="text-sm text-foreground/70">
                  Pick a plan and add a card to keep working after the trial
                </p>
              </CardContent>
            </Card>
          )}

          {/* Offered when the workspace is already on a paid plan but has no
              card. Without this there was no route to paying for the plan you
              are already on: the portal needs a Stripe customer, and /pricing
              disables the button for your current plan. */}
          {canManage && subscription.canAddPaymentMethod && (
            <Card
              className="transition-shadow cursor-pointer hover:shadow-md"
              onClick={() => setAddingPaymentMethod(true)}
            >
              <CardContent className="p-6">
                <CreditCard className="mb-3 w-8 h-8 text-blue-600" />
                <h3 className="mb-1 font-semibold">Add a Payment Method</h3>
                <p className="text-sm text-foreground/70">
                  Save a card now so your plan continues when the trial ends
                </p>
              </CardContent>
            </Card>
          )}

          {/* Hidden without a Stripe customer: the endpoint 400s in that case,
              and until this gate existed the card was shown to every org — all
              of which are on manually-assigned plans and none of which could
              open it. Defaults to shown so an older backend behaves as before. */}
          {canManage && subscription.hasBillingPortal !== false && (
            <Card
              className={`transition-shadow ${portalLoading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:shadow-md'}`}
              onClick={() => {
                if (portalLoading) return;
                void handleOpenPortal();
              }}
            >
              <CardContent className="p-6">
                <Settings className="mb-3 w-8 h-8 text-purple-600" />
                <h3 className="mb-1 font-semibold">
                  {portalLoading ? 'Opening Billing Portal…' : 'Billing & Invoices'}
                </h3>
                <p className="text-sm text-foreground/70">
                  Update your card, view invoices, manage billing details
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cancelling is destructive and rarely wanted, so it is the quietest
            thing on the page — but it IS on the page, which it was not before. */}
        {canManage && subscription.canCancel && (
          <div className="pb-2">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              isLoading={cancelling}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel subscription
            </Button>
          </div>
        )}

        <AddPaymentMethodDialog
          open={addingPaymentMethod}
          onOpenChange={setAddingPaymentMethod}
          planName={plan.name}
          onAdded={() => void refresh()}
        />

        <ConfirmDialog
          open={confirmingCancel}
          onOpenChange={setConfirmingCancel}
          onConfirm={() => void handleCancel()}
          variant="danger"
          title="Cancel this subscription?"
          description={
            subscription.currentPeriodEnd
              ? `Your workspace keeps every feature until ${formatAccessEnd(
                  subscription.trialEndsAt && subscription.status === 'trialing'
                    ? subscription.trialEndsAt
                    : subscription.currentPeriodEnd
                )}, and nothing is charged after that. You can undo this at any time before then.`
              : 'Your workspace keeps every feature until the end of the period you have paid for. You can undo this at any time before then.'
          }
          confirmText="Cancel subscription"
          cancelText="Keep it"
        />
      </div>
    </Layout>
  );
};
