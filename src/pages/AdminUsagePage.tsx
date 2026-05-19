import { useEffect, useState } from 'react';
import { AlertTriangle, Users, Plug, MessageSquare } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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

type OrganizationUsage = {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
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
      {percentage >= 80 && <AlertTriangle className="ml-1 h-3 w-3" />}
    </div>
  );
};

const UsageProgressBar = ({ percentage }: { percentage: number }) => {
  const bgColor =
    percentage >= 100 ? 'bg-red-500' : percentage >= 80 ? 'bg-yellow-500' : 'bg-green-500';
  const cappedPercentage = Math.min(percentage, 100);

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${bgColor}`}
        style={{ width: `${cappedPercentage}%` }}
      />
    </div>
  );
};

export const AdminUsagePage = () => {
  const [organizations, setOrganizations] = useState<OrganizationUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'integrations' | 'messages'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await apiClient.get<{ data: OrganizationUsage[] }>(
          '/api/admin/organizations/usage'
        );
        setOrganizations(response.data.data || []);
      } catch (error) {
        logger.error('Failed to load organizations usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsage();
  }, []);

  const sortedOrganizations = [...organizations].sort((itemA, itemB) => {
    let compareValue = 0;

    switch (sortBy) {
      case 'name':
        compareValue = itemA.name.localeCompare(itemB.name);
        break;
      case 'users':
        compareValue = itemA.usage.users.percentage - itemB.usage.users.percentage;
        break;
      case 'integrations':
        compareValue = itemA.usage.integrations.percentage - itemB.usage.integrations.percentage;
        break;
      case 'messages':
        compareValue = itemA.usage.messagesThisMonth.percentage - itemB.usage.messagesThisMonth.percentage;
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

  const atRiskCount = organizations.filter(
    (org) =>
      org.usage.users.percentage >= 80 ||
      org.usage.integrations.percentage >= 80 ||
      org.usage.messagesThisMonth.percentage >= 80
  ).length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading organizations usage...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Organizations Usage</h1>
          <p className="mt-1 text-gray-400">
            Monitor subscription limits and usage across all organizations
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Organizations</p>
                <p className="text-3xl font-bold mt-2">{organizations.length}</p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">At Risk (≥80% usage)</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{atRiskCount}</p>
              </div>
              <div className="bg-yellow-100 rounded-full p-3">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Over Limit</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
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
              <div className="bg-red-100 rounded-full p-3">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    Organization
                    {sortBy === 'name' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('users')}
                  >
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      Users
                      {sortBy === 'users' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('integrations')}
                  >
                    <div className="flex items-center gap-1">
                      <Plug className="h-4 w-4" />
                      Integrations
                      {sortBy === 'integrations' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('messages')}
                  >
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      Messages/Month
                      {sortBy === 'messages' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedOrganizations.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium">{org.name}</div>
                        <div className="text-xs text-gray-500">{org.slug}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {getUsageBadge(
                          org.usage.users.current,
                          org.usage.users.limit,
                          org.usage.users.percentage
                        )}
                        <UsageProgressBar percentage={org.usage.users.percentage} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {getUsageBadge(
                          org.usage.integrations.current,
                          org.usage.integrations.limit,
                          org.usage.integrations.percentage
                        )}
                        <UsageProgressBar percentage={org.usage.integrations.percentage} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
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
                ))}
              </tbody>
            </table>
          </div>

          {organizations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No organizations found</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
