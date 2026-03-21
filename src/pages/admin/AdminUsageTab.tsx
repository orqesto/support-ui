import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Users,
  Plug,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Package,
  Zap,
  Edit2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';

type UsageLimits = {
  maxUsers: number;
  maxIntegrations: number;
  maxMessagesPerMonth: number;
  maxOrganizations: number;
};

type Usage = {
  users: {
    current: number;
    limit: number;
    percentage: number;
  };
  integrations: {
    current: number;
    limit: number;
    percentage: number;
  };
  messagesThisMonth: {
    current: number;
    limit: number;
    percentage: number;
  };
};

type Plan = {
  id: number;
  name: string;
  displayName: string;
  planType: 'base' | 'bundle' | 'enterprise';
  price: number;
  currency: string;
};

type Subscription = {
  id: number;
  planId: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
};

type AIModule = {
  moduleId: number;
  moduleName: string;
  displayName: string;
  currentUsage: number;
  includedUnits: number;
  overage: number;
  monthlyFee: number;
  overagePrice: number;
  estimatedOverageCost: number;
  unitName: string;
  periodEnd: string;
};

type OrganizationUsage = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  subscription: Subscription | null;
  plan: Plan | null;
  enabledModules: AIModule[];
  limits: UsageLimits;
  usage: Usage;
};

const getUsageColor = (percentage: number) => {
  if (percentage >= 100) return 'text-red-600 bg-red-50';
  if (percentage >= 80) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
};

