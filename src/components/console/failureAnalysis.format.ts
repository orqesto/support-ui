import type { MemoryLimitSource, QueueFailureGroup, QueueRow, QueueStatus } from '@/services/platform.service';

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

/**
 * "1,020 of 3,584 MB (container limit)" — the absolute figures behind a memory percentage.
 *
 * `budget` (backend since 2026-09-16): no container limit applies and the app sized itself —
 * max(2,048 MB, 85% of the host's free memory). Saying "host memory" there would be wrong: the
 * total is not the host's RAM. An unknown value from a newer backend reads as the neutral
 * "memory limit" rather than claiming either.
 */
export const formatMemoryFigures = (
  memory: { used: number; total: number; limitSource: MemoryLimitSource } | null | undefined
): string | null => {
  if (!memory) return null;
  const source =
    memory.limitSource === 'cgroup'
      ? 'container limit'
      : memory.limitSource === 'budget'
        ? 'automatic: 85% of free memory, at least 2,048 MB'
        : memory.limitSource === 'host'
          ? 'host memory, no container limit'
          : 'memory limit';
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

type CpuResources = Pick<
  QueueStatus['resources'],
  'cpu' | 'cpuCores' | 'effectiveCores' | 'cpuSource' | 'processCpu' | 'containerCpu' | 'loadAvg' | 'sampledAt' | 'ticks'
>;

/** "0.08", "1.5", "4" — cores, to two decimals at most; a busy-but-tiny reading is "<0.01", not "0". */
const formatCores = (cores: number): string =>
  cores > 0 && cores < 0.005 ? '<0.01' : cores.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** "1 core", "0.08 cores", "<0.01 cores" — only exactly one is singular. */
const coresNoun = (cores: number): string => (formatCores(cores) === '1' ? 'core' : 'cores');

/** Before the first 10-second tick the backend reports a placeholder 0%, not a measurement. */
const cpuNotMeasuredYet = (resources: CpuResources): boolean =>
  resources.sampledAt === null || resources.ticks === 0;

/**
 * "0.08 of 4 cores (all host cores)" — the cores behind the CPU percentage.
 *
 * The percentage has a different denominator per source (support-service #737): the container's
 * cores for the cgroup counter and load average, the HOST's cores for this process alone. The
 * figure is converted with the denominator it was measured against, so it never claims a share
 * of the wrong total. Null on a backend that does not send the figures, or an unknown source.
 */
export const formatCpuFigures = (resources: CpuResources | null | undefined): string | null => {
  if (!resources?.cpuSource) return null;
  if (cpuNotMeasuredYet(resources)) return 'not measured yet (the first 10-second window is still running)';
  const { cpuSource, cpuCores, effectiveCores, containerCpu, processCpu, loadAvg } = resources;
  // The exact reading the status was picked from (support-service `pickCpu`), not `cpu` — that
  // string is rounded to one decimal, and converting it would disagree with the breakdown below.
  const exact =
    cpuSource === 'container'
      ? containerCpu
      : cpuSource === 'process' || cpuSource === 'host-cgroup'
        ? processCpu
        : undefined;
  const percent = exact ?? Number.parseFloat(resources.cpu);
  if (!Number.isFinite(percent)) return null;

  // Load average is host-wide and counts tasks waiting on disk: it is a load against our cores,
  // never "cores this container used", so it is not written as one.
  if (cpuSource === 'loadavg' && loadAvg !== null && loadAvg !== undefined && effectiveCores) {
    return `load average ${loadAvg.toFixed(2)} against ${formatCores(effectiveCores)} ${coresNoun(effectiveCores)} (whole host; no container counter here)`;
  }
  if (cpuSource === 'container') {
    if (!effectiveCores) return null;
    const used = formatCores((percent / 100) * effectiveCores);
    const limit =
      cpuCores === undefined
        ? 'container cores'
        : effectiveCores < cpuCores
          ? `container limit; the host has ${formatCores(cpuCores)}`
          : 'all host cores';
    return `${used} of ${formatCores(effectiveCores)} ${coresNoun(effectiveCores)} (${limit})`;
  }
  if (cpuSource === 'process' || cpuSource === 'host-cgroup') {
    if (!cpuCores) return null;
    return `${formatCores((percent / 100) * cpuCores)} of ${formatCores(cpuCores)} host ${coresNoun(cpuCores)} (this process only)`;
  }
  return null;
};

const CPU_SOURCE_LABEL: Record<string, string> = {
  container: 'whole container',
  process: 'this process',
  'host-cgroup': 'this process (the container counter is host-wide)',
  loadavg: 'load average (no container counter)',
};

/**
 * Every CPU reading the backend took, in cores, and which one the status is computed from:
 * "whole container 0.08 cores · this process 0.08 cores · load average 0.75 (1 min, whole host) ·
 * status uses whole container". Load average is host-wide and counts tasks waiting on disk, so it
 * can read far above the container on a busy host — it is labelled, never converted to our cores.
 */
export const formatCpuBreakdown = (resources: CpuResources | null | undefined): string | null => {
  if (!resources?.cpuSource || cpuNotMeasuredYet(resources)) return null;
  const { cpuSource, cpuCores, effectiveCores, containerCpu, processCpu, loadAvg } = resources;
  const parts: string[] = [];

  if (cpuSource === 'host-cgroup') parts.push('whole container: not measurable (counter is host-wide)');
  else if (containerCpu === null || containerCpu === undefined || !effectiveCores)
    parts.push('whole container: not measurable here');
  else {
    const cores = (containerCpu / 100) * effectiveCores;
    parts.push(`whole container ${formatCores(cores)} ${coresNoun(cores)}`);
  }

  if (processCpu !== undefined && cpuCores) {
    const cores = (processCpu / 100) * cpuCores;
    parts.push(`this process ${formatCores(cores)} ${coresNoun(cores)}`);
  }
  if (loadAvg !== null && loadAvg !== undefined) parts.push(`load average ${loadAvg.toFixed(2)} (1 min, whole host)`);
  parts.push(`status uses ${CPU_SOURCE_LABEL[cpuSource] ?? cpuSource}`);
  return parts.join(' · ');
};

/** "340 ms", "2.4 s", "12 min", "3 h 10 min" — a job's run or wait time. */
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/**
 * Jobs a queue still has to start. `prioritized` is a separate BullMQ set that `waiting` does not
 * count — `process-message` once read "waiting: 0" while 211 jobs sat there (support-service
 * queueController). Absent on an older backend, where `waiting` is all there is.
 */
export const queuedJobs = (queue: Pick<QueueRow, 'waiting' | 'prioritized'>): number =>
  queue.waiting + (queue.prioritized ?? 0);

/**
 * "~12 min", "under a minute", "last finished 3 h ago" — how long the jobs waiting now will take at
 * the pace the queue finished jobs over the last hour (support-service queueTiming.ts: up to 100
 * retained finishes, measured up to now). The pace is observed, so throttling, the heavy-job cap and
 * rate limiters are already in it; quiet spells make it read LONG. On prod 2026-09-23 it said
 * ~11.7 min for process-kb-message while its oldest waiting job had waited 12.3 min.
 * Null when nothing is waiting, or (unless paused) the backend sends no timing — nothing to say.
 *
 * ⚠️ No estimate never claims the queue is stuck. An empty record is not "nothing finished":
 * `sync-confluence` jobs are added with `removeOnComplete: { count: 0 }`, so they leave no record at
 * all however many finish. Each reason says only what the record shows.
 */
export const estimateClearTime = (
  queue: Pick<QueueRow, 'waiting' | 'prioritized' | 'paused' | 'timing'>,
  now: number = Date.now()
): string | null => {
  const queued = queuedJobs(queue);
  if (queued === 0) return null;
  if (queue.paused) return 'paused';
  if (!queue.timing) return null;
  const { finishesPerMinute, rateSample } = queue.timing;
  if (finishesPerMinute && finishesPerMinute > 0) {
    const minutes = queued / finishesPerMinute;
    const estimate = minutes < 1 ? 'under a minute' : `~${formatDuration(minutes * 60_000)}`;
    // How much record the pace rests on: a few minutes of one burst is a thin basis, and says so.
    const span = queue.timing.rateSpanMs;
    return typeof span === 'number' && span > 0 ? `${estimate} (from ${formatDuration(span)} of history)` : estimate;
  }
  if (rateSample > 0) return 'too few recent jobs to estimate';
  const lastFinished = queue.timing.lastFinishedAt ? Date.parse(queue.timing.lastFinishedAt) : Number.NaN;
  return Number.isFinite(lastFinished)
    ? `last finished ${formatDuration(Math.max(0, now - lastFinished))} ago`
    : 'no finished jobs on record';
};

/**
 * "12 min", "≥ 12 min" — how long the longest-waiting job has waited. Measured, not estimated, so it
 * is the check on "clears in": a queue whose oldest job has waited 40 min does not clear in 2.
 * "≥" when the backend could only read some priority bands; "—" when nothing waits or it could not read.
 */
export const formatOldestWaiting = (queue: Pick<QueueRow, 'oldestWaitingMs' | 'oldestWaitingExact'>): string => {
  if (typeof queue.oldestWaitingMs !== 'number') return '—';
  const age = formatDuration(queue.oldestWaitingMs);
  return queue.oldestWaitingExact === false ? `≥ ${age}` : age;
};
