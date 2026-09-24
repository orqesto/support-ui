import { Badge } from '@/components/ui/Badge';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import type { ProcessCpu, ProcessCpuReport } from '@/services/platform.service';

const ROLE_LABEL = { backend: 'Backend', embedding: 'Embedding model', other: 'Other' } as const;

const columns: ColumnDef<ProcessCpu>[] = [
  {
    id: 'process',
    header: 'Process',
    card: 'title',
    cell: (row) => (
      <span className="font-mono text-xs">
        {row.name} <span className="text-muted-foreground">#{row.pid}</span>
      </span>
    ),
  },
  {
    id: 'role',
    header: 'Role',
    cell: (row) => (
      <Badge variant={row.role === 'other' ? 'secondary' : 'default'}>{ROLE_LABEL[row.role]}</Badge>
    ),
  },
  {
    id: 'cores',
    header: 'CPU (cores)',
    align: 'right',
    cell: (row) => (row.cores === null ? 'measuring…' : row.cores.toFixed(2)),
  },
  {
    id: 'share',
    header: 'Share of container',
    align: 'right',
    cell: (row) => (row.percent === null ? '—' : `${row.percent}%`),
  },
  {
    id: 'memory',
    header: 'Memory',
    align: 'right',
    cell: (row) => (row.rssMB === null ? '—' : `${row.rssMB} MB`),
  },
];

/**
 * Which processes in the backend's container use the CPU.
 *
 * The container CPU figure above counts every process in it, but the throttle only limits the
 * jobs the backend itself starts — taco read 97% with the backend at 8–14%, and nothing on this
 * page could say where the rest went. `cores` is null on the first sample after a restart.
 */
export const ProcessCpuTable = ({ report }: { report?: ProcessCpuReport }) => {
  if (!report) return null;
  if (!report.available) {
    return (
      <p className="text-xs text-muted-foreground">Per-process CPU unavailable ({report.reason}).</p>
    );
  }
  return (
    <div className="space-y-1">
      <DataTable
        rows={report.processes}
        rowKey={(row) => row.pid}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 25 }}
        empty={{ message: 'No processes reported.' }}
      />
      {report.intervalMs === null ? (
        <p className="text-xs text-muted-foreground">
          First sample since the backend started — CPU shows on the next refresh.
        </p>
      ) : null}
    </div>
  );
};
