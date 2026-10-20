import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ProcessCpuTable } from '@/components/console/ProcessCpuTable';
import {
  formatCpuBreakdown,
  formatCpuFigures,
  formatMemoryBreakdown,
  formatMemoryFigures,
} from '@/components/console/failureAnalysis.format';
import type { QueueStatus } from '@/services/platform.service';

const RESOURCE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  healthy: 'success',
  ok: 'success',
  warning: 'warning',
  critical: 'danger',
  degraded: 'warning',
};

/**
 * CPU, memory and status of ONE backend process. Rendered once in a single-container setup, and
 * twice when the queues run in their own worker container — once for the app, once for the worker.
 */
export const ResourceSummary = ({ resources }: { resources: QueueStatus['resources'] }) => (
  <>
    <div className="flex flex-wrap gap-6 text-sm">
      <div className="flex gap-2 items-center">
        <Cpu className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">CPU</span>
        <span className="font-medium text-foreground">{resources.cpu}</span>
        {formatCpuFigures(resources) ? (
          <span className="text-xs text-muted-foreground">{formatCpuFigures(resources)}</span>
        ) : null}
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-muted-foreground">Memory</span>
        <span className="font-medium text-foreground">{resources.memory}</span>
        {formatMemoryFigures(resources.memoryMB) ? (
          <span className="text-xs text-muted-foreground">
            {formatMemoryFigures(resources.memoryMB)}
          </span>
        ) : null}
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-muted-foreground">Status</span>
        <Badge variant={RESOURCE_VARIANT[resources.status] ?? 'secondary'}>
          {resources.status}
        </Badge>
      </div>
      {resources.throttling && <Badge variant="warning">throttling</Badge>}
    </div>
    {formatCpuBreakdown(resources) ? (
      <p className="text-xs text-muted-foreground">
        CPU in cores: {formatCpuBreakdown(resources)}.
      </p>
    ) : null}
    {formatMemoryBreakdown(resources.process) ? (
      <p className="text-xs text-muted-foreground">
        Resident memory: {formatMemoryBreakdown(resources.process)}. Native memory is what a locally
        loaded embedding model occupies; it does not shrink when the queues are idle.
      </p>
    ) : null}
    <ProcessCpuTable report={resources.processes} />
  </>
);
