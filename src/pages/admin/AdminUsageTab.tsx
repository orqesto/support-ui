import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Users,
  Plug,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Package,
  Edit2,
  XCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  CANCELLABLE,
  REACTIVATABLE,
  UsageProgressBar,
  formatCurrency,
  getPlanTypeBadgeColor,
  getUsageBadge,
  statusBadgeVariant,
  type CatalogModule,
  type OrgModule,
  type OrganizationUsage,
  type Plan,
} from './AdminUsageTab.helpers';
import { OrgAiUsageSection, OrgModulesSection } from './AdminUsageOrgDetailSections';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export const AdminUsageTab = () => {
  const [organizations, setOrganizations] = useState<OrganizationUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'integrations' | 'messages'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Plan change
  const [editingOrg, setEditingOrg] = useState<number | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlanName, setSelectedPlanName] = useState<string>('');
  const [periodEndInput, setPeriodEndInput] = useState('');
  const [planChanging, setPlanChanging] = useState(false);

  // Cancel / Reactivate
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [reactivating, setReactivating] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Per-org AI modules
  const [orgModulesMap, setOrgModulesMap] = useState<Map<number, OrgModule[]>>(new Map());
  const [modulesLoadingSet, setModulesLoadingSet] = useState<Set<number>>(new Set());
  const [allModules, setAllModules] = useState<CatalogModule[]>([]);
  const [togglingModule, setTogglingModule] = useState<{ orgId: number; moduleId: number } | null>(null);

  const refreshOrgs = useCallback(async () => {
    const response = await apiClient.get<{
      data: { organizations: OrganizationUsage[] } | OrganizationUsage[];
    }>('/api/admin/organizations/usage');
    const raw = response.data.data;
    setOrganizations(
      Array.isArray(raw)
        ? raw
        : ((raw as { organizations: OrganizationUsage[] }).organizations ?? [])
    );
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [usageRes, plansRes, modulesRes] = await Promise.all([
          apiClient.get<{ data: { organizations: OrganizationUsage[] } | OrganizationUsage[] }>(
            '/api/admin/organizations/usage'
          ),
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
          apiClient.get<{ data: CatalogModule[] }>('/api/admin/modules'),
        ]);
        const raw = usageRes.data.data;
        setOrganizations(
          Array.isArray(raw)
            ? raw
            : ((raw as { organizations: OrganizationUsage[] }).organizations ?? [])
        );
        setAvailablePlans(plansRes.data.data.plans || []);
        setAllModules(modulesRes.data.data || []);
      } catch (error) {
        logger.error('Failed to load organizations usage:', error);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const loadOrgModules = useCallback(
    async (orgId: number) => {
      if (orgModulesMap.has(orgId) || modulesLoadingSet.has(orgId)) return;
      setModulesLoadingSet((prev) => new Set(prev).add(orgId));
      try {
        const res = await apiClient.get<{ data: OrgModule[] }>(
          `/api/admin/organizations/${orgId}/modules`
        );
        setOrgModulesMap((prev) => new Map(prev).set(orgId, res.data.data || []));
      } catch (err) {
        logger.error('Failed to load org modules:', err);
        setOrgModulesMap((prev) => new Map(prev).set(orgId, []));
      } finally {
        setModulesLoadingSet((prev) => {
          const set = new Set(prev);
          set.delete(orgId);
          return set;
        });
      }
    },
    [orgModulesMap, modulesLoadingSet]
  );

  const toggleRow = (orgId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
      void loadOrgModules(orgId);
    }
    setExpandedRows(newExpanded);
  };

  const handlePlanChange = async (orgId: number) => {
    if (!selectedPlanName) return;
    setPlanChanging(true);
    setActionError(null);
    try {
      await apiClient.post(`/api/admin/organizations/${orgId}/upgrade`, {
        planName: selectedPlanName,
        ...(periodEndInput && { periodEnd: new Date(periodEndInput).toISOString() }),
      });
      await refreshOrgs();
      setEditingOrg(null);
      setSelectedPlanName('');
      setPeriodEndInput('');
    } catch (error) {
      logger.error('Failed to change plan:', error);
      setActionError('Failed to change plan.');
    } finally {
      setPlanChanging(false);
    }
  };

  const handleCancel = async (orgId: number) => {
    setCancelling(orgId);
    setActionError(null);
    try {
      await apiClient.post(`/api/admin/organizations/${orgId}/cancel`);
      await refreshOrgs();
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      setActionError('Failed to cancel subscription.');
    } finally {
      setCancelling(null);
    }
  };

  const handleReactivate = async (orgId: number) => {
    setReactivating(orgId);
    setActionError(null);
    try {
      await apiClient.post(`/api/admin/organizations/${orgId}/reactivate`);
      await refreshOrgs();
    } catch (error) {
      logger.error('Failed to reactivate subscription:', error);
      setActionError('Failed to reactivate subscription.');
    } finally {
      setReactivating(null);
    }
  };

  const handleEnableModule = async (orgId: number, moduleId: number) => {
    setTogglingModule({ orgId, moduleId });
    try {
      await apiClient.post(`/api/admin/organizations/${orgId}/modules`, { moduleId });
      const res = await apiClient.get<{ data: OrgModule[] }>(
        `/api/admin/organizations/${orgId}/modules`
      );
      setOrgModulesMap((prev) => new Map(prev).set(orgId, res.data.data || []));
    } catch (error) {
      logger.error('Failed to enable module:', error);
    } finally {
      setTogglingModule(null);
    }
  };

  const handleDisableModule = async (orgId: number, moduleId: number) => {
    setTogglingModule({ orgId, moduleId });
    try {
      await apiClient.delete(`/api/admin/organizations/${orgId}/modules/${moduleId}`);
      setOrgModulesMap((prev) => {
        const current = prev.get(orgId) ?? [];
        return new Map(prev).set(
          orgId,
          current.map((module) =>
            module.moduleId === moduleId ? { ...module, isActive: false } : module
          )
        );
      });
    } catch (error) {
      logger.error('Failed to disable module:', error);
    } finally {
      setTogglingModule(null);
    }
  };

  const sortedOrganizations = [...organizations].sort((orgA, orgB) => {
    let value = 0;
    switch (sortBy) {
      case 'name':
        value = orgA.name.localeCompare(orgB.name);
        break;
      case 'users':
        value = orgA.usage.users.percentage - orgB.usage.users.percentage;
        break;
      case 'integrations':
        value = orgA.usage.integrations.percentage - orgB.usage.integrations.percentage;
        break;
      case 'messages':
        value = orgA.usage.messagesThisMonth.percentage - orgB.usage.messagesThisMonth.percentage;
        break;
    }
    return sortDirection === 'asc' ? value : -value;
  });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };

  const atRiskCount = organizations.filter(
    (org) =>
      org.usage.users.warning ||
      org.usage.integrations.warning ||
      org.usage.messagesThisMonth.warning ||
      org.usage.aiCalls.warning
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
                        org.usage.users.critical ||
                        org.usage.integrations.critical ||
                        org.usage.messagesThisMonth.critical ||
                        org.usage.aiCalls.critical
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

      {actionError && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {actionError}
        </div>
      )}

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
                <th className="px-3 py-3 text-sm font-medium text-left" />
                <th
                  className="px-3 py-3 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('name')}
                >
                  Organization{' '}
                  {sortBy === 'name' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="hidden px-3 py-3 text-sm font-medium text-left lg:table-cell">
                  <div className="flex gap-1 items-center">
                    <Package className="w-4 h-4" /> Plan
                  </div>
                </th>
                <th className="hidden px-3 py-3 text-sm font-medium text-center md:table-cell">
                  <div className="flex gap-1 justify-center items-center">
                    <Zap className="w-4 h-4" /> AI Calls
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('users')}
                >
                  <div className="flex gap-1 items-center">
                    <Users className="w-4 h-4" /> Users{' '}
                    {sortBy === 'users' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="hidden px-3 py-3 text-sm font-medium text-left cursor-pointer xl:table-cell hover:bg-muted"
                  onClick={() => handleSort('integrations')}
                >
                  <div className="flex gap-1 items-center">
                    <Plug className="w-4 h-4" /> Integrations{' '}
                    {sortBy === 'integrations' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="hidden px-3 py-3 text-sm font-medium text-left cursor-pointer sm:table-cell hover:bg-muted"
                  onClick={() => handleSort('messages')}
                >
                  <div className="flex gap-1 items-center">
                    <MessageSquare className="w-4 h-4" /> Messages{' '}
                    {sortBy === 'messages' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedOrganizations.map((org) => {
                const isExpanded = expandedRows.has(org.id);
                const status = org.subscription?.status;
                const canCancel = status ? CANCELLABLE.has(status) : false;
                const canReactivate = status ? REACTIVATABLE.has(status) : false;
                const orgModules = orgModulesMap.get(org.id) ?? [];
                const modulesLoading = modulesLoadingSet.has(org.id);

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
                                variant={statusBadgeVariant(org.subscription.status)}
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
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.aiCalls.current,
                            org.usage.aiCalls.limit,
                            org.usage.aiCalls.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.aiCalls.percentage} />
                        </div>
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

                    {isExpanded && (
                      <tr key={`${org.id}-details`} className="bg-muted/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-6">
                            {/* ── Subscription Details ── */}
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2 justify-between items-center">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  Subscription Details
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {canReactivate && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void handleReactivate(org.id)}
                                      disabled={reactivating === org.id}
                                    >
                                      {reactivating === org.id ? (
                                        <RefreshCw className="mr-2 w-4 h-4 animate-spin" />
                                      ) : (
                                        <RefreshCw className="mr-2 w-4 h-4" />
                                      )}
                                      Reactivate
                                    </Button>
                                  )}
                                  {canCancel && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => void handleCancel(org.id)}
                                      disabled={cancelling === org.id}
                                    >
                                      {cancelling === org.id ? (
                                        <RefreshCw className="mr-2 w-4 h-4 animate-spin" />
                                      ) : (
                                        <XCircle className="mr-2 w-4 h-4" />
                                      )}
                                      Cancel Subscription
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setEditingOrg(editingOrg === org.id ? null : org.id)
                                    }
                                  >
                                    <Edit2 className="mr-2 w-4 h-4" />
                                    {editingOrg === org.id ? 'Close' : 'Change Plan'}
                                  </Button>
                                </div>
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
                                    variant={statusBadgeVariant(org.subscription?.status ?? '')}
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
                                      –{' '}
                                      {new Date(
                                        org.subscription.currentPeriodEnd
                                      ).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {editingOrg === org.id && (
                                <div className="p-4 mt-2 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                                  <h5 className="mb-3 text-sm font-semibold">Change Plan</h5>
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
                                  <div className="flex flex-wrap gap-3 items-end mb-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs text-muted-foreground">
                                        Period end date (optional)
                                      </label>
                                      <input
                                        type="date"
                                        value={periodEndInput}
                                        onChange={(evt) => setPeriodEndInput(evt.target.value)}
                                        className="px-2 py-1.5 text-xs rounded border border-input bg-background"
                                      />
                                    </div>
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
                                      onClick={() => {
                                        setEditingOrg(null);
                                        setSelectedPlanName('');
                                        setPeriodEndInput('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <OrgModulesSection
                              orgId={org.id}
                              modulesLoading={modulesLoading}
                              allModules={allModules}
                              orgModules={orgModules}
                              togglingModule={togglingModule}
                              onEnableModule={(orgId, moduleId) =>
                                void handleEnableModule(orgId, moduleId)
                              }
                              onDisableModule={(orgId, moduleId) =>
                                void handleDisableModule(orgId, moduleId)
                              }
                            />

                            <OrgAiUsageSection aiCalls={org.usage.aiCalls} />
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
