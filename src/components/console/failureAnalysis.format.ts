import type { QueueFailureGroup } from '@/services/platform.service';

/** Epoch millis → local date-time, or a dash when the queue kept no timestamp. */
export const formatFailedAt = (millis: number | null): string => {
  if (millis === null || !Number.isFinite(millis)) return '—';
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

/** "org 21" / "no workspace" — the label a workspace count wears in the analysis table. */
export const formatWorkspace = (organizationId: number | null): string =>
  organizationId === null ? 'no workspace' : `org ${organizationId}`;

/** "8 jobs" / "1 job" */
export const formatJobCount = (count: number): string => `${count} ${count === 1 ? 'job' : 'jobs'}`;

/**
 * One line to confirm a bulk action with: what it does, to how many, from where.
 * Names the queues so "retry 9 jobs" cannot be mistaken for one queue's worth.
 */
export const describeGroupAction = (action: 'retry' | 'remove', group: QueueFailureGroup): string => {
  const queues = group.queues.map((queue) => queue.name).join(', ');
  const verb = action === 'retry' ? 'Retry' : 'Remove';
  return `${verb} ${formatJobCount(group.jobs.length)} in ${queues}?`;
};

/** "1,020 of 3,584 MB (container limit)" — the absolute figures behind a memory percentage. */
export const formatMemoryFigures = (
  memory: { used: number; total: number; limitSource: 'cgroup' | 'host' } | null | undefined
): string | null => {
  if (!memory) return null;
  const source = memory.limitSource === 'cgroup' ? 'container limit' : 'host memory, no container limit';
  return `${memory.used.toLocaleString()} of ${memory.total.toLocaleString()} MB (${source})`;
};

/**
 * Where the resident memory goes: JavaScript heap vs native memory (addons — the local
 * embedding model on a box that runs one) vs the rest (code space, stacks, allocator slack).
 */
export const formatMemoryBreakdown = (
  process: { rssMB: number; heapUsedMB: number; externalMB: number; arrayBuffersMB: number } | null | undefined
): string | null => {
  if (!process) return null;
  const native = process.externalMB + process.arrayBuffersMB;
  const rest = Math.max(0, process.rssMB - process.heapUsedMB - native);
  return `heap ${process.heapUsedMB.toLocaleString()} MB · native ${native.toLocaleString()} MB · other ${rest.toLocaleString()} MB`;
};
