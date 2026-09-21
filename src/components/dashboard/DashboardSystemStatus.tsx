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
            ? 'bg-destructive/10 border-destructive-line'
            : 'bg-muted border-border'
      }`}
    >
      <div className="flex gap-2 items-center">
        <div
          className={`w-2 h-2 flex-shrink-0 rounded-full ${
            isActive
              ? `${activeDotColor} animate-pulse`
              : isError
                ? 'bg-destructive'
                : 'bg-faint-foreground'
          }`}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span
        className={`text-xs font-medium break-words ${
          isActive
            ? activeColor
            : isError
              ? 'text-destructive'
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
              activeColor="text-success"
              activeBg="bg-success/10"
              activeBorder="border-success-line"
              activeDotColor="bg-success"
            />
          )}
          {health?.services.email && (
            <ServiceRow
              label="Email Service"
              service={health.services.email}
              activeColor="text-success"
              activeBg="bg-success/10"
              activeBorder="border-success-line"
              activeDotColor="bg-success"
            />
          )}
          {health?.services.telegram && (
            <ServiceRow
              label="Telegram Service"
              service={health.services.telegram}
              activeColor="text-success"
              activeBg="bg-success/10"
              activeBorder="border-success-line"
              activeDotColor="bg-success"
            />
          )}

          {/* WebSocket Status */}
          <div
            className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
              isWebSocketConnected
                ? 'bg-success/10 border-success-line'
                : 'bg-muted border-border'
            }`}
          >
            <div className="flex gap-2 items-center">
              <div className={`w-2 h-2 flex-shrink-0 rounded-full ${isWebSocketConnected ? 'bg-primary animate-pulse' : 'bg-faint-foreground'}`} />
              <span className="text-sm font-medium">WebSocket</span>
            </div>
            <span className={`text-xs font-medium ${isWebSocketConnected ? 'text-primary' : 'text-muted-foreground'}`}>
              {isWebSocketConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {health?.services.ai && (
            <div
              className={`flex sm:flex-row flex-col sm:justify-between sm:items-center gap-2 p-3 rounded-lg border ${
                health.services.ai.status === 'active'
                  ? 'bg-ai-muted border-ai-line'
                  : health.services.ai.status === 'error'
                    ? 'bg-destructive/10 border-destructive-line'
                    : 'bg-muted border-border'
              }`}
            >
              <div className="flex flex-shrink-0 gap-2 items-center">
                <div className={`w-2 h-2 flex-shrink-0 rounded-full ${health.services.ai.status === 'active' ? 'bg-ai animate-pulse' : health.services.ai.status === 'error' ? 'bg-destructive' : 'bg-faint-foreground'}`} />
                <span className="text-sm font-medium whitespace-nowrap">AI Processing</span>
              </div>
              <span className={`text-xs font-medium break-words ${health.services.ai.status === 'active' ? 'text-ai' : health.services.ai.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {health.services.ai.message ?? health.services.ai.status}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
