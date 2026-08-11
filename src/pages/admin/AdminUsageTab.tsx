import { Fragment, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
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
  fetchAllOrganizationsUsage,
  formatCurrency,
  getPlanTypeBadgeColor,
  getUsageBadge,
  statusBadgeVariant,
  type OrganizationUsage,
  type Plan,
} from './AdminUsageTab.helpers';
import {
  OrgAiUsageSection,
  OrgFeatureOverridesSection,
  UsageSummaryCards,
  type UsageFilter,
} from './AdminUsageOrgDetailSections';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

/** Rows shown per page in the client-paginated workspace usage table. */
const PAGE_SIZE = 20;

export const AdminUsageTab = () => {
  const [organizations, setOrganizations] = useState<OrganizationUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'integrations' | 'messages'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Client-side search / plan+status filter / pagination over the fetched all-orgs list.
  // Seed the filters from the URL so deep-links land pre-filtered: the platform Overview's
  // "No plan → N workspaces" and plan rows pass ?plan=…; its Subscriptions status rows pass
  // ?status=… ('none' = no plan / no subscription respectively).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [planFilter, setPlanFilter] = useState<string>(() => searchParams.get('plan') ?? 'all');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') ?? 'all');
  // Usage-health filter, toggled by the At Risk / Over Limit KPI cards (and ?usage= deep-link).
  const [usageFilter, setUsageFilter] = useState<UsageFilter>(() => {
    const value = searchParams.get('usage');
    return value === 'at_risk' || value === 'over_limit' ? value : 'all';
  });
  const [page, setPage] = useState(1);

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

  const refreshOrgs = useCallback(async () => {
    setOrganizations(await fetchAllOrganizationsUsage());
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [orgs, plansRes] = await Promise.all([
          fetchAllOrganizationsUsage(),
          apiClient.get<{ success: boolean; data: { plans: Plan[] } }>('/api/subscriptions/plans'),
        ]);
        setOrganizations(orgs);
        setAvailablePlans(plansRes.data.data.plans || []);
      } catch (error) {
        logger.error('Failed to load organizations usage:', error);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const toggleRow = (orgId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
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

  const searchTerm = search.trim().toLowerCase();
  const filteredOrganizations = sortedOrganizations.filter((org) => {
    const matchesSearch =
      searchTerm.length === 0 ||
      org.name.toLowerCase().includes(searchTerm) ||
      org.slug.toLowerCase().includes(searchTerm);
    const matchesPlan =
      planFilter === 'all' ||
      (planFilter === 'none' ? !org.plan : org.plan?.name === planFilter);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'none'
        ? !org.subscription
        : org.subscription?.status === statusFilter);
    const matchesUsage =
      usageFilter === 'all' ||
      (usageFilter === 'at_risk'
        ? org.usage.users.warning ||
          org.usage.integrations.warning ||
          org.usage.messagesThisMonth.warning ||
          org.usage.aiCalls.warning
        : org.usage.users.critical ||
          org.usage.integrations.critical ||
          org.usage.messagesThisMonth.critical ||
          org.usage.aiCalls.critical);
    return matchesSearch && matchesPlan && matchesStatus && matchesUsage;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrganizations.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageOrganizations = filteredOrganizations.slice(start, start + PAGE_SIZE);

  const atRiskCount = organizations.filter(
    (org) =>
      org.usage.users.warning ||
      org.usage.integrations.warning ||
      org.usage.messagesThisMonth.warning ||
      org.usage.aiCalls.warning
  ).length;

  const overLimitCount = organizations.filter(
    (org) =>
      org.usage.users.critical ||
      org.usage.integrations.critical ||
      org.usage.messagesThisMonth.critical ||
      org.usage.aiCalls.critical
  ).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-muted-foreground">Loading workspaces usage...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <UsageSummaryCards
        total={organizations.length}
        atRisk={atRiskCount}
        overLimit={overLimitCount}
        active={usageFilter}
        onFilter={(filter) => {
          setUsageFilter(filter);
          setPage(1);
        }}
      />

      {actionError && (
        <div className="flex-shrink-0 px-4 py-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap flex-shrink-0 gap-3 items-end">
        <div className="w-full max-w-sm">
          <Label htmlFor="usage-search" className="mb-1">
            Search
          </Label>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by workspace name"
            showSearchButton={false}
          />
        </div>
        <div className="min-w-[12rem]">
          <Label htmlFor="usage-plan-filter" className="mb-1">
            Plan
          </Label>
          <Select
            id="usage-plan-filter"
            value={planFilter}
            onChange={(evt) => {
              setPlanFilter(evt.target.value);
              setPage(1);
            }}
          >
            <option value="all">All plans</option>
            {availablePlans.map((plan) => (
              <option key={plan.id} value={plan.name}>
                {plan.displayName}
              </option>
            ))}
            {/* A deep-link (?plan=…) can target a plan that's no longer active — the plans
                endpoint returns active plans only. Surface it so the control reflects the
                filtered table instead of rendering blank. */}
            {planFilter !== 'all' &&
              planFilter !== 'none' &&
              !availablePlans.some((plan) => plan.name === planFilter) && (
                <option value={planFilter}>{planFilter} (inactive)</option>
              )}
            <option value="none">No plan</option>
          </Select>
        </div>
        <div className="min-w-[12rem]">
          <Label htmlFor="usage-status-filter" className="mb-1">
            Subscription
          </Label>
          <Select
            id="usage-status-filter"
            value={statusFilter}
            onChange={(evt) => {
              setStatusFilter(evt.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
            <option value="none">No subscription</option>
          </Select>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="flex overflow-hidden flex-col flex-1 rounded-lg border min-h-0">
        <div className="overflow-auto flex-1 min-h-0">
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
                <th className="px-3 py-2 text-sm font-medium text-left" />
                <th
                  className="px-3 py-2 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('name')}
                >
                  Workspace{' '}
                  {sortBy === 'name' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="hidden px-3 py-2 text-sm font-medium text-left lg:table-cell">
                  <div className="flex gap-1 items-center">
                    <Package className="w-4 h-4" /> Plan
                  </div>
                </th>
                <th className="hidden px-3 py-2 text-sm font-medium text-center md:table-cell">
                  <div className="flex gap-1 justify-center items-center">
                    <Zap className="w-4 h-4" /> AI Calls
                  </div>
                </th>
                <th
                  className="px-3 py-2 text-sm font-medium text-left cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('users')}
                >
                  <div className="flex gap-1 items-center">
                    <Users className="w-4 h-4" /> Users{' '}
                    {sortBy === 'users' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  className="hidden px-3 py-2 text-sm font-medium text-left cursor-pointer xl:table-cell hover:bg-muted"
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
                  className="hidden px-3 py-2 text-sm font-medium text-left cursor-pointer sm:table-cell hover:bg-muted"
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
              {pageOrganizations.map((org) => {
                const isExpanded = expandedRows.has(org.id);
                const status = org.subscription?.status;
                const canCancel = status ? CANCELLABLE.has(status) : false;
                const canReactivate = status ? REACTIVATABLE.has(status) : false;

                return (
                  <Fragment key={org.id}>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleRow(org.id)}
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          className="w-6 h-6 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium truncate">{org.name}</div>
                        <div className="text-sm truncate text-muted-foreground">{org.slug}</div>
                      </td>
                      <td className="hidden px-3 py-2 lg:table-cell">
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
                      <td className="hidden px-3 py-2 text-center md:table-cell">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.aiCalls.current,
                            org.usage.aiCalls.limit,
                            org.usage.aiCalls.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.aiCalls.percentage} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.users.current,
                            org.usage.users.limit,
                            org.usage.users.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.users.percentage} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 xl:table-cell">
                        <div className="space-y-1">
                          {getUsageBadge(
                            org.usage.integrations.current,
                            org.usage.integrations.limit,
                            org.usage.integrations.percentage
                          )}
                          <UsageProgressBar percentage={org.usage.integrations.percentage} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
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
                      <tr className="bg-muted/50">
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
                                      <Button
                                        key={plan.id}
                                        size="sm"
                                        variant={selectedPlanName === plan.name ? 'primary' : 'outline'}
                                        onClick={() => setSelectedPlanName(plan.name)}
                                      >
                                        {plan.displayName}
                                        {org.plan?.name === plan.name && (
                                          <span className="ml-1 opacity-60">(current)</span>
                                        )}
                                      </Button>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-3 items-end mb-3">
                                    <div className="w-48">
                                      <Input
                                        label="Period end date (optional)"
                                        type="date"
                                        value={periodEndInput}
                                        onChange={(evt) => setPeriodEndInput(evt.target.value)}
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
                            <OrgFeatureOverridesSection orgId={org.id} />

                            <OrgAiUsageSection aiCalls={org.usage.aiCalls} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredOrganizations.length === 0 && (
          <div className="flex flex-1 justify-center items-center py-12 min-h-0 text-center">
            <p className="text-muted-foreground">
              {organizations.length === 0
                ? 'No workspaces found'
                : 'No workspaces match your filters'}
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex-shrink-0">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filteredOrganizations.length}
              limit={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
};
