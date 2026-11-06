/**
 * Console → System: the queue and CPU status (`QueueStatus`, read by platform.service's
 * `getQueueStatus`), and the worker container's and the database's figures it holds
 * (support-service workerSnapshot.ts / databaseStatus.ts). The types moved here from
 * platform.service in modularity task F2, so the two files no longer import each other.
 */

/**
 * Where the backend's memory total comes from. `budget` = sized automatically by the app
 * (backend 2026-09-16). Open-ended so a newer backend's value is carried, not rejected.
 */
export type ProcessCpu = {
  pid: number;
  name: string;
  role: 'backend' | 'embedding' | 'other';
  cores: number | null;
  percent: number | null;
  rssMB: number | null;
};

export type ProcessCpuReport =
  | { available: true; processes: ProcessCpu[]; intervalMs: number | null }
  | { available: false; reason: string };

export type MemoryLimitSource = 'cgroup' | 'budget' | 'host' | (string & {});

/**
 * Which reading the CPU status is computed from (support-service #737): `container` the whole
 * container's cgroup counter, `process` this process alone, `host-cgroup` the process because the
 * only cgroup counter is host-wide, `loadavg` load average when no cgroup reading exists.
 */
export type CpuSource = 'container' | 'host-cgroup' | 'process' | 'loadavg' | (string & {});

/**
 * How long a queue's recent jobs took and how fast it is clearing (support-service queueTiming.ts):
 * the newest ≤20 finished jobs, and the finish rate over those that finished in the last hour.
 */
export type QueueTiming = {
  sampled: number;
  medianRunMs: number | null;
  slowestRunMs: number | null;
  medianWaitMs: number | null;
  lastFinishedAt: string | null;
  finishesPerMinute: number | null;
  rateSample: number;
  /** How much history the rate rests on (oldest counted finish → now). Absent on an older backend. */
  rateSpanMs?: number | null;
};

export type QueueRow = {
  name: string;
  /** The `wait` list only — jobs added with a priority are in `prioritized`, not here. */
  waiting: number;
  prioritized?: number;
  delayed?: number;
  paused?: boolean;
  active: number;
  completed: number;
  failed: number;
  total: number;
  /** Absent on a backend without per-queue timing; null when the read failed. */
  timing?: QueueTiming | null;
  /** How long the longest-waiting job has waited — measured. Null when nothing waits or the read failed. */
  oldestWaitingMs?: number | null;
  /** False when more priority bands existed than were read: the age is then a floor. */
  oldestWaitingExact?: boolean;
};

/** One minute of one queue, as the queue-health monitor stored it (support-service queueHealth.ts). */
export type QueueHistorySample = {
  at: number;
  queued: number;
  active: number;
  failed: number;
  paused: boolean;
  finishesPerMinute: number | null;
  medianRunMs: number | null;
  oldestWaitingMs: number | null;
  lastFinishedAt: number | null;
};

export type QueueStatus = {
  resources: {
    cpu: string;
    memory: string;
    status: string;
    throttling: boolean;
    /**
     * CPU figures behind `cpu` (support-service #737; absent on an older backend).
     * `processCpu` is a % of `cpuCores` (the host's cores); `containerCpu` and a load-average
     * `cpu` are a % of `effectiveCores` (the container's quota, capped by the host).
     */
    cpuCores?: number;
    effectiveCores?: number;
    cpuSource?: CpuSource;
    processCpu?: number;
    containerCpu?: number | null;
    /** 1-minute load average, host-wide; null off Linux. */
    loadAvg?: number | null;
    /** When the 10-second resource tick last measured; null before the first one. */
    sampledAt?: string | null;
    ticks?: number;
    /** Absent on a backend older than support-service #675. */
    memoryMB?: { used: number; total: number; limitSource: MemoryLimitSource } | null;
    process?: {
      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
      externalMB: number;
      arrayBuffersMB: number;
    } | null;
    throttleFactor: number;
    /**
     * Which processes in the container use the CPU (support-service processCpu.ts). Absent on
     * an older backend; `cores`/`percent` are null on the first sample after a restart.
     */
    processes?: ProcessCpuReport;
  };
  /** The in-memory embedding queue; `model.threads` from 2026-10-28 (readEmbeddingStatus). */
  embeddingQueue?: unknown;
  scaling: unknown;
  workers: unknown;
  queues: QueueRow[];
  /**
   * `api` = this process serves HTTP only and the queues run in a separate worker container,
   * whose numbers are in `worker` (null = no worker is reporting). Absent on an older backend.
   */
  role?: 'all' | 'api' | 'worker';
  worker?: WorkerSnapshot | null;
  /** Load on the shared database, sampled with the request. Absent on an older backend. */
  database?: DatabaseStatus | null;
};

/** What the worker container publishes about itself (support-service workerSnapshot.ts). */
export type WorkerSnapshot = {
  sampledAt: string;
  resources: Omit<QueueStatus['resources'], 'cpu' | 'memory' | 'processes'> & {
    cpuUsage: number;
    memoryUsage: number;
  };
  processes?: ProcessCpuReport;
  workers?: Array<{ jobType: string; isRunning: boolean }>;
};

/** The worker's figures in the shape the api reports its own in, so one summary renders both. */
export const workerResources = (snapshot: WorkerSnapshot): QueueStatus['resources'] => {
  const { cpuUsage, memoryUsage, ...rest } = snapshot.resources;
  return {
    ...rest,
    cpu: `${cpuUsage.toFixed(1)}%`,
    memory: `${memoryUsage.toFixed(1)}%`,
    processes: snapshot.processes,
  };
};

/** support-service databaseStatus.ts. `rates` is null on the first sample after a restart. */
export type DatabaseStatus = {
  sampledAt: string;
  sizeMB: number;
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waitingOnLock: number;
    max: number;
    utilizationPct: number;
  };
  longestActiveSeconds: number | null;
  longestIdleInTransactionSeconds: number | null;
  longestQueries: Array<{
    pid: number;
    state: string | null;
    waitEvent: string | null;
    seconds: number;
    query: string;
  }>;
  rates: {
    windowSeconds: number;
    commitsPerSecond: number;
    rollbacksPerSecond: number;
    cacheHitPct: number | null;
    tempMBWritten: number;
    deadlocks: number;
  } | null;
};
