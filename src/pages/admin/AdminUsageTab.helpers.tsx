/**
 * Types and pure helpers for AdminUsageTab.
 * Extracted to keep AdminUsageTab.tsx under the max-lines limit.
 */

import { AlertTriangle } from 'lucide-react';

export type UsageItem = {
  current: number;
  limit: number;
  percentage: number;
  warning: boolean;
  critical: boolean;
};

export type UsageLimits = {
  maxUsers: number;
  maxIntegrations: number;
  maxMessagesPerMonth: number;
  maxAICallsPerMonth: number;
};

export type Usage = {
  users: UsageItem;
  integrations: UsageItem;
  messagesThisMonth: UsageItem;
  aiCalls: UsageItem;
};

export type Plan = {
  id: number;
  name: string;
  displayName: string;
  planType: 'base' | 'bundle' | 'enterprise';
  price: number;
  currency: string;
};

export type Subscription = {
  id: number;
  planId: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
};

export type OrganizationUsage = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  subscription: Subscription | null;
  plan: Plan | null;
  limits: UsageLimits;
  usage: Usage;
};

export type OrgModule = {
  id: number;
  moduleId: number;
  isActive: boolean;
  currentPeriodUsage: number | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
  module: {
    name: string;
    displayName: string;
    description: string;
    monthlyFee: number;
    unitName: string;
  };
};

export type CatalogModule = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  monthlyFee: number;
  unitName: string;
  isActive: boolean;
};

export const CANCELLABLE = new Set(['active', 'trialing', 'past_due']);
export const REACTIVATABLE = new Set(['cancelled', 'expired']);

export const getUsageColor = (percentage: number) => {
  if (percentage >= 100) return 'text-red-600 bg-red-50';
  if (percentage >= 80) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
};

export const getUsageBadge = (current: number, limit: number, percentage: number) => {
  const colorClass = getUsageColor(percentage);
  return (
    <div
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {current} / {limit}
      {percentage >= 80 && <AlertTriangle className="ml-1 w-3 h-3" />}
    </div>
  );
};

export const UsageProgressBar = ({ percentage }: { percentage: number }) => {
  const bgColor =
    percentage >= 100 ? 'bg-red-500' : percentage >= 80 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full">
      <div
        className={`h-2 rounded-full transition-all ${bgColor}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
};

export const getPlanTypeBadgeColor = (planType: string) => {
  switch (planType) {
    case 'base':
      return 'bg-blue-100 text-blue-700';
    case 'bundle':
      return 'bg-purple-100 text-purple-700';
    case 'enterprise':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

export const formatCurrency = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'EUR' }).format(
    cents / 100
  );

export const statusBadgeVariant = (status: string) =>
  status === 'active' ? 'default' : status === 'trialing' ? 'secondary' : 'danger';
