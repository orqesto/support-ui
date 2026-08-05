import { useEffect, useState } from 'react';
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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
        type RawUsage = {
          aiCalls: { current: number; limit: number; overage: number; percentage: number };
          messages: { current: number; limit: number; percentage: number };
        };
        const usageRes = await apiClient.get<{ success: boolean; data: { usage: RawUsage } }>(
          '/api/subscriptions/usage'
        );
        const raw = usageRes.data.data.usage;
        const aiCurrent = raw?.aiCalls?.current ?? 0;
        const aiLimit = raw?.aiCalls?.limit ?? 0;
        const msgCurrent = raw?.messages?.current ?? 0;
        const msgLimit = raw?.messages?.limit ?? 0;
        setUsage([
          {
            moduleName: 'ai-calls',
            displayName: 'AI Calls',
            current: aiCurrent,
            included: aiLimit,
            overage: raw?.aiCalls?.overage ?? Math.max(0, aiCurrent - aiLimit),
            overagePrice: 0,
            estimatedOverageCost: 0,
            unitName: 'call',
          },
          {
            moduleName: 'messages',
            displayName: 'Messages',
            current: msgCurrent,
            included: msgLimit,
            overage: Math.max(0, msgCurrent - msgLimit),
            overagePrice: 0,
            estimatedOverageCost: 0,
            unitName: 'message',
          },
        ]);
      } catch (error) {
        logger.error('Failed to load usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsage();
  }, []);

  const totalUsed = usage.reduce((sum, mod) => sum + mod.current, 0);
  const totalIncluded = usage.reduce((sum, mod) => sum + mod.included, 0);
  const totalOverage = usage.reduce((sum, mod) => sum + mod.overage, 0);
  const totalOverageCost = usage.reduce((sum, mod) => sum + mod.estimatedOverageCost, 0);

  const exportUsageData = () => {
    const csvData = [
      ['Module', 'Used', 'Included', 'Overage', 'Overage Cost'],
      ...usage.map((mod) => [
        mod.displayName,
        mod.current.toString(),
        mod.included.toString(),
        mod.overage.toString(),
        `€${(mod.estimatedOverageCost / 100).toFixed(2)}`,
      ]),
    ];

    const csvContent = csvData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `usage-${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      <div className="px-4 mx-auto space-y-4 w-full">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-center sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/subscription')}>
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Billing & Usage</h1>
              <p className="mt-1 text-sm text-foreground/70 sm:text-base">
                AI usage tracking and overage monitoring
              </p>
            </div>
          </div>
          <Button onClick={exportUsageData} variant="outline" className="py-6">
            <Download className="mr-2 w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-foreground/70">Total Used</p>
              <p className="text-2xl font-bold">{totalUsed.toLocaleString()}</p>
              <p className="mt-1 text-xs text-foreground/60">units this period</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-foreground/70">Included</p>
              <p className="text-2xl font-bold">{totalIncluded.toLocaleString()}</p>
              <p className="mt-1 text-xs text-foreground/60">total limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-foreground/70">Overage</p>
              <p className="text-2xl font-bold text-orange-600">{totalOverage.toLocaleString()}</p>
              <p className="mt-1 text-xs text-foreground/60">extra units</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="mb-1 text-sm text-foreground/70">Est. Overage Cost</p>
              <p className="text-2xl font-bold text-red-600">
                €{(totalOverageCost / 100).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-foreground/60">this billing period</p>
            </CardContent>
          </Card>
        </div>

        {/* Usage alerts — modules >= 80% */}
        {usage.filter((mod) => mod.included > 0 && mod.current / mod.included >= 0.8).length > 0 && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="p-4">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="mt-0.5 w-4 h-4 text-orange-600 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-400">
                    Usage Alert
                  </p>
                  {usage
                    .filter((mod) => mod.included > 0 && mod.current / mod.included >= 0.8)
                    .map((mod) => (
                      <p
                        key={mod.moduleName}
                        className="text-sm text-orange-700 dark:text-orange-300"
                      >
                        <span className="font-medium">{mod.displayName}</span> is at{' '}
                        {((mod.current / mod.included) * 100).toFixed(0)}% of limit
                        {mod.overage > 0 && ` (+${mod.overage.toLocaleString()} overage)`}
                      </p>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tips Card */}
        <Card>
          <CardHeader>
            <CardTitle>💡 Cost Optimization Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>• Monitor usage regularly to avoid unexpected overage charges</li>
              <li>• Consider upgrading your plan if you consistently hit limits</li>
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
