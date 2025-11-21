/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Download, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { apiClient } from '@/lib/api-client';

type UsageModule = {
  moduleName: string;
  displayName: string;
  current: number;
  included: number;
  overage: number;
  overagePrice: number;
  estimatedOverageCost: number;
  unitName: string;
};

export const UsageStatsPage = () => {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await apiClient.get('/api/subscriptions/usage');
        setUsage(res.data.data.usage || []);
      } catch (error) {
        console.error('Failed to load usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsage();
  }, []);

  const totalUsed = usage.reduce((sum, m) => sum + m.current, 0);
  const totalIncluded = usage.reduce((sum, m) => sum + m.included, 0);
  const totalOverage = usage.reduce((sum, m) => sum + m.overage, 0);
  const totalOverageCost = usage.reduce((sum, m) => sum + m.estimatedOverageCost, 0);

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  const exportUsageData = () => {
    const csvData = [
      ['Module', 'Used', 'Included', 'Overage', 'Overage Cost'],
      ...usage.map((m) => [
        m.displayName,
        m.current.toString(),
        m.included.toString(),
        m.overage.toString(),
        `€${(m.estimatedOverageCost / 100).toFixed(2)}`,
      ]),
    ];

    const csvContent = csvData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading usage statistics...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/subscription')}>
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Billing & Usage</h1>
              <p className="mt-1 text-gray-600">
                AI module costs, usage tracking, and overage monitoring
              </p>
            </div>
          </div>
          <Button onClick={exportUsageData} variant="outline">
            <Download className="mr-2 w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-gray-600">Total Used</p>
              <p className="text-2xl font-bold">{totalUsed.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">units this period</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-gray-600">Included</p>
              <p className="text-2xl font-bold">{totalIncluded.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">total limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-gray-600">Overage</p>
              <p className="text-2xl font-bold text-orange-600">{totalOverage.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">extra units</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-gray-600">Est. Overage Cost</p>
              <p className="text-2xl font-bold text-red-600">
                €{(totalOverageCost / 100).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-gray-500">this billing period</p>
            </CardContent>
          </Card>
        </div>

        {/* Module Usage Details */}
        <Card>
          <CardHeader>
            <CardTitle>AI Module Usage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                <AlertCircle className="mx-auto mb-3 w-12 h-12 text-gray-400" />
                <p>No AI modules enabled yet</p>
              </div>
            ) : (
              <div className="space-y-6">
                {usage.map((module) => {
                  const percentage = (module.current / module.included) * 100;
                  const isOverage = module.overage > 0;
                  const trend = percentage > 80 ? 'high' : percentage > 50 ? 'medium' : 'low';

                  return (
                    <div key={module.moduleName} className="p-6 rounded-lg border">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{module.displayName}</h3>
                          <p className="text-sm text-gray-600">{module.moduleName}</p>
                        </div>
                        <div className="text-right">
                          {trend === 'high' ? (
                            <Badge className="text-red-800 bg-red-100">
                              <TrendingUp className="mr-1 w-3 h-3" />
                              High Usage
                            </Badge>
                          ) : trend === 'medium' ? (
                            <Badge className="text-orange-800 bg-orange-100">
                              <TrendingUp className="mr-1 w-3 h-3" />
                              Medium
                            </Badge>
                          ) : (
                            <Badge className="text-green-800 bg-green-100">
                              <TrendingDown className="mr-1 w-3 h-3" />
                              Low Usage
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Usage Stats Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-4 md:grid-cols-4">
                        <div>
                          <p className="text-xs text-gray-600">Used</p>
                          <p className="text-lg font-semibold">{module.current.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Included</p>
                          <p className="text-lg font-semibold">
                            {module.included.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Percentage</p>
                          <p className="text-lg font-semibold">{percentage.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Unit</p>
                          <p className="text-lg font-semibold capitalize">{module.unitName}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <Progress value={percentage} className={getUsageColor(percentage)} />

                      {/* Overage Alert */}
                      {isOverage && (
                        <div className="p-3 mt-4 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex gap-2 items-start">
                            <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-orange-900">
                                Overage Detected
                              </p>
                              <p className="text-sm text-orange-800">
                                You've used {module.overage.toLocaleString()} extra{' '}
                                {module.unitName}
                                s. Estimated cost: €{(module.estimatedOverageCost / 100).toFixed(
                                  2
                                )}{' '}
                                ( €{(module.overagePrice / 100).toFixed(2)} per {module.unitName})
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tips Card */}
        <Card>
          <CardHeader>
            <CardTitle>💡 Cost Optimization Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>• Monitor usage regularly to avoid unexpected overage charges</li>
              <li>• Consider upgrading your plan if you consistently hit limits</li>
              <li>• Enable only the AI modules you actively use to reduce costs</li>
              <li>• Review usage patterns to optimize your subscription</li>
              <li>• Export usage data monthly for accounting and record keeping</li>
              <li>• Set up alerts when approaching usage limits</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