const getUsageBadge = (current: number, limit: number, percentage: number) => {
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

const UsageProgressBar = ({ percentage }: { percentage: number }) => {
  const bgColor =
    percentage >= 100 ? 'bg-red-500' : percentage >= 80 ? 'bg-yellow-500' : 'bg-green-500';
  const cappedPercentage = Math.min(percentage, 100);

  return (
    <div className="w-full h-2 bg-gray-200 rounded-full">
      <div
        className={`h-2 rounded-full transition-all ${bgColor}`}
        style={{ width: `${cappedPercentage}%` }}
      />
    </div>
  );
};

const getPlanTypeBadgeColor = (planType: string) => {
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

const formatCurrency = (cents: number, currency: string) => {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount);
};

export const AdminUsageTab = () => {
  const [organizations, setOrganizations] = useState<OrganizationUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'integrations' | 'messages'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingOrg, setEditingOrg] = useState<number | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlanName, setSelectedPlanName] = useState<string>('');
  const [planChanging, setPlanChanging] = useState(false);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const [usageRes, plansRes] = await Promise.all([
          apiClient.get<{ data: OrganizationUsage[] }>('/api/admin/organizations/usage'),
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
        ]);
        setOrganizations(usageRes.data.data || []);
        setAvailablePlans(plansRes.data.data.plans || []);
      } catch (error) {
        console.error('Failed to load organizations usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsage();
  }, []);

  const handlePlanChange = async (orgId: number) => {
    if (!selectedPlanName) return;
    setPlanChanging(true);
    try {
      await apiClient.post(`/api/admin/organizations/${orgId}/upgrade`, { planName: selectedPlanName });
      // Refresh org list
      const response = await apiClient.get<{ data: OrganizationUsage[] }>('/api/admin/organizations/usage');
      setOrganizations(response.data.data || []);
      setEditingOrg(null);
      setSelectedPlanName('');
    } catch (error) {
      console.error('Failed to change plan:', error);
    } finally {
      setPlanChanging(false);
    }
  };

  const sortedOrganizations = [...organizations].sort((a, b) => {
    let compareValue = 0;

    switch (sortBy) {
      case 'name':
        compareValue = a.name.localeCompare(b.name);
        break;
      case 'users':
        compareValue = a.usage.users.percentage - b.usage.users.percentage;
        break;
      case 'integrations':
        compareValue = a.usage.integrations.percentage - b.usage.integrations.percentage;
        break;
      case 'messages':
        compareValue = a.usage.messagesThisMonth.percentage - b.usage.messagesThisMonth.percentage;
        break;
    }

    return sortDirection === 'asc' ? compareValue : -compareValue;
  });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('desc'); // Default to desc for usage columns
    }
  };

  const toggleRow = (orgId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
    }
    setExpandedRows(newExpanded);
  };

  const atRiskCount = organizations.filter(
    (org) =>
      org.usage.users.percentage >= 80 ||
      org.usage.integrations.percentage >= 80 ||
      org.usage.messagesThisMonth.percentage >= 80
  ).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-muted-foreground">Loading organizations usage...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Organizations</p>
                <p className="mt-2 text-3xl font-bold">{organizations.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-400">At Risk (≥80% usage)</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">{atRiskCount}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-400">Over Limit</p>
                <p className="mt-2 text-3xl font-bold text-red-600">
                  {
                    organizations.filter(
                      (org) =>
                        org.usage.users.percentage >= 100 ||
                        org.usage.integrations.percentage >= 100 ||
                        org.usage.messagesThisMonth.percentage >= 100
                    ).length
                  }
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Table */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="hidden w-48 lg:table-column" />
              <col className="hidden w-24 md:table-column" />
              <col className="w-32" />
              <col className="hidden w-36 xl:table-column" />
              <col className="hidden w-36 sm:table-column" />
            </colgroup>
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="px-3 py-3 text-sm font-medium text-left">{/* Expand icon */}</th>
                <th
                  className="px-3 py-3 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('name')}
                >
                  Organization
                  {sortBy === 'name' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="hidden px-3 py-3 text-sm font-medium text-left lg:table-cell">
                  <div className="flex gap-1 items-center">
                    <Package className="w-4 h-4" />
                    Plan
                  </div>
                </th>
                <th className="hidden px-3 py-3 text-sm font-medium text-center md:table-cell">
                  <div className="flex gap-1 justify-center items-center">
                    <Zap className="w-4 h-4" />
                    Modules
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('users')}
                >
                  <div className="flex gap-1 items-center">
                    <Users className="w-4 h-4" />
                    Users
                    {sortBy === 'users' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="hidden px-3 py-3 text-sm font-medium text-left cursor-pointer xl:table-cell hover:bg-muted"
                  onClick={() => handleSort('integrations')}
                >
                  <div className="flex gap-1 items-center">
                    <Plug className="w-4 h-4" />
                    Integrations
                    {sortBy === 'integrations' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="hidden px-3 py-3 text-sm font-medium text-left cursor-pointer sm:table-cell hover:bg-muted"
                  onClick={() => handleSort('messages')}
                >
                  <div className="flex gap-1 items-center">
                    <MessageSquare className="w-4 h-4" />
                    Messages
                    {sortBy === 'messages' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedOrganizations.map((org) => {
                const isExpanded = expandedRows.has(org.id);
                return (
                  <>
                    <tr key={org.id} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleRow(org.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium truncate">{org.name}</div>
                        <div className="text-sm truncate text-muted-foreground">{org.slug}</div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        {org.plan ? (
                          <div className="space-y-1">
                            <div className="flex gap-2 items-center">
                              <Badge className={getPlanTypeBadgeColor(org.plan.planType)}>
                                {org.plan.planType}
                              </Badge>
                              <span className="text-sm font-medium truncate">
                                {org.plan.displayName}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(org.plan.price, org.plan.currency)}/month
                            </div>
                            {org.subscription && (
                              <Badge
                                variant={
                                  org.subscription.status === 'active' ? 'default' : 'secondary'
                                }
                                className="text-xs"
                              >
                                {org.subscription.status}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No plan</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-3 text-center md:table-cell">
                        {org.enabledModules.length > 0 ? (
                          <div className="text-sm">
                            <span className="font-medium">{org.enabledModules.length}</span>
                            <span className="text-muted-foreground"> active</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.users.current,
                            org.usage.users.limit,
                            org.usage.users.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.users.percentage} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 xl:table-cell">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.integrations.current,
                            org.usage.integrations.limit,
                            org.usage.integrations.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.integrations.percentage} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.messagesThisMonth.current,
                            org.usage.messagesThisMonth.limit,
                            org.usage.messagesThisMonth.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.messagesThisMonth.percentage} />
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Row - Subscription & Module Details */}
                    {isExpanded && (
                      <tr key={`${org.id}-details`} className="bg-muted/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-4">
                            {/* Subscription Details */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  Subscription Details
                                </h4>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setEditingOrg(editingOrg === org.id ? null : org.id)
                                  }
                                >
                                  <Edit2 className="mr-2 w-4 h-4" />
                                  {editingOrg === org.id ? 'Cancel' : 'Manage Subscription'}
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                                <div>
                                  <span className="text-muted-foreground">Plan:</span>{' '}
                                  <span className="font-medium">
                                    {org.plan ? org.plan.displayName : 'No plan'}
                                  </span>
                                  {org.plan && (
                                    <span className="ml-2 text-muted-foreground">
                                      ({formatCurrency(org.plan.price, org.plan.currency)}/month)
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status:</span>{' '}
                                  <Badge
                                    variant={
                                      org.subscription?.status === 'active'
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className="ml-2"
                                  >
                                    {org.subscription?.status ?? 'No subscription'}
                                  </Badge>
                                </div>
                                {org.subscription?.trialEndsAt && (
                                  <div>
                                    <span className="text-muted-foreground">Trial Ends:</span>{' '}
                                    <span className="font-medium">
                                      {new Date(org.subscription.trialEndsAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                                {org.subscription && (
                                  <div>
                                    <span className="text-muted-foreground">Period:</span>{' '}
                                    <span className="font-medium">
                                      {new Date(
                                        org.subscription.currentPeriodStart
                                      ).toLocaleDateString()}{' '}
                                      -{' '}
                                      {new Date(
                                        org.subscription.currentPeriodEnd
                                      ).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Edit Mode - Plan Management */}
                              {editingOrg === org.id && (
                                <div className="p-4 mt-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                                  <h5 className="mb-3 text-sm font-semibold">Change Subscription Plan</h5>
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {availablePlans.map((plan) => (
                                      <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => setSelectedPlanName(plan.name)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                          selectedPlanName === plan.name
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background border-border text-foreground hover:bg-muted'
                                        }`}
                                      >
                                        {plan.displayName}
                                        {org.plan?.name === plan.name && (
                                          <span className="ml-1 opacity-60">(current)</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      disabled={!selectedPlanName || planChanging}
                                      onClick={() => void handlePlanChange(org.id)}
                                      isLoading={planChanging}
                                    >
                                      Save Changes
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setEditingOrg(null); setSelectedPlanName(''); }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* AI Modules */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-muted-foreground">
                                AI Modules Usage
                              </h4>
                              {org.enabledModules.length > 0 ? (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                  {org.enabledModules.map((module) => (
                                    <div
                                      key={module.moduleId}
                                      className="p-4 rounded-lg border bg-card border-border"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <div className="text-sm font-medium">
                                            {module.displayName}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {formatCurrency(module.monthlyFee, 'EUR')}/month
                                          </div>
                                        </div>
                                        <Zap className="w-4 h-4 text-amber-500" />
                                      </div>
                                      <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">Usage:</span>
                                          <span className="font-medium">
                                            {module.currentUsage} / {module.includedUnits}{' '}
                                            {module.unitName}s
                                          </span>
                                        </div>
                                        <UsageProgressBar
                                          percentage={
                                            (module.currentUsage / module.includedUnits) * 100
                                          }
                                        />
                                        {module.overage > 0 && (
                                          <div className="p-2 text-xs bg-red-50 rounded border border-red-200">
                                            <div className="flex justify-between">
                                              <span className="font-medium text-red-700">
                                                Overage:
                                              </span>
                                              <span className="text-red-600">
                                                {module.overage} {module.unitName}s
                                              </span>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                              <span className="text-red-700">Est. Cost:</span>
                                              <span className="font-semibold text-red-600">
                                                {formatCurrency(module.estimatedOverageCost, 'EUR')}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-4 text-sm text-center rounded-lg border border-dashed text-muted-foreground">
                                  No AI modules enabled
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {organizations.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No organizations found</p>
          </div>
        )}
      </div>
    </div>
  );
};
