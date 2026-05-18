import { Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface ServiceInfo {
  status: string;
  message?: string;
}

interface HealthServices {
  database?: ServiceInfo;
  email?: ServiceInfo;
  telegram?: ServiceInfo;
  ai?: ServiceInfo;
}

interface Props {
  health: { services: HealthServices } | null;
  isWebSocketConnected: boolean;
}

function ServiceRow({
  label,
  service,
  activeColor,
  activeBg,
  activeBorder,
  activeDotColor,
}: {
  label: string;
  service: ServiceInfo;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
  activeDotColor: string;
}) {
  const isActive = service.status === 'active';
  const isError = service.status === 'error';
  return (
    <div
      className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
        isActive
          ? `${activeBg} ${activeBorder}`
          : isError
            ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
            : 'bg-muted border-border'
      }`}
    >
      <div className="flex gap-2 items-center">
        <div
          className={`w-2 h-2 flex-shrink-0 rounded-full ${
            isActive
              ? `${activeDotColor} animate-pulse`
              : isError
                ? 'bg-red-500'
                : 'bg-gray-400'
          }`}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span
        className={`text-xs font-medium break-words ${
          isActive
            ? activeColor
            : isError
              ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground'
        }`}
      >
        {service.message ?? (isActive ? (label === 'Database' ? 'Connected' : service.status) : isError ? 'Error' : 'Inactive')}
      </span>
    </div>
  );
}

export function DashboardSystemStatus({ health, isWebSocketConnected }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Inbox className="w-5 h-5" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {health?.services.database && (
            <ServiceRow
              label="Database"
              service={health.services.database}
              activeColor="text-green-600 dark:text-green-400"
              activeBg="bg-green-500/10 dark:bg-green-500/10"
              activeBorder="border-green-500/20 dark:border-green-500/20"
              activeDotColor="bg-green-500"
            />
          )}
          {health?.services.email && (
            <ServiceRow
              label="Email Service"
              service={health.services.email}
              activeColor="text-green-600 dark:text-green-400"
              activeBg="bg-green-500/10 dark:bg-green-500/10"
              activeBorder="border-green-500/20 dark:border-green-500/20"
              activeDotColor="bg-green-500"
            />
          )}
          {health?.services.telegram && (
            <ServiceRow
              label="Telegram Service"
              service={health.services.telegram}
              activeColor="text-cyan-600 dark:text-cyan-400"
              activeBg="bg-cyan-500/10 dark:bg-cyan-500/10"
              activeBorder="border-cyan-500/20 dark:border-cyan-500/20"
              activeDotColor="bg-cyan-500"
            />
          )}

          {/* WebSocket Status */}
          <div
            className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
              isWebSocketConnected
                ? 'bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/10 dark:border-blue-500/20'
                : 'bg-muted border-border'
            }`}
          >
            <div className="flex gap-2 items-center">
              <div className={`w-2 h-2 flex-shrink-0 rounded-full ${isWebSocketConnected ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">WebSocket</span>
            </div>
            <span className={`text-xs font-medium ${isWebSocketConnected ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
              {isWebSocketConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {health?.services.ai && (
            <div
              className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                health.services.ai.status === 'active'
                  ? 'bg-purple-500/10 border-purple-500/20 dark:bg-purple-500/10 dark:border-purple-500/20'
                  : health.services.ai.status === 'error'
                    ? 'bg-red-500/10 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20'
                    : 'bg-muted border-border'
              }`}
            >
              <div className="flex flex-shrink-0 gap-2 items-center">
                <div className={`w-2 h-2 flex-shrink-0 rounded-full ${health.services.ai.status === 'active' ? 'bg-purple-500 animate-pulse' : health.services.ai.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium whitespace-nowrap">AI Processing</span>
              </div>
              <span className={`text-xs font-medium break-words ${health.services.ai.status === 'active' ? 'text-purple-600 dark:text-purple-400' : health.services.ai.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {health.services.ai.message ?? health.services.ai.status}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
