import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, XCircle, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api-client';

type AIProviderHealth = {
  id: number;
  name: string;
  provider: string;
  enabled: boolean;
  status: 'healthy' | 'unhealthy' | 'untested';
  message: string;
  lastTested?: string;
  error?: string;
};

type HealthSummary = {
  total: number;
  healthy: number;
  unhealthy: number;
  enabled: number;
};

type HealthCheckResponse = {
  success: boolean;
  data: {
    providers: AIProviderHealth[];
    summary: HealthSummary;
  };
};

export const AIProviderHealthCheck = () => {
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState<{
    providers: AIProviderHealth[];
    summary: HealthSummary;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<HealthCheckResponse>('/api/ai/providers/health');
      if (response.data.success) {
        setHealthData(response.data.data);
      } else {
        setError('Failed to check provider health');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check provider health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void testProviders();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'unhealthy':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Activity className="w-5 h-5" />
            AI Provider Health Status
          </CardTitle>
          <Button onClick={() => void testProviders()} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Testing...' : 'Test All'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Test your AI providers to ensure they're working correctly before processing messages
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
          </div>
        )}

        {healthData && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-muted/30 rounded-md">
                <p className="text-sm text-muted-foreground">Total Providers</p>
                <p className="text-2xl font-bold mt-1">{healthData.summary.total}</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-md">
                <p className="text-sm text-green-700 dark:text-green-400">Healthy</p>
                <p className="text-2xl font-bold mt-1 text-green-700 dark:text-green-400">
                  {healthData.summary.healthy}
                </p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-400">Unhealthy</p>
                <p className="text-2xl font-bold mt-1 text-red-700 dark:text-red-400">
                  {healthData.summary.unhealthy}
                </p>
              </div>
              <div className="p-4 bg-primary/10 rounded-md">
                <p className="text-sm text-primary">Enabled</p>
                <p className="text-2xl font-bold mt-1 text-primary">{healthData.summary.enabled}</p>
              </div>
            </div>

            {/* Provider Details */}
            <div className="space-y-3">
              {healthData.providers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No AI providers configured</p>
                  <p className="text-sm mt-2">Add an AI provider to get started</p>
                </div>
              ) : (
                healthData.providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={`p-4 border rounded-md ${getStatusColor(provider.status)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getStatusIcon(provider.status)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{provider.name}</h4>
                            <span className="text-xs px-2 py-0.5 bg-muted rounded-full">
                              {provider.provider}
                            </span>
                            {provider.enabled ? (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                                Enabled
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1">{provider.message}</p>
                          {provider.error && (
                            <p className="text-sm mt-2 text-red-600 dark:text-red-400 font-mono">
                              {provider.error}
                            </p>
                          )}
                          {provider.lastTested && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Last tested: {new Date(provider.lastTested).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {healthData.summary.unhealthy > 0 && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-400">
                      Action Required
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Some AI providers are unhealthy. Please check their configuration and API
                      keys. Message processing may be affected for providers marked as unhealthy.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
