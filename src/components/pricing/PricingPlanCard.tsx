import { Check, Shield, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export interface Plan {
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
    maxStorageGB?: number;
    maxIntegrations: number;
  };
}

const FEATURE_LABELS: Record<string, string> = {
  multiTenant: 'Multi-tenant Support', emailIngestion: 'Email Ingestion',
  ticketing: 'Ticketing System', integrations: 'Integrations',
  rbac: 'Role-Based Access Control', basicDashboard: 'Basic Dashboard',
  aiSpamFiltering: 'AI Spam Filtering', aiClassification: 'AI Classification',
  aiKnowledgeBase: 'AI Knowledge Base', aiAutoReply: 'AI Auto-Reply',
  translations: 'Translations', advancedAnalytics: 'Advanced Analytics',
  sla: 'SLA Management', customWorkflows: 'Custom Workflows',
  dedicatedOnboarding: 'Dedicated Onboarding', jiraSync: 'Jira Sync',
};

export function getFeatureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}

function PlanLimits({ plan }: { plan: Plan }) {
  return (
    <div className="pb-6 mb-6 space-y-2 border-b">
      <p className="text-sm text-gray-400"><strong>{plan.limits.maxUsers.toLocaleString()}</strong> users</p>
      <p className="text-sm text-gray-400">
        <strong>{plan.limits.maxMessagesPerMonth ? plan.limits.maxMessagesPerMonth.toLocaleString() : plan.limits.maxStorageGB ? `${plan.limits.maxStorageGB}GB (legacy)` : '—'}</strong>{' '}
        {plan.limits.maxMessagesPerMonth ? 'messages/month' : 'storage'}
      </p>
      <p className="text-sm text-gray-400"><strong>{plan.limits.maxIntegrations}</strong> integrations</p>
    </div>
  );
}

interface BasePlanCardProps {
  plan: Plan;
  currentPlanName: string | null;
  upgrading: string | null;
  onSelect: (name: string) => void;
}

export function BasePlanCard({ plan, currentPlanName, upgrading, onSelect }: BasePlanCardProps) {
  const isPopular = plan.name === 'growing';
  return (
    <Card className={`relative flex flex-col justify-between ${isPopular ? 'border-2 border-blue-500 shadow-lg' : ''}`}>
      {isPopular && <Badge className="absolute -top-3 left-1/2 text-white bg-blue-500 -translate-x-1/2">Most Popular</Badge>}
      <CardHeader>
        <CardTitle className="text-center">
          <div className="text-2xl font-bold">{plan.displayName}</div>
          <div className="mt-4"><span className="text-4xl font-bold">{plan.currency === 'EUR' ? '€' : '$'}{(plan.price / 100).toFixed(0)}</span><span className="text-gray-400">/{plan.billingInterval}</span></div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PlanLimits plan={plan} />
        <div className="mb-6 space-y-3">
          {Object.entries(plan.features).filter(([_, e]) => e).map(([key]) => (
            <div key={key} className="flex gap-2 items-start"><Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" /><span className="text-sm">{getFeatureLabel(key)}</span></div>
          ))}
        </div>
        <Button className="w-full" variant={isPopular ? 'primary' : 'outline'} onClick={() => onSelect(plan.name)} disabled={upgrading === plan.name || plan.name === 'admin' || plan.name === currentPlanName}>
          {upgrading === plan.name ? 'Processing...' : plan.name === currentPlanName ? 'Current Plan' : plan.name === 'admin' ? 'Not Available' : 'Get Started'}
        </Button>
      </CardContent>
    </Card>
  );
}

interface EnterprisePlanCardProps {
  plan: Plan;
  currentPlanName: string | null;
  upgrading: string | null;
  onSelect: (name: string) => void;
}

export function EnterprisePlanCard({ plan, currentPlanName, upgrading, onSelect }: EnterprisePlanCardProps) {
  return (
    <Card className="border-purple-500 border-2">
      <CardHeader>
        <CardTitle className="text-center">
          <div className="flex gap-2 justify-center items-center mb-2"><Shield className="w-6 h-6 text-purple-600" /><span className="text-2xl font-bold">{plan.displayName}</span></div>
          <div className="mt-4"><span className="text-4xl font-bold">{plan.currency === 'EUR' ? '€' : '$'}{(plan.price / 100).toFixed(0)}</span><span className="text-gray-400">/{plan.billingInterval}</span></div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="pb-6 mb-6 space-y-2 border-b">
          <p className="text-sm text-gray-400"><strong>{plan.limits.maxUsers.toLocaleString()}</strong> users</p>
          <p className="text-sm text-gray-400"><strong>{plan.limits.maxMessagesPerMonth ? plan.limits.maxMessagesPerMonth.toLocaleString() : '—'}</strong> messages/month</p>
          <p className="text-sm text-gray-400"><strong>{plan.limits.maxIntegrations}</strong> integrations</p>
        </div>
        <div className="mb-6 space-y-3">
          {Object.entries(plan.features).filter(([_, e]) => e).slice(0, 8).map(([key]) => (
            <div key={key} className="flex gap-2 items-start"><Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" /><span className="text-sm">{getFeatureLabel(key)}</span></div>
          ))}
        </div>
        <Button className="w-full" variant="primary" onClick={() => onSelect(plan.name)} disabled={upgrading === plan.name || plan.name === currentPlanName}>
          {upgrading === plan.name ? 'Processing...' : plan.name === currentPlanName ? 'Current Plan' : 'Select Plan'}
        </Button>
      </CardContent>
    </Card>
  );
}

interface BundlePlanCardProps {
  plan: Plan;
  currentPlanName: string | null;
  upgrading: string | null;
  onSelect: (name: string) => void;
}

export function BundlePlanCard({ plan, currentPlanName, upgrading, onSelect }: BundlePlanCardProps) {
  return (
    <Card className="border-purple-200">
      <CardHeader>
        <CardTitle className="text-center">
          <div className="flex gap-2 justify-center items-center mb-2"><Zap className="w-6 h-6 text-purple-600" /><span className="text-2xl font-bold">{plan.displayName}</span></div>
          <div className="mt-4"><span className="text-4xl font-bold">{plan.currency === 'EUR' ? '€' : '$'}{(plan.price / 100).toFixed(0)}</span><span className="text-gray-400">/{plan.billingInterval}</span></div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PlanLimits plan={plan} />
        <div className="mb-6 space-y-3">
          {Object.entries(plan.features).filter(([_, e]) => e).slice(0, 8).map(([key]) => (
            <div key={key} className="flex gap-2 items-start"><Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" /><span className="text-sm">{getFeatureLabel(key)}</span></div>
          ))}
        </div>
        <Button className="w-full" variant="primary" onClick={() => onSelect(plan.name)} disabled={upgrading === plan.name || plan.name === currentPlanName}>
          {upgrading === plan.name ? 'Processing...' : plan.name === currentPlanName ? 'Current Plan' : 'Get Started'}
        </Button>
      </CardContent>
    </Card>
  );
}
